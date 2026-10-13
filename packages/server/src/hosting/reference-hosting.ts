/**
 * Hosts the reference roles on the playground's own port, so phones, Mimoto and the playground's
 * roles all reach them over HTTP:
 *
 * | Path            | What                                                         | Package                      |
 * | --------------- | ------------------------------------------------------------ | ---------------------------- |
 * | `/ref/issuer`   | OpenID4VCI reference issuer (`/draft13` and `/v1` profiles)  | `@inji-playground/oid4vci`   |
 * | `/ref/as`       | Test authorization server (stands in for eSignet)            | `@inji-playground/oid4vci`   |
 * | `/ref/verifier` | OpenID4VP reference verifier (request objects, direct_post)  | `@inji-playground/oid4vp`    |
 *
 * plus the RFC 8615 "insert" well-known URLs at the host root. Scenarios that probe another issuer DID
 * method use a second issuer on the same keys under `/ref/issuer/did-key` or `/ref/issuer/did-jwk`
 * (`issuerFor`); the issuer DID is a property of the issuer, not of one offer.
 *
 * Keys live in `$PLAYGROUND_RUN_DIR/keys/` (outside git) and are created on first start, so the
 * issuer's and verifier's DIDs stay the same across restarts. A server on an in-memory database keeps
 * nothing after it stops, and its keys follow: they are generated in memory (tests).
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import formbody from '@fastify/formbody';
import {
  PLAYGROUND_CONTEXT_V1,
  PLAYGROUND_CONTEXT_V1_URL,
  createDidResolver,
  createDocumentLoader,
  generateKeyPair,
  loadOrCreateKeyPair,
  type DidResolver,
  type DocumentLoader,
  type KeyAlgorithm,
  type KeyPair,
} from '@inji-playground/formats';
import {
  DEFAULT_CONFIGURATIONS,
  createReferenceIssuer,
  createTestAuthorizationServer,
  generateAsSigningKey,
  registerRootWellKnown,
  type IssuerDidMethod,
  type RegisteredClient,
  type ReferenceIssuer,
  type TestAuthorizationServer,
} from '@inji-playground/oid4vci';
import { ReferenceVerifier, registerVerifierRoutes } from '@inji-playground/oid4vp';
import type { FastifyInstance } from 'fastify';

/** DID methods with a variant issuer next to the main one. */
const VARIANT_DID_METHODS: readonly IssuerDidMethod[] = ['did:key', 'did:jwk'];

/** Scopes of certify-ac's FarmerCredential (csvdp-farmer sample), FarmerSdJwt and FarmerMdoc (seed-ac); their tokens are for certify-ac. */
export const CERTIFY_AC_SCOPES = ['mock_identity_vc_ldp', 'farmer_sd_jwt', 'farmer_mdoc'];
/** Client id Mimoto uses at the test authorization server (config/mimoto-issuers-config.json). */
export const MIMOTO_CLIENT_ID = 'ps02-mimoto';

/** Client id of the reference wallet at the test authorization server (wallet-initiated issuance). */
export const REFERENCE_WALLET_CLIENT_ID = 'playground-reference-wallet';

export interface ReferenceHostingOptions {
  /** Public base URL of the playground, for example `http://localhost:28100`. */
  publicUrl: string;
  /** Folder for key files; `undefined` keeps keys in memory only. */
  keysDir?: string;
  issuerDidMethod: IssuerDidMethod;
  /**
   * `fetch` the reference verifier uses to resolve did:web documents. It is read lazily, so the host
   * can pass a transport that only exists once the Fastify instance does.
   */
  fetch?: () => typeof globalThis.fetch;
  /**
   * Lets the JSON-LD document loader fetch contexts that are not pinned, caching them in `cacheDir`.
   * Off by default (reference runs need none); live runs need it because Inji Certify's sample farmer
   * credential uses a context published on a personal GitHub Pages site.
   */
  remoteContexts?: { cacheDir: string };
  /**
   * Other resources the test authorization server issues access tokens for (Inji Certify in authorization
   * code mode, certify-ac): tokens for these scopes carry this audience instead of the reference issuer's.
   */
  extraResources?: ReadonlyArray<{ scopes: string[]; audience: string }>;
  /** Other clients of the test authorization server (Mimoto, with its private_key_jwt key). */
  extraClients?: RegisteredClient[];
  /** Issuer DIDs the reference verifier accepts besides the reference issuers' own (Inji Certify, outside issuers). */
  trustedIssuers?: readonly string[];
  /** did:web hosts that may be private addresses (formats' `DidWebOptions.allowedHosts`). */
  didWebAllowedHosts?: readonly string[];
}

