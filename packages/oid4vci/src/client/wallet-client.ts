// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Wallet side of OpenID4VCI: receives credentials from any issuer that speaks draft 13 or 1.0, Inji
 * Certify or the reference issuer.
 *
 * Every HTTP request goes through the `fetch` the caller passes in (the playground's recording
 * client), and `onStep` is called before each protocol step, so the run timeline and the inspector
 * see every exchange under the right step.
 *
 * - `acceptOffer`: credential offer (by value or by reference) -> issuer metadata -> authorization
 *   server metadata -> pre-authorized code token request -> nonce -> credential request.
 * - `fetchViaAuthorizationCode`: wallet-initiated flow with an authorization code, PKCE S256 and a
 *   headless browser step (the test authorization server approves at once), client authentication
 *   `none` or `private_key_jwt`.
 */
import { SignJWT, importJWK, type CryptoKey, type JWK } from 'jose';
import type { StepId, VciProfile } from '@inji-playground/protocol';
import {
  AUTHORIZATION_CODE_GRANT,
  JWT_BEARER_ASSERTION_TYPE,
  PRE_AUTHORIZED_CODE_GRANT,
  WELL_KNOWN,
  wellKnownUrl,
} from '../common/constants.js';
import { Oid4vciClientError, type ClientErrorCode } from '../common/errors.js';
import { epochSeconds, pkceChallenge, randomToken, systemClock, type Clock } from '../common/util.js';
import { createHolderKey, createProofJwt, ed25519AlgNameFor, type HolderKey } from './holder.js';
import {
  parseAuthorizationServerMetadata,
  parseCredentialOffer,
  parseIssuerMetadata,
  type AuthorizationServerMetadata,
  type CredentialOffer,
  type IssuerMetadata,
} from './messages.js';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** HTTP client; the playground passes its recording fetch. Default: global fetch. */
  fetch?: FetchFn;
  /** Holder key; default a fresh ES256 key with a did:jwk `kid`. */
  holderKey?: HolderKey;
  /**
   * Picks the holder key from the first requested configuration of the issuer metadata (its `format`),
   * when the configuration id does not tell the format. Takes precedence over `holderKey`.
   */
  holderKeyFor?: (configuration: Record<string, unknown>) => HolderKey;
  /** Protocol version; default detected from metadata (`nonce_endpoint` present = 1.0). */
  profile?: VciProfile;
  /** Called before each protocol step. */
  onStep?: (step: StepId) => void;
  /** Changes to the proof JWT (tamper scenarios). */
  proofOverrides?: { header?: Record<string, unknown>; payload?: Record<string, unknown> };
  clock?: Clock;
}

export interface AcceptOfferOptions extends ClientOptions {
  /** Transaction code the person was shown, when the offer asks for one. */
  txCode?: string;
  /** Which offered configurations to request; default all. */
  configurationIds?: string[];
}

export interface ClientAuthentication {
  method: 'none' | 'private_key_jwt';
  /** Private JWK for `private_key_jwt` (RSA, EC or OKP). */
  privateJwk?: JWK;
  /** Its JOSE algorithm, for example `RS256` or `ES256`. */
  alg?: string;
}

export interface AuthorizationCodeOptions extends ClientOptions {
  configurationId: string;
  clientId: string;
  redirectUri: string;
  clientAuth?: ClientAuthentication;
  /** Default: the configuration's `scope`. */
  scope?: string;
  /** Picks a test identity at the test authorization server. */
  loginHint?: string;
}

export interface ReceivedCredential {
  configurationId: string;
  /** The configuration's `format`, for example `ldp_vc` or `vc+sd-jwt` (any string the issuer uses). */
  format: string;
  /** ldp_vc: the JSON object; SD-JWT VC: the compact string. */
  credential: unknown;
  /** The credential as text (JSON for ldp_vc), for storage and size measurement. */
  raw: string;
}

export interface IssuanceResult {
  profile: VciProfile;
  credentialIssuer: string;
  offer?: CredentialOffer;
  issuerMetadata: IssuerMetadata;
  authorizationServerMetadata: AuthorizationServerMetadata;
  tokenResponse: Record<string, unknown>;
  credentials: ReceivedCredential[];
  holderKey: HolderKey;
}

interface Context {
  fetch: FetchFn;
  clock: Clock;
  holderKey: HolderKey;
  options: ClientOptions;
  step(step: StepId): void;
}

