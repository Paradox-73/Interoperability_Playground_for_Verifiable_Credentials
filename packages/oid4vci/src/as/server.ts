/**
 * Test authorization server: stands in for eSignet in local runs.
 *
 * What it does, and the specification behind each part:
 * - `/authorize`: authorization code flow (RFC 6749 section 4.1) with PKCE S256 only (RFC 7636; the
 *   `plain` method is refused, as OAuth 2.1 and HAIP require). There is no login page: the request is
 *   approved at once for a configured test identity, and the redirect carries `iss` (RFC 9207).
 * - `/token`: client authentication `none` (public client) or `private_key_jwt` (OpenID Connect Core
 *   section 9, RFC 7523). Access tokens are JWTs (RFC 9068 claims) with the members Inji Certify reads
 *   from an eSignet token: `iss`, `sub`, `aud`, `scope`, `client_id`, `iat`, `exp`, plus `c_nonce` and
 *   `c_nonce_expires_in`, because Certify takes the proof nonce from the access token when it has no
 *   cached transaction (`VCIssuanceUtil.java:150-170`, `JwtProofValidator.java:74-97`). The token
 *   response repeats `c_nonce` (OpenID4VCI draft 13 section 6.2).
 * - ID tokens (OpenID Connect Core section 2) when the scope has `openid`, and on request through
 *   `issueIdToken()` for Mimoto's token login.
 * - Metadata at `<issuer>/.well-known/oauth-authorization-server` and `openid-configuration`, plus the
 *   RFC 8414 "insert" locations through `wellKnownDocuments` (see `common/well-known.ts`).
 *
 * URLs: `issuer` is the back-channel base URL (token, JWKS, metadata; what containers reach) and is
 * the issuer identifier. `frontChannelUrl` is where a browser reaches `/authorize`.
 *
 * Signing: RS256 by default, because Mimoto validates ID tokens with a default Spring
 * `NimbusJwtDecoder` (`JwtConfig.java`), which accepts RS256 only; Certify accepts ES256, RS256 and
 * PS256 (`AccessTokenValidationFilter.java:67-71`).
 */
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  SignJWT,
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from 'jose';
import {
  AUTHORIZATION_CODE_GRANT,
  JWT_BEARER_ASSERTION_TYPE,
  WELL_KNOWN,
  trimTrailingSlash,
} from '../common/constants.js';
import { OAuthError } from '../common/errors.js';
import {
  ExpiringStore,
  ensureFormParser,
  epochSeconds,
  installOAuthErrorHandler,
  isValidCodeVerifier,
  pkceChallenge,
  randomToken,
  sendOAuthError,
  stringParam,
  systemClock,
  type Clock,
} from '../common/util.js';
import type { WellKnownDocument } from '../common/well-known.js';
import { FARMER_TEST_IDENTITY, type TestIdentity } from './identity.js';

export type AsSigningAlg = 'RS256' | 'ES256';

export interface RegisteredClient {
  clientId: string;
  /** Redirect URIs, compared by exact string match (RFC 9700 section 2.1). */
  redirectUris: string[];
  /** `none` for a public client (PKCE only), `private_key_jwt` for a client that signs assertions. */
  authMethod: 'none' | 'private_key_jwt';
  /** Public keys for `private_key_jwt` (RSA, EC or OKP JWKs). */
  jwks?: { keys: JWK[] };
  /** Scopes this client may request. Default: any scope the server supports. */
  scopes?: string[];
}

export interface TestAuthorizationServerOptions {
  /** Issuer identifier and back-channel base URL, for example `http://playground:28100/ref/as`. */
  issuer: string;
  /** Base URL a browser uses for `/authorize`. Default: `issuer`. */
  frontChannelUrl?: string;
  /** Private signing key as a JWK (from the run directory). Default: a fresh key per start. */
  signingKey?: JWK;
  signingAlg?: AsSigningAlg;
  clients: RegisteredClient[];
  /** Identities that can be logged in; the first is the default, `login_hint` picks another by `sub`. */
  identities?: TestIdentity[];
  /** `aud` of access tokens: the resource's credential endpoint or issuer. Default: the AS issuer. */
  audience?: string | string[] | ((scopes: string[]) => string | string[]);
  scopesSupported?: string[];
  /**
   * `typ` of access tokens. Default `JWT`: Spring Security's default JOSE type check (used by
   * Certify's `NimbusJwtDecoder`) accepts `JWT` or no `typ`; RFC 9068 asks for `at+jwt`.
   * Which of the two Certify 0.14.0 accepts is not yet measured.
   */
  accessTokenTyp?: 'JWT' | 'at+jwt';
  /** Extra values accepted as `aud` of client assertions (for example the token URL behind a proxy). */
  extraAssertionAudiences?: string[];
  codeTtlSeconds?: number;
  accessTokenTtlSeconds?: number;
  cNonceTtlSeconds?: number;
  idTokenTtlSeconds?: number;
  clock?: Clock;
}

