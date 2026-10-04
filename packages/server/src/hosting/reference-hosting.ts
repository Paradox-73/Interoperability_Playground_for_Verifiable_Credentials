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
 * plus the RFC 8615 "insert" well-known URLs at the host root.
 *
 * Keys live in `$PLAYGROUND_RUN_DIR/keys/` (outside git) and are created on first start, so the
 * issuer's and verifier's DIDs stay the same across restarts. A server on an in-memory database keeps
 * nothing after it stops, and its keys follow: they are generated in memory (tests).
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import formbody from '@fastify/formbody';
import {
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
  type ReferenceIssuer,
  type TestAuthorizationServer,
} from '@inji-playground/oid4vci';
import { ReferenceVerifier, registerVerifierRoutes } from '@inji-playground/oid4vp';
import type { FastifyInstance } from 'fastify';

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
}

export interface ReferenceHosting {
  readonly publicUrl: string;
  readonly issuer: ReferenceIssuer;
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
    ...(options.fetch ? { fetch: (url: string, init?: RequestInit) => options.fetch!()(url, init) } : {}),
  });
  const documentLoader = createDocumentLoader({ didResolver });

  const authorizationServer = await createTestAuthorizationServer({
    issuer: urls.as,
    signingKey: asKey,
    clients: [
      {
        clientId: REFERENCE_WALLET_CLIENT_ID,
        redirectUris: [urls.walletCallback],
        authMethod: 'none',
      },
    ],
    scopesSupported: ['openid', ...DEFAULT_CONFIGURATIONS.map((configuration) => configuration.scope)],
    audience: urls.issuer,
  });
  const issuer = createReferenceIssuer({
    baseUrl: urls.issuer,
    keys: { ed25519: issuerEd25519, p256: issuerP256 },
    didMethod: options.issuerDidMethod,
    authorizationServer: { issuer: authorizationServer.issuer, jwks: authorizationServer.jwks() },
  });
  const verifier = new ReferenceVerifier({
    baseUrl: urls.verifier,
    signingKey: verifierKey,
    didResolver,
    documentLoader,
    clientName: 'Playground reference verifier',
  });

  return {
    publicUrl,
    issuer,
    authorizationServer,
    verifier,
    didResolver,
    documentLoader,
    urls,
    async register(app) {
      await app.register(issuer.plugin, { prefix: new URL(urls.issuer).pathname });
      await app.register(authorizationServer.plugin, { prefix: new URL(urls.as).pathname });
      await app.register(async (scope) => {
        // OpenID4VP direct_post responses are form-encoded.
        await scope.register(formbody);
        registerVerifierRoutes(scope, verifier, new URL(urls.verifier).pathname);
      });
      registerRootWellKnown(app, [...issuer.wellKnownDocuments, ...authorizationServer.wellKnownDocuments]);
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