function context(options: ClientOptions): Context {
  const fetchFn: FetchFn = options.fetch ?? ((url, init) => fetch(url, init));
  return {
    fetch: fetchFn,
    clock: options.clock ?? systemClock,
    holderKey: options.holderKey ?? createHolderKey(),
    options,
    step: (step) => options.onStep?.(step),
  };
}

/** Accepts a credential offer with the pre-authorized code grant. */
export async function acceptOffer(
  offerUri: string,
  options: AcceptOfferOptions = {},
): Promise<IssuanceResult> {
  const ctx = context(options);
  ctx.step('issuer.offer');
  const offer = await resolveCredentialOffer(offerUri, ctx);
  const grant = offer.grants?.[PRE_AUTHORIZED_CODE_GRANT];
  if (!grant) {
    throw new Oid4vciClientError('GRANT_UNSUPPORTED', 'the offer has no pre-authorized code grant', {
      step: 'issuer.offer',
      details: { grants: Object.keys(offer.grants ?? {}) },
    });
  }
  if (grant.tx_code && options.txCode === undefined) {
    throw new Oid4vciClientError('TX_CODE_REQUIRED', 'the offer asks for a transaction code (tx_code)', {
      step: 'issuer.offer',
      details: { tx_code: grant.tx_code },
    });
  }
  const metadata = await fetchIssuerMetadata(offer.credential_issuer, ctx);
  const asMetadata = await resolveAuthorizationServer(
    metadata,
    grant.authorization_server,
    PRE_AUTHORIZED_CODE_GRANT,
    ctx,
  );

  ctx.step('token');
  const tokenResponse = await postForm(
    asMetadata.token_endpoint,
    {
      grant_type: PRE_AUTHORIZED_CODE_GRANT,
      'pre-authorized_code': grant['pre-authorized_code'],
      ...(options.txCode === undefined ? {} : { tx_code: options.txCode }),
    },
    ctx,
    'token',
    'TOKEN_FAILED',
  );
  const wanted = options.configurationIds ?? offer.credential_configuration_ids;
  const credentials = await requestCredentials(metadata, tokenResponse, wanted, undefined, ctx);
  return {
    profile: profileOf(metadata, ctx),
    credentialIssuer: metadata.credential_issuer,
    offer,
    issuerMetadata: metadata,
    authorizationServerMetadata: asMetadata,
    tokenResponse,
    credentials,
    holderKey: ctx.holderKey,
  };
}