interface AuthorizationCode {
  clientId: string;
  redirectUri: string;
  redirectUriGiven: boolean;
  scope: string[];
  codeChallenge: string;
  nonce?: string;
  identity: TestIdentity;
  authTime: number;
  issuerState?: string;
}

export interface IssuedTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  c_nonce: string;
  c_nonce_expires_in: number;
  id_token?: string;
}

export interface TestAuthorizationServer {
  readonly issuer: string;
  /** Fastify plugin; the host registers it with a prefix equal to the path of `issuer`. */
  readonly plugin: FastifyPluginAsync;
  /** Documents for `registerRootWellKnown` (RFC 8414 insert locations). */
  readonly wellKnownDocuments: WellKnownDocument[];
  metadata(): Record<string, unknown>;
  jwks(): { keys: JWK[] };
  /** Signs an ID token directly (for Mimoto's `/auth/{provider}/token-login`). */
  issueIdToken(input: { audience: string; nonce?: string; sub?: string }): Promise<string>;
  /** Signs an access token directly, without the browser step (tests, scripted runs). */
  issueAccessToken(input: { clientId: string; scope: string[]; sub?: string }): Promise<IssuedTokens>;
  /** Verifies a token signed by this server (signature, `iss`, expiry) and returns its claims. */
  verifyToken(token: string): Promise<JWTPayload>;
}

/** Generates a signing key for the authorization server, as a private JWK the caller can save. */
export async function generateAsSigningKey(alg: AsSigningAlg = 'RS256'): Promise<JWK> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true });
  return { ...(await exportJWK(privateKey)), alg };
}