export interface ReferenceHosting {
  readonly publicUrl: string;
  /** The issuer at `/ref/issuer`, signing with the configured DID method. */
  readonly issuer: ReferenceIssuer;
  /** The issuer signing with `method`: the main one, or the variant for a DID-method probe. */
  issuerFor(method: IssuerDidMethod): ReferenceIssuer | undefined;
  readonly authorizationServer: TestAuthorizationServer;
  readonly verifier: ReferenceVerifier;
  readonly didResolver: DidResolver;
  readonly documentLoader: DocumentLoader;
  /** Base URLs of the three hosted roles. */
  readonly urls: { issuer: string; as: string; verifier: string; walletCallback: string };
  /** Registers the routes; call it after the inbound recorder is installed. */
  register(app: FastifyInstance): Promise<void>;
}

export async function createReferenceHosting(options: ReferenceHostingOptions): Promise<ReferenceHosting> {
  const publicUrl = options.publicUrl.replace(/\/+$/, '');
  const urls = {
    issuer: `${publicUrl}/ref/issuer`,
    as: `${publicUrl}/ref/as`,
    verifier: `${publicUrl}/ref/verifier`,
    walletCallback: `${publicUrl}/ref/wallet/callback`,
  };
  const key = (name: string, alg: KeyAlgorithm): Promise<KeyPair> =>
    options.keysDir ? loadOrCreateKeyPair(options.keysDir, name, alg) : Promise.resolve(generateKeyPair(alg));

  const [issuerEd25519, issuerP256, verifierKey, asKey] = await Promise.all([
    key('ref-issuer-ed25519', 'EdDSA'),
    key('ref-issuer-p256', 'ES256'),
    key('ref-verifier-ed25519', 'EdDSA'),
    loadOrCreateAsKey(options.keysDir),
  ]);

  // A did:web on this server is resolved from this server: the override sends the DID's host to the
  // public URL (formats only allows overrides for localhost and *.ps02.test).
  const didWebHost = new URL(publicUrl).host;
  const overridable = /^localhost(:\d+)?$|\.ps02\.test(:\d+)?$/.test(didWebHost);
  const didResolver = createDidResolver({
    ...(overridable ? { hostOverrides: { [didWebHost]: publicUrl } } : {}),
    ...(options.didWebAllowedHosts ? { allowedHosts: options.didWebAllowedHosts } : {}),
    ...(options.fetch ? { fetch: (url: string, init?: RequestInit) => options.fetch!()(url, init) } : {}),
  });
  const documentLoader = createDocumentLoader({
    didResolver,
    ...(options.remoteContexts ? { network: { cacheDir: options.remoteContexts.cacheDir } } : {}),
  });

  const authorizationServer = await createTestAuthorizationServer({
    issuer: urls.as,
    signingKey: asKey,
    clients: [
      {
        clientId: REFERENCE_WALLET_CLIENT_ID,
        redirectUris: [urls.walletCallback],
        authMethod: 'none',
      },
      ...(options.extraClients ?? []),
    ],
    scopesSupported: [
      'openid',
      ...DEFAULT_CONFIGURATIONS.map((configuration) => configuration.scope),
      ...(options.extraResources ?? []).flatMap((resource) => resource.scopes),
    ],
    audience: (scopes) =>
      options.extraResources?.find((resource) => resource.scopes.some((scope) => scopes.includes(scope)))
        ?.audience ?? urls.issuer,
  });
  const issuerAt = (baseUrl: string, didMethod: IssuerDidMethod): ReferenceIssuer =>
    createReferenceIssuer({
      baseUrl,
      keys: { ed25519: issuerEd25519, p256: issuerP256 },
      didMethod,
      authorizationServer: { issuer: authorizationServer.issuer, jwks: authorizationServer.jwks() },
    });
  const issuer = issuerAt(urls.issuer, options.issuerDidMethod);
  // did:key and did:jwk resolve offline, so their variants work with every verifier; a did:web variant
  // would need its own TLS name for Inji Verify (gap G2) and no scenario asks for one.
  const issuers = new Map<IssuerDidMethod, ReferenceIssuer>([[options.issuerDidMethod, issuer]]);
  for (const method of VARIANT_DID_METHODS) {
    if (!issuers.has(method))
      issuers.set(method, issuerAt(`${urls.issuer}/${method.replace(':', '-')}`, method));
  }
  const verifier = new ReferenceVerifier({
    baseUrl: urls.verifier,
    signingKey: verifierKey,
    didResolver,
    documentLoader,
    clientName: 'Playground reference verifier',
  });
  // The reference issuers' mdoc IACA roots are trust anchors of the reference verifier, through the same
  // list that holds Inji Certify's certificates (ISO/IEC 18013-5 section 9.3.1 step 1).
  verifier.addX5cTrustAnchors(
    (await Promise.all([...issuers.values()].map((hosted) => hosted.mdocTrustAnchors()))).flat(),
  );
  // DID issuers the verifier accepts: the reference issuers and the configured ones. Without a list any DID
  // would do, so a holder could present a credential it signed itself (scenario self-issued).
  verifier.addTrustedIssuers([
    ...[...issuers.values()].flatMap((hosted) => Object.values(hosted.dids())),
    ...(options.trustedIssuers ?? []),
  ]);

  return {
    publicUrl,
    issuer,
    issuerFor: (method) => issuers.get(method),
    authorizationServer,
    verifier,
    didResolver,
    documentLoader,
    urls,
    async register(app) {
      for (const hosted of issuers.values()) {
        await app.register(hosted.plugin, { prefix: new URL(hosted.baseUrl).pathname });
      }
      await app.register(authorizationServer.plugin, { prefix: new URL(urls.as).pathname });
      await app.register(async (scope) => {
        // OpenID4VP direct_post responses are form-encoded.
        await scope.register(formbody);
        registerVerifierRoutes(scope, verifier, new URL(urls.verifier).pathname);
      });
      // The reference credentials' JSON-LD context, at the path of its URL, for verifiers outside the
      // playground (Inji Verify reaches it as https://playground.ps02.test through the TLS front).
      app.get(new URL(PLAYGROUND_CONTEXT_V1_URL).pathname, async (_request, reply) =>
        reply.type('application/ld+json').header('cache-control', 'max-age=3600').send(PLAYGROUND_CONTEXT_V1),
      );
      registerRootWellKnown(app, [
        ...[...issuers.values()].flatMap((hosted) => hosted.wellKnownDocuments),
        ...authorizationServer.wellKnownDocuments,
      ]);
    },
  };
}

type AsJwk = Awaited<ReturnType<typeof generateAsSigningKey>>;

/** The test authorization server's RS256 key, as a private JWK file next to the other keys. */
async function loadOrCreateAsKey(keysDir: string | undefined): Promise<AsJwk> {
  if (!keysDir) return generateAsSigningKey('RS256');
  const path = join(keysDir, 'ref-as-rs256.jwk.json');
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AsJwk;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const jwk = await generateAsSigningKey('RS256');
  await mkdir(keysDir, { recursive: true });
  await writeFile(path, `${JSON.stringify(jwk, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return jwk;
}