/** Wallet-initiated issuance with the authorization code grant and PKCE S256. */
export async function fetchViaAuthorizationCode(
  credentialIssuer: string,
  options: AuthorizationCodeOptions,
): Promise<IssuanceResult> {
  const ctx = context(options);
  const metadata = await fetchIssuerMetadata(credentialIssuer, ctx);
  const configuration = metadata.credential_configurations_supported[options.configurationId];
  if (!configuration) {
    throw new Oid4vciClientError('CONFIGURATION_UNKNOWN', `the issuer offers no ${options.configurationId}`, {
      step: 'issuer.metadata',
    });
  }
  const asMetadata = await resolveAuthorizationServer(metadata, undefined, AUTHORIZATION_CODE_GRANT, ctx);
  if (!asMetadata.authorization_endpoint) {
    throw new Oid4vciClientError(
      'AS_METADATA_INVALID',
      'authorization server has no authorization_endpoint',
      {
        step: 'as.metadata',
      },
    );
  }

  // Front channel: what a browser would do. The test AS approves at once and redirects.
  ctx.step('token');
  const verifier = randomToken(48);
  const state = randomToken(16);
  const authorize = new URL(asMetadata.authorization_endpoint);
  const scope = options.scope ?? (typeof configuration.scope === 'string' ? configuration.scope : undefined);
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
    ...(scope === undefined ? {} : { scope }),
    ...(options.loginHint === undefined ? {} : { login_hint: options.loginHint }),
  };
  for (const [key, value] of Object.entries(params)) authorize.searchParams.set(key, value);
  const response = await send(ctx, authorize.toString(), { method: 'GET', redirect: 'manual' }, 'token');
  const location = response.headers.get('location');
  if (response.status < 300 || response.status >= 400 || !location) {
    throw new Oid4vciClientError(
      'AUTHORIZATION_FAILED',
      `authorization endpoint answered ${response.status} without a redirect`,
      {
        step: 'token',
        status: response.status,
        details: { body: await safeText(response) },
      },
    );
  }
  const redirect = new URL(location, authorize);
  const error = redirect.searchParams.get('error');
  if (error) {
    throw new Oid4vciClientError(
      'AUTHORIZATION_FAILED',
      redirect.searchParams.get('error_description') ?? error,
      {
        step: 'token',
        oauthError: error,
      },
    );
  }
  if (redirect.searchParams.get('state') !== state) {
    throw new Oid4vciClientError('AUTHORIZATION_FAILED', 'state in the redirect differs from the request', {
      step: 'token',
    });
  }
  // RFC 9207 section 2.4: when present, iss must name the server the request went to.
  const iss = redirect.searchParams.get('iss');
  if (iss !== null && iss !== asMetadata.issuer) {
    throw new Oid4vciClientError('AUTHORIZATION_FAILED', `redirect iss ${iss} is not ${asMetadata.issuer}`, {
      step: 'token',
    });
  }
  const code = redirect.searchParams.get('code');
  if (!code) throw new Oid4vciClientError('AUTHORIZATION_FAILED', 'redirect has no code', { step: 'token' });

  const auth = options.clientAuth ?? { method: 'none' };
  const assertion: Record<string, string> =
    auth.method === 'private_key_jwt'
      ? {
          client_assertion_type: JWT_BEARER_ASSERTION_TYPE,
          client_assertion: await clientAssertion(
            options.clientId,
            asMetadata.token_endpoint,
            auth,
            ctx.clock,
          ),
        }
      : {};
  const tokenResponse = await postForm(
    asMetadata.token_endpoint,
    {
      grant_type: AUTHORIZATION_CODE_GRANT,
      code,
      redirect_uri: options.redirectUri,
      code_verifier: verifier,
      client_id: options.clientId,
      ...assertion,
    },
    ctx,
    'token',
    'TOKEN_FAILED',
  );
  const credentials = await requestCredentials(
    metadata,
    tokenResponse,
    [options.configurationId],
    options.clientId,
    ctx,
  );
  return {
    profile: profileOf(metadata, ctx),
    credentialIssuer: metadata.credential_issuer,
    issuerMetadata: metadata,
    authorizationServerMetadata: asMetadata,
    tokenResponse,
    credentials,
    holderKey: ctx.holderKey,
  };
}

/** Reads an offer passed by value or by reference (section 4.1.2 / 4.1.3). */
export async function resolveCredentialOffer(
  offerUri: string,
  options: ClientOptions | Context = {},
): Promise<CredentialOffer> {
  const ctx = 'step' in options ? options : context(options);
  let query: URLSearchParams;
  try {
    const questionMark = offerUri.indexOf('?');
    query = new URLSearchParams(questionMark >= 0 ? offerUri.slice(questionMark + 1) : offerUri);
  } catch (cause) {
    throw new Oid4vciClientError('OFFER_INVALID', 'credential offer URI cannot be parsed', {
      step: 'issuer.offer',
      cause,
    });
  }
  const byValue = query.get('credential_offer');
  const byReference = query.get('credential_offer_uri');
  if ((byValue === null) === (byReference === null)) {
    throw new Oid4vciClientError(
      'OFFER_INVALID',
      'exactly one of credential_offer and credential_offer_uri is required',
      {
        step: 'issuer.offer',
      },
    );
  }
  let json: unknown;
  if (byValue !== null) {
    try {
      json = JSON.parse(byValue);
    } catch (cause) {
      throw new Oid4vciClientError('OFFER_INVALID', 'credential_offer is not JSON', {
        step: 'issuer.offer',
        cause,
      });
    }
  } else {
    const response = await send(
      ctx,
      byReference!,
      { method: 'GET', headers: { accept: 'application/json' } },
      'issuer.offer',
    );
    if (!response.ok) {
      throw new Oid4vciClientError('OFFER_FETCH_FAILED', `credential_offer_uri answered ${response.status}`, {
        step: 'issuer.offer',
        status: response.status,
      });
    }
    json = await readJson(response, 'issuer.offer', 'OFFER_INVALID');
  }
  return parseCredentialOffer(json);
}

/**
 * Fetches issuer metadata: the RFC 8615 "insert" URL first (1.0 section 12.2.2), then the draft 13
 * "append" URL when the identifier has a path and the first answered 404. `credential_issuer` must be
 * exactly the identifier asked for (1.0 section 12.2.3), or the metadata could speak for another issuer.
 */