export async function createTestAuthorizationServer(
  options: TestAuthorizationServerOptions,
): Promise<TestAuthorizationServer> {
  const issuer = trimTrailingSlash(options.issuer);
  const frontChannel = trimTrailingSlash(options.frontChannelUrl ?? issuer);
  const alg = options.signingAlg ?? (options.signingKey?.alg as AsSigningAlg | undefined) ?? 'RS256';
  const clock = options.clock ?? systemClock;
  const identities = options.identities?.length ? options.identities : [FARMER_TEST_IDENTITY];
  const scopesSupported = options.scopesSupported ?? ['openid', 'profile', 'email'];
  const ttl = {
    code: options.codeTtlSeconds ?? 120,
    accessToken: options.accessTokenTtlSeconds ?? 600,
    cNonce: options.cNonceTtlSeconds ?? 300,
    idToken: options.idTokenTtlSeconds ?? 600,
  };

  const privateJwk = options.signingKey ?? (await generateAsSigningKey(alg));
  const privateKey = (await importJWK(privateJwk, alg)) as CryptoKey;
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...publicMembers } = privateJwk;
  const kid = privateJwk.kid ?? (await calculateJwkThumbprint(publicMembers));
  const publicJwk: JWK = { ...publicMembers, kid, alg, use: 'sig' };
  const ownKeySet = createLocalJWKSet({ keys: [publicJwk] });

  const clients = new Map(options.clients.map((client) => [client.clientId, client]));
  const codes = new ExpiringStore<AuthorizationCode>(clock);
  const assertionIds = new ExpiringStore<true>(clock);

  const endpoints = {
    authorization: `${frontChannel}/authorize`,
    token: `${issuer}/token`,
    jwks: `${issuer}/jwks.json`,
    userinfo: `${issuer}/userinfo`,
  };

  const metadata = (): Record<string, unknown> => ({
    issuer,
    authorization_endpoint: endpoints.authorization,
    token_endpoint: endpoints.token,
    jwks_uri: endpoints.jwks,
    userinfo_endpoint: endpoints.userinfo,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: [AUTHORIZATION_CODE_GRANT],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256', 'PS256', 'ES256', 'EdDSA'],
    scopes_supported: scopesSupported,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [alg],
    claims_supported: ['sub', ...new Set(identities.flatMap((identity) => Object.keys(identity.claims)))],
    authorization_response_iss_parameter_supported: true,
  });

  const audienceFor = (scope: string[]): string | string[] => {
    const audience = options.audience;
    if (audience === undefined) return issuer;
    return typeof audience === 'function' ? audience(scope) : audience;
  };

  const sign = (payload: JWTPayload, typ: string): Promise<string> =>
    new SignJWT(payload).setProtectedHeader({ alg, kid, typ }).sign(privateKey);

  async function issueAccessToken(input: {
    clientId: string;
    scope: string[];
    sub?: string;
    identity?: TestIdentity;
    nonce?: string;
    authTime?: number;
  }): Promise<IssuedTokens> {
    const now = epochSeconds(clock());
    const identity =
      input.identity ?? identities.find((candidate) => candidate.sub === input.sub) ?? identities[0]!;
    const cNonce = randomToken(16);
    const scope = input.scope.join(' ');
    const accessToken = await sign(
      {
        iss: issuer,
        sub: identity.sub,
        aud: audienceFor(input.scope),
        scope,
        client_id: input.clientId,
        iat: now,
        exp: now + ttl.accessToken,
        jti: randomToken(16),
        c_nonce: cNonce,
        c_nonce_expires_in: ttl.cNonce,
      },
      options.accessTokenTyp ?? 'JWT',
    );
    const tokens: IssuedTokens = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ttl.accessToken,
      scope,
      c_nonce: cNonce,
      c_nonce_expires_in: ttl.cNonce,
    };
    if (input.scope.includes('openid')) {
      tokens.id_token = await issueIdToken({
        audience: input.clientId,
        identity,
        ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
        ...(input.authTime === undefined ? {} : { authTime: input.authTime }),
      });
    }
    return tokens;
  }

  async function issueIdToken(input: {
    audience: string;
    nonce?: string;
    sub?: string;
    identity?: TestIdentity;
    authTime?: number;
  }): Promise<string> {
    const now = epochSeconds(clock());
    const identity =
      input.identity ?? identities.find((candidate) => candidate.sub === input.sub) ?? identities[0]!;
    return sign(
      {
        ...identity.claims,
        iss: issuer,
        sub: identity.sub,
        aud: input.audience,
        iat: now,
        exp: now + ttl.idToken,
        auth_time: input.authTime ?? now,
        ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
      },
      'JWT',
    );
  }

  async function verifyToken(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, ownKeySet, {
      issuer,
      currentDate: new Date(clock()),
    });
    return payload;
  }

  /** OpenID Connect Core section 9 / RFC 7523 section 3: checks a `private_key_jwt` client assertion. */
  async function authenticateWithAssertion(client: RegisteredClient, assertion: string): Promise<void> {
    if (!client.jwks?.keys.length) {
      throw new OAuthError('invalid_client', `client ${client.clientId} has no registered keys`, 401);
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(assertion, createLocalJWKSet(client.jwks), {
        currentDate: new Date(clock()),
        requiredClaims: ['exp', 'iss', 'sub', 'aud'],
      }));
    } catch (cause) {
      throw new OAuthError(
        'invalid_client',
        `client assertion rejected: ${cause instanceof Error ? cause.message : String(cause)}`,
        401,
      );
    }
    if (payload.iss !== client.clientId || payload.sub !== client.clientId) {
      throw new OAuthError('invalid_client', 'client assertion iss and sub must both be the client_id', 401);
    }
    const accepted = new Set([
      issuer,
      endpoints.token,
      `${frontChannel}/token`,
      ...(options.extraAssertionAudiences ?? []),
    ]);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.some((value) => typeof value === 'string' && accepted.has(trimTrailingSlash(value)))) {
      throw new OAuthError(
        'invalid_client',
        `client assertion aud ${JSON.stringify(payload.aud)} names neither the issuer nor the token endpoint`,
        401,
      );
    }
    // RFC 7523 section 3 item 7: a jti may be used only once.
    if (typeof payload.jti === 'string') {
      const key = `${client.clientId}:${payload.jti}`;
      if (assertionIds.peek(key).status !== 'unknown') {
        throw new OAuthError('invalid_client', 'client assertion jti was already used', 401);
      }
      const lifetime = typeof payload.exp === 'number' ? payload.exp - epochSeconds(clock()) : 0;
      assertionIds.set(key, true, Math.max(lifetime, 60));
    }
  }

  async function authenticateClient(body: unknown): Promise<RegisteredClient> {
    const assertionType = stringParam(body, 'client_assertion_type');
    const assertion = stringParam(body, 'client_assertion');
    const clientIdParam = stringParam(body, 'client_id');
    if (assertionType !== undefined || assertion !== undefined) {
      if (assertionType !== JWT_BEARER_ASSERTION_TYPE || assertion === undefined) {
        throw new OAuthError(
          'invalid_client',
          `client_assertion_type must be ${JWT_BEARER_ASSERTION_TYPE}`,
          401,
        );
      }
      let assertedClient: unknown;
      try {
        assertedClient = JSON.parse(Buffer.from(assertion.split('.')[1] ?? '', 'base64url').toString('utf8'));
      } catch {
        throw new OAuthError('invalid_client', 'client_assertion is not a JWT', 401);
      }
      const clientId =
        typeof assertedClient === 'object' && assertedClient !== null
          ? (assertedClient as { iss?: unknown }).iss
          : undefined;
      if (typeof clientId !== 'string')
        throw new OAuthError('invalid_client', 'client_assertion has no iss', 401);
      if (clientIdParam !== undefined && clientIdParam !== clientId) {
        throw new OAuthError('invalid_client', 'client_id does not match the client assertion', 401);
      }
      const client = clients.get(clientId);
      if (!client || client.authMethod !== 'private_key_jwt') {
        throw new OAuthError('invalid_client', `unknown private_key_jwt client ${clientId}`, 401);
      }
      await authenticateWithAssertion(client, assertion);
      return client;
    }
    if (clientIdParam === undefined) throw new OAuthError('invalid_client', 'client_id is missing', 401);
    const client = clients.get(clientIdParam);
    if (!client) throw new OAuthError('invalid_client', `unknown client ${clientIdParam}`, 401);
    if (client.authMethod !== 'none') {
      throw new OAuthError(
        'invalid_client',
        `client ${client.clientId} must authenticate with private_key_jwt`,
        401,
      );
    }
    return client;
  }

  // Registration is synchronous; the plugin type stays async because Fastify awaits it either way.
  const plugin: FastifyPluginAsync = (app: FastifyInstance) => {
    ensureFormParser(app);
    installOAuthErrorHandler(app);

    const sendMetadata = (_request: FastifyRequest, reply: FastifyReply) => reply.send(metadata());
    app.get(WELL_KNOWN.oauthAuthorizationServer, sendMetadata);
    app.get(WELL_KNOWN.openidConfiguration, sendMetadata);
    app.get('/jwks.json', (_request, reply) => reply.send({ keys: [publicJwk] }));

    app.get('/authorize', async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const clientId = stringParam(query, 'client_id');
      const client = clientId === undefined ? undefined : clients.get(clientId);
      // RFC 6749 section 4.1.2.1: with an unknown client or redirect URI the server must not redirect.
      if (!client) {
        return sendOAuthError(
          reply,
          new OAuthError('invalid_request', `unknown client_id ${String(clientId)}`),
        );
      }
      const requestedRedirect = stringParam(query, 'redirect_uri');
      const redirectUri =
        requestedRedirect ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
      if (redirectUri === undefined || !client.redirectUris.includes(redirectUri)) {
        return sendOAuthError(
          reply,
          new OAuthError('invalid_request', `redirect_uri ${String(requestedRedirect)} is not registered`),
        );
      }
      const state = stringParam(query, 'state');
      const redirectWith = (params: Record<string, string>) => {
        const target = new URL(redirectUri);
        for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
        if (state !== undefined) target.searchParams.set('state', state);
        target.searchParams.set('iss', issuer);
        return reply.code(302).header('cache-control', 'no-store').redirect(target.toString());
      };
      const fail = (error: string, description: string) =>
        redirectWith({ error, error_description: description });

      if (stringParam(query, 'response_type') !== 'code') {
        return fail('unsupported_response_type', 'only response_type=code is supported');
      }
      const codeChallenge = stringParam(query, 'code_challenge');
      if (codeChallenge === undefined) return fail('invalid_request', 'code_challenge is required (PKCE)');
      if (stringParam(query, 'code_challenge_method') !== 'S256') {
        return fail('invalid_request', 'code_challenge_method must be S256');
      }
      const scope = (stringParam(query, 'scope') ?? '').split(' ').filter(Boolean);
      const allowed = client.scopes ?? scopesSupported;
      const unknownScope = scope.find((value) => !allowed.includes(value));
      if (unknownScope !== undefined) return fail('invalid_scope', `scope ${unknownScope} is not allowed`);

      const loginHint = stringParam(query, 'login_hint');
      const identity = identities.find((candidate) => candidate.sub === loginHint) ?? identities[0]!;
      const code = randomToken();
      const nonce = stringParam(query, 'nonce');
      const issuerState = stringParam(query, 'issuer_state');
      codes.set(
        code,
        {
          clientId: client.clientId,
          redirectUri,
          redirectUriGiven: requestedRedirect !== undefined,
          scope,
          codeChallenge,
          identity,
          authTime: epochSeconds(clock()),
          ...(nonce === undefined ? {} : { nonce }),
          ...(issuerState === undefined ? {} : { issuerState }),
        },
        ttl.code,
      );
      // Auto-approve: the configured test identity is logged in and consents at once.
      return redirectWith({ code });
    });

    app.post('/token', async (request, reply) => {
      const body = request.body;
      const grantType = stringParam(body, 'grant_type');
      if (grantType !== AUTHORIZATION_CODE_GRANT) {
        throw new OAuthError('unsupported_grant_type', `grant_type ${String(grantType)} is not supported`);
      }
      const client = await authenticateClient(body);
      const code = stringParam(body, 'code');
      if (code === undefined) throw new OAuthError('invalid_request', 'code is missing');
      const redeemed = codes.consume(code);
      if (redeemed.status !== 'valid' || !redeemed.value) {
        const reason = { unknown: 'is unknown', expired: 'has expired', used: 'was already used', valid: '' };
        throw new OAuthError('invalid_grant', `authorization code ${reason[redeemed.status]}`);
      }
      const grant = redeemed.value;
      if (grant.clientId !== client.clientId) {
        throw new OAuthError('invalid_grant', 'authorization code was issued to another client');
      }
      const redirectUri = stringParam(body, 'redirect_uri');
      if ((grant.redirectUriGiven || redirectUri !== undefined) && redirectUri !== grant.redirectUri) {
        throw new OAuthError('invalid_grant', 'redirect_uri differs from the authorization request');
      }
      const verifier = stringParam(body, 'code_verifier');
      if (verifier === undefined || !isValidCodeVerifier(verifier)) {
        throw new OAuthError('invalid_grant', 'code_verifier is missing or malformed (RFC 7636 section 4.1)');
      }
      if (pkceChallenge(verifier) !== grant.codeChallenge) {
        throw new OAuthError(
          'invalid_grant',
          'code_verifier does not match code_challenge (RFC 7636 section 4.6)',
        );
      }
      const tokens = await issueAccessToken({
        clientId: client.clientId,
        scope: grant.scope,
        identity: grant.identity,
        authTime: grant.authTime,
        ...(grant.nonce === undefined ? {} : { nonce: grant.nonce }),
      });
      return reply.header('cache-control', 'no-store').send(tokens);
    });

    app.get('/userinfo', async (request) => {
      const header = request.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) throw new OAuthError('invalid_token', 'bearer token missing', 401);
      let claims: JWTPayload;
      try {
        claims = await verifyToken(header.slice('Bearer '.length));
      } catch (cause) {
        throw new OAuthError('invalid_token', cause instanceof Error ? cause.message : 'invalid token', 401);
      }
      const identity = identities.find((candidate) => candidate.sub === claims.sub);
      return { sub: claims.sub, ...(identity?.claims ?? {}) };
    });
    return Promise.resolve();
  };

  return {
    issuer,
    plugin,
    wellKnownDocuments: [
      { identifier: issuer, wellKnownPath: WELL_KNOWN.oauthAuthorizationServer, document: metadata },
      { identifier: issuer, wellKnownPath: WELL_KNOWN.openidConfiguration, document: metadata },
    ],
    metadata,
    jwks: () => ({ keys: [publicJwk] }),
    issueIdToken,
    issueAccessToken: (input) => issueAccessToken(input),
    verifyToken,
  };
}