export async function fetchIssuerMetadata(
  credentialIssuer: string,
  options: ClientOptions | Context = {},
): Promise<IssuerMetadata> {
  const ctx = 'step' in options ? options : context(options);
  ctx.step('issuer.metadata');
  const json = await fetchWellKnown(
    credentialIssuer,
    WELL_KNOWN.credentialIssuer,
    ctx,
    'issuer.metadata',
    'METADATA_FETCH_FAILED',
  );
  const metadata = parseIssuerMetadata(json);
  if (metadata.credential_issuer !== credentialIssuer) {
    throw new Oid4vciClientError(
      'ISSUER_MISMATCH',
      `metadata credential_issuer ${metadata.credential_issuer} differs from ${credentialIssuer}`,
      {
        step: 'issuer.metadata',
        details: { expected: credentialIssuer, received: metadata.credential_issuer },
      },
    );
  }
  return metadata;
}

/**
 * Picks the authorization server the way Inji's VCI client does (`AuthorizationServerResolver.kt`):
 * the only listed server; else the grant's `authorization_server`; else the first listed server that
 * supports the grant; else the credential issuer itself.
 */
async function resolveAuthorizationServer(
  metadata: IssuerMetadata,
  grantServer: string | undefined,
  grantType: string,
  ctx: Context,
): Promise<AuthorizationServerMetadata> {
  ctx.step('as.metadata');
  const servers = metadata.authorization_servers ?? [];
  if (servers.length === 1) return discoverAuthorizationServer(servers[0]!, ctx);
  if (grantServer) return discoverAuthorizationServer(grantServer, ctx);
  for (const server of servers) {
    try {
      const candidate = await discoverAuthorizationServer(server, ctx);
      if (!candidate.grant_types_supported || candidate.grant_types_supported.includes(grantType))
        return candidate;
    } catch {
      // Try the next server; the failed exchange stays in the recording.
    }
  }
  if (servers.length > 0) {
    throw new Oid4vciClientError(
      'AS_METADATA_INVALID',
      `no listed authorization server supports ${grantType}`,
      {
        step: 'as.metadata',
      },
    );
  }
  return discoverAuthorizationServer(metadata.credential_issuer, ctx);
}

async function discoverAuthorizationServer(
  issuer: string,
  ctx: Context,
): Promise<AuthorizationServerMetadata> {
  let json: unknown;
  try {
    json = await fetchWellKnown(
      issuer,
      WELL_KNOWN.oauthAuthorizationServer,
      ctx,
      'as.metadata',
      'AS_METADATA_INVALID',
    );
  } catch (error) {
    // OpenID providers (eSignet) publish only openid-configuration.
    if (!(error instanceof Oid4vciClientError) || error.status !== 404) throw error;
    json = await fetchWellKnown(
      issuer,
      WELL_KNOWN.openidConfiguration,
      ctx,
      'as.metadata',
      'AS_METADATA_INVALID',
    );
  }
  const metadata = parseAuthorizationServerMetadata(json);
  // RFC 8414 section 3.3: the issuer in the document must be the URL it was fetched for.
  if (metadata.issuer !== issuer) {
    throw new Oid4vciClientError(
      'AS_ISSUER_MISMATCH',
      `authorization server metadata issuer ${metadata.issuer} is not ${issuer}`,
      {
        step: 'as.metadata',
      },
    );
  }
  return metadata;
}

async function fetchWellKnown(
  identifier: string,
  wellKnownPath: string,
  ctx: Context,
  step: StepId,
  code: ClientErrorCode,
): Promise<unknown> {
  const urls = [
    ...new Set([
      wellKnownUrl(identifier, wellKnownPath, 'insert'),
      wellKnownUrl(identifier, wellKnownPath, 'append'),
    ]),
  ];
  let lastStatus = 0;
  for (const url of urls) {
    const response = await send(ctx, url, { method: 'GET', headers: { accept: 'application/json' } }, step);
    if (response.ok) return readJson(response, step, code);
    lastStatus = response.status;
    if (response.status !== 404) break;
  }
  throw new Oid4vciClientError(code, `${wellKnownPath} for ${identifier} answered ${lastStatus}`, {
    step,
    status: lastStatus,
  });
}

function profileOf(metadata: IssuerMetadata, ctx: Context): VciProfile {
  return ctx.options.profile ?? (metadata.nonce_endpoint ? 'v1' : 'draft13');
}

async function requestCredentials(
  metadata: IssuerMetadata,
  tokenResponse: Record<string, unknown>,
  configurationIds: string[],
  clientId: string | undefined,
  ctx: Context,
): Promise<ReceivedCredential[]> {
  const accessToken = tokenResponse.access_token;
  if (typeof accessToken !== 'string') {
    throw new Oid4vciClientError('TOKEN_FAILED', 'token response has no access_token', { step: 'token' });
  }
  const profile = profileOf(metadata, ctx);
  let nonce = typeof tokenResponse.c_nonce === 'string' ? tokenResponse.c_nonce : undefined;
  const received: ReceivedCredential[] = [];

  for (const configurationId of configurationIds) {
    const configuration = metadata.credential_configurations_supported[configurationId];
    if (!configuration) {
      throw new Oid4vciClientError(
        'CONFIGURATION_UNKNOWN',
        `issuer metadata has no configuration ${configurationId}`,
        {
          step: 'issuer.metadata',
        },
      );
    }
    if (profile === 'v1') nonce = await fetchNonce(metadata, ctx);
    if (received.length === 0 && ctx.options.holderKeyFor) {
      ctx.holderKey = ctx.options.holderKeyFor(configuration);
    }

    // One retry with the nonce the issuer hands back (draft 13 section 7.3.1.2, 1.0 section 8.3.1.2).
    for (let attempt = 0; ; attempt += 1) {
      ctx.step('credential');
      const proof = createProofJwt({
        holderKey: ctx.holderKey,
        audience: metadata.credential_issuer,
        ...(nonce === undefined ? {} : { nonce }),
        ...(clientId === undefined ? {} : { issuer: clientId }),
        nowMs: ctx.clock(),
        ed25519AlgName: ed25519AlgNameFor(configuration),
        ...(ctx.options.proofOverrides ? { overrides: ctx.options.proofOverrides } : {}),
      });
      const body =
        profile === 'v1'
          ? { credential_configuration_id: configurationId, proofs: { jwt: [proof] } }
          : { ...draft13CredentialIdentification(configuration), proof: { proof_type: 'jwt', jwt: proof } };
      const response = await send(
        ctx,
        metadata.credential_endpoint,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
        'credential',
      );
      const json = (await readJson(response, 'credential', 'CREDENTIAL_FAILED', true)) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        const error = typeof json.error === 'string' ? json.error : undefined;
        const retryable =
          attempt === 0 &&
          (error === 'invalid_nonce' || (error === 'invalid_proof' && typeof json.c_nonce === 'string'));
        if (retryable) {
          nonce = typeof json.c_nonce === 'string' ? json.c_nonce : await fetchNonce(metadata, ctx);
          continue;
        }
        throw new Oid4vciClientError('CREDENTIAL_FAILED', describeError(json, response.status), {
          step: 'credential',
          status: response.status,
          ...(error === undefined ? {} : { oauthError: error }),
          details: json,
        });
      }
      if (typeof json.c_nonce === 'string') nonce = json.c_nonce;
      const credentials = extractCredentials(json);
      for (const credential of credentials) {
        received.push({
          configurationId,
          format: configuration.format,
          credential,
          raw: typeof credential === 'string' ? credential : JSON.stringify(credential),
        });
      }
      break;
    }
  }
  return received;
}

/** Draft 13 section 7.2: the credential is named by `format` plus its format-specific members. */
function draft13CredentialIdentification(
  configuration: IssuerMetadata['credential_configurations_supported'][string],
): Record<string, unknown> {
  const { format } = configuration;
  if (format === 'ldp_vc' || format === 'jwt_vc_json-ld' || format === 'jwt_vc_json') {
    const definition = (configuration.credential_definition ?? {}) as Record<string, unknown>;
    return {
      format,
      credential_definition: {
        ...(definition['@context'] === undefined ? {} : { '@context': definition['@context'] }),
        type: definition.type,
      },
    };
  }
  if (format === 'mso_mdoc') return { format, doctype: configuration.doctype };
  return { format, vct: configuration.vct };
}

function extractCredentials(json: Record<string, unknown>): unknown[] {
  if (Array.isArray(json.credentials)) {
    return json.credentials.map((entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'credential' in entry ? entry.credential : entry,
    );
  }
  if (json.credential !== undefined) return [json.credential];
  if (typeof json.transaction_id === 'string') {
    throw new Oid4vciClientError(
      'DEFERRED_UNSUPPORTED',
      'the issuer deferred issuance (transaction_id); deferred issuance is not supported',
      {
        step: 'credential',
      },
    );
  }
  throw new Oid4vciClientError(
    'CREDENTIAL_FAILED',
    'credential response has neither credential nor credentials',
    {
      step: 'credential',
      details: json,
    },
  );
}

async function fetchNonce(metadata: IssuerMetadata, ctx: Context): Promise<string> {
  if (!metadata.nonce_endpoint) {
    throw new Oid4vciClientError('NONCE_FAILED', 'issuer metadata has no nonce_endpoint', { step: 'nonce' });
  }
  ctx.step('nonce');
  const response = await send(
    ctx,
    metadata.nonce_endpoint,
    { method: 'POST', headers: { accept: 'application/json' } },
    'nonce',
  );
  const json = (await readJson(response, 'nonce', 'NONCE_FAILED')) as Record<string, unknown>;
  if (!response.ok || typeof json.c_nonce !== 'string') {
    throw new Oid4vciClientError(
      'NONCE_FAILED',
      `nonce endpoint answered ${response.status} without c_nonce`,
      {
        step: 'nonce',
        status: response.status,
      },
    );
  }
  return json.c_nonce;
}

async function postForm(
  url: string,
  form: Record<string, string>,
  ctx: Context,
  step: StepId,
  code: ClientErrorCode,
): Promise<Record<string, unknown>> {
  const response = await send(
    ctx,
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
    },
    step,
  );
  const json = (await readJson(response, step, code, true)) as Record<string, unknown>;
  if (!response.ok) {
    throw new Oid4vciClientError(code, describeError(json, response.status), {
      step,
      status: response.status,
      ...(typeof json.error === 'string' ? { oauthError: json.error } : {}),
      details: json,
    });
  }
  return json;
}

/** RFC 7523 client assertion for `private_key_jwt`; `aud` is the token endpoint, as Mimoto sends it. */
async function clientAssertion(
  clientId: string,
  tokenEndpoint: string,
  auth: ClientAuthentication,
  clock: Clock,
): Promise<string> {
  if (!auth.privateJwk) {
    throw new Oid4vciClientError('TOKEN_FAILED', 'private_key_jwt needs a private key', { step: 'token' });
  }
  const alg = auth.alg ?? auth.privateJwk.alg ?? 'RS256';
  const key = (await importJWK(auth.privateJwk, alg)) as CryptoKey;
  const now = epochSeconds(clock());
  return new SignJWT({ jti: randomToken(16) })
    .setProtectedHeader({ alg, typ: 'JWT', ...(auth.privateJwk.kid ? { kid: auth.privateJwk.kid } : {}) })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(tokenEndpoint)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

async function send(ctx: Context, url: string, init: RequestInit, step: StepId): Promise<Response> {
  try {
    return await ctx.fetch(url, init);
  } catch (cause) {
    const code: ClientErrorCode =
      step === 'issuer.offer'
        ? 'OFFER_FETCH_FAILED'
        : step === 'issuer.metadata'
          ? 'METADATA_FETCH_FAILED'
          : step === 'as.metadata'
            ? 'AS_METADATA_INVALID'
            : step === 'nonce'
              ? 'NONCE_FAILED'
              : step === 'credential'
                ? 'CREDENTIAL_FAILED'
                : 'TOKEN_FAILED';
    throw new Oid4vciClientError(
      code,
      `request to ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        step,
        cause,
      },
    );
  }
}

async function readJson(
  response: Response,
  step: StepId,
  code: ClientErrorCode,
  allowErrorStatus = false,
): Promise<unknown> {
  const text = await safeText(response);
  try {
    return JSON.parse(text);
  } catch (cause) {
    if (allowErrorStatus && !response.ok) return { error_description: text.slice(0, 500) };
    throw new Oid4vciClientError(
      code,
      `${response.url || 'response'} is not JSON (status ${response.status})`,
      {
        step,
        status: response.status,
        cause,
      },
    );
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function describeError(json: Record<string, unknown>, status: number): string {
  const error = typeof json.error === 'string' ? json.error : `HTTP ${status}`;
  const description = typeof json.error_description === 'string' ? `: ${json.error_description}` : '';
  return `${error}${description}`;
}
