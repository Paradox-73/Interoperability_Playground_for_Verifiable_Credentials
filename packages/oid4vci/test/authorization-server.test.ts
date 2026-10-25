// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Test authorization server (stands in for eSignet): RFC 6749 authorization code, RFC 7636 PKCE,
 * OpenID Connect Core section 9 `private_key_jwt`, RFC 8414 metadata, RFC 9068-style access tokens
 * with the claims Inji Certify reads, and OpenID Connect ID tokens.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose';
import { createDidResolver, createDocumentLoader, verifyLdpVc } from '@inji-playground/formats';
import {
  FARMER_TEST_IDENTITY,
  JWT_BEARER_ASSERTION_TYPE,
  Oid4vciClientError,
  fetchViaAuthorizationCode,
  pkceChallenge,
  randomToken,
} from '../src/index.js';
import {
  AS_BASE,
  ISSUER_BASE,
  MIMOTO_CLIENT_ID,
  PUBLIC_CLIENT_ID,
  REDIRECT_URI,
  postForm,
  startPlayground,
  type Playground,
} from './helpers.js';

let pg: Playground;
beforeEach(async () => {
  pg = await startPlayground();
});
afterEach(async () => {
  await pg.app.close();
});

async function jwks(): Promise<ReturnType<typeof createLocalJWKSet>> {
  const response = await pg.app.inject({ method: 'GET', url: '/ref/as/jwks.json' });
  return createLocalJWKSet(response.json());
}

/** Runs /authorize by hand and returns the code from the redirect. */
async function authorize(params: Record<string, string>): Promise<URL> {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: MIMOTO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid farmer_ldp_vc',
    state: 'state-1',
    code_challenge_method: 'S256',
    ...params,
  });
  const response = await pg.app.inject({ method: 'GET', url: `/ref/as/authorize?${query.toString()}` });
  expect(response.statusCode).toBe(302);
  return new URL(response.headers.location as string);
}

async function assertion(overrides: { aud?: string; jti?: string; key?: JWK } = {}): Promise<string> {
  const key = await importJWK(overrides.key ?? pg.clientKey, 'RS256');
  const now = Math.floor(pg.clock() / 1000);
  return new SignJWT({ jti: overrides.jti ?? randomToken(8) })
    .setProtectedHeader({ alg: 'RS256', kid: 'mimoto-client-key' })
    .setIssuer(MIMOTO_CLIENT_ID)
    .setSubject(MIMOTO_CLIENT_ID)
    .setAudience(overrides.aud ?? `${AS_BASE}/token`)
    .setIssuedAt(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

async function redeem(code: string, verifier: string, clientAssertion: string) {
  return postForm(pg.app, '/ref/as/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    client_id: MIMOTO_CLIENT_ID,
    client_assertion_type: JWT_BEARER_ASSERTION_TYPE,
    client_assertion: clientAssertion,
  });
}

describe('metadata (RFC 8414)', () => {
  it('answers at <issuer>/.well-known/... and at the RFC 8414 insert location', async () => {
    const urls = [
      '/ref/as/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/ref/as',
      '/ref/as/.well-known/openid-configuration',
      '/.well-known/openid-configuration/ref/as',
    ];
    for (const url of urls) {
      const response = await pg.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.json(), url).toMatchObject({
        issuer: AS_BASE,
        authorization_endpoint: `${AS_BASE}/authorize`,
        token_endpoint: `${AS_BASE}/token`,
        jwks_uri: `${AS_BASE}/jwks.json`,
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
      });
    }
  });
});

describe('authorization code + PKCE S256 + auto-approve', () => {
  it('runs the full flow with private_key_jwt and the reference issuer accepts the access token (draft 13 and 1.0)', async () => {
    for (const profile of ['draft13', 'v1'] as const) {
      const steps: string[] = [];
      const result = await fetchViaAuthorizationCode(`${ISSUER_BASE}/${profile}`, {
        configurationId: 'FarmerCredential_ldp_vc',
        clientId: MIMOTO_CLIENT_ID,
        redirectUri: REDIRECT_URI,
        clientAuth: { method: 'private_key_jwt', privateJwk: pg.clientKey, alg: 'RS256' },
        fetch: pg.fetch,
        clock: pg.clock,
        onStep: (step) => steps.push(step),
      });
      expect(result.authorizationServerMetadata.issuer).toBe(AS_BASE);
      const credential = result.credentials[0]!.credential as { credentialSubject: Record<string, unknown> };
      // The holder is the test identity: the issuer took the farmer id from the token's sub.
      expect(credential.credentialSubject.farmerId).toBe(FARMER_TEST_IDENTITY.sub);
      await verifyLdpVc(credential, {
        documentLoader: createDocumentLoader({ didResolver: createDidResolver({ methods: ['key', 'jwk'] }) }),
      });
      expect(steps.at(-1)).toBe('credential');
    }
    const tokenCall = pg.exchanges.find((exchange) => exchange.url === `${AS_BASE}/token`)!;
    expect(tokenCall.requestBody).toContain(
      `client_assertion_type=${encodeURIComponent(JWT_BEARER_ASSERTION_TYPE)}`,
    );
  });

  it('works for a public client (token_endpoint_auth_method none)', async () => {
    const result = await fetchViaAuthorizationCode(`${ISSUER_BASE}/draft13`, {
      configurationId: 'FarmerCredential_vc_sd_jwt',
      clientId: PUBLIC_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      fetch: pg.fetch,
      clock: pg.clock,
    });
    expect(typeof result.credentials[0]!.credential).toBe('string');
  });

  it('issues an access token that verifies with the AS JWKS and carries the claims Certify reads', async () => {
    const verifier = randomToken(40);
    const redirect = await authorize({ code_challenge: pkceChallenge(verifier) });
    expect(redirect.searchParams.get('state')).toBe('state-1');
    expect(redirect.searchParams.get('iss')).toBe(AS_BASE);
    const response = await redeem(redirect.searchParams.get('code')!, verifier, await assertion());
    expect(response.status).toBe(200);
    const tokens = response.json;
    expect(tokens).toMatchObject({
      token_type: 'Bearer',
      scope: 'openid farmer_ldp_vc',
      c_nonce_expires_in: 300,
    });

    const { payload, protectedHeader } = await jwtVerify(tokens.access_token as string, await jwks(), {
      issuer: AS_BASE,
      audience: ISSUER_BASE,
    });
    expect(protectedHeader.alg).toBe('RS256');
    expect(payload).toMatchObject({
      sub: FARMER_TEST_IDENTITY.sub,
      aud: ISSUER_BASE,
      scope: 'openid farmer_ldp_vc',
      client_id: MIMOTO_CLIENT_ID,
      c_nonce: tokens.c_nonce,
      c_nonce_expires_in: 300,
    });
    expect(payload.exp! - payload.iat!).toBe(600);
  });

  it('issues an ID token (scope openid, and directly for Mimoto token login) that verifies with the AS JWKS', async () => {
    const verifier = randomToken(40);
    const redirect = await authorize({ code_challenge: pkceChallenge(verifier), nonce: 'oidc-nonce' });
    const tokens = (await redeem(redirect.searchParams.get('code')!, verifier, await assertion())).json;
    const { payload } = await jwtVerify(tokens.id_token as string, await jwks(), {
      issuer: AS_BASE,
      audience: MIMOTO_CLIENT_ID,
    });
    expect(payload).toMatchObject({
      sub: FARMER_TEST_IDENTITY.sub,
      nonce: 'oidc-nonce',
      email: FARMER_TEST_IDENTITY.claims.email,
    });

    const direct = await pg.as.issueIdToken({ audience: 'mimoto-google-client' });
    const verified = await jwtVerify(direct, await jwks(), {
      issuer: AS_BASE,
      audience: 'mimoto-google-client',
    });
    expect(verified.payload.email).toBe(FARMER_TEST_IDENTITY.claims.email);
    expect(decodeProtectedHeader(direct).kid).toBe(pg.as.jwks().keys[0]!.kid);
  });

  it('serves userinfo for its own access tokens', async () => {
    const tokens = await pg.as.issueAccessToken({ clientId: PUBLIC_CLIENT_ID, scope: ['openid'] });
    const response = await pg.app.inject({
      method: 'GET',
      url: '/ref/as/userinfo',
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.json()).toMatchObject({ sub: FARMER_TEST_IDENTITY.sub, name: 'Gorge Cooper' });
  });
});

describe('authorization and token errors', () => {
  it('rejects a reused or expired authorization code with invalid_grant', async () => {
    const verifier = randomToken(40);
    const code = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
    expect((await redeem(code, verifier, await assertion())).status).toBe(200);
    const reused = await redeem(code, verifier, await assertion());
    expect(reused).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });

    const late = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
    pg.advance(121);
    const expired = await redeem(late, verifier, await assertion());
    expect(expired).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });
    expect(expired.json.error_description).toMatch(/expired/);
  });

  it('rejects a wrong code_verifier with invalid_grant and refuses PKCE plain', async () => {
    const verifier = randomToken(40);
    const code = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
    const wrong = await redeem(code, randomToken(40), await assertion());
    expect(wrong).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });

    const plain = await authorize({ code_challenge: verifier, code_challenge_method: 'plain' });
    expect(plain.searchParams.get('error')).toBe('invalid_request');
    expect(plain.searchParams.get('state')).toBe('state-1');
    const none = await authorize({ code_challenge_method: '' });
    expect(none.searchParams.get('error')).toBe('invalid_request');
  });

  it('rejects client assertions with a foreign key, a wrong audience or a replayed jti with invalid_client', async () => {
    const verifier = randomToken(40);
    const { privateKey } = await import('jose').then((jose) =>
      jose.generateKeyPair('RS256', { extractable: true }),
    );
    const foreignKey = { ...(await import('jose').then((jose) => jose.exportJWK(privateKey))), alg: 'RS256' };
    const cases = [
      await assertion({ key: foreignKey }),
      await assertion({ aud: 'https://somewhere.else.test/token' }),
    ];
    for (const clientAssertion of cases) {
      const code = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
      const response = await redeem(code, verifier, clientAssertion);
      expect(response).toMatchObject({ status: 401, json: { error: 'invalid_client' } });
    }
    const once = await assertion({ jti: 'only-once' });
    const first = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
    expect((await redeem(first, verifier, once)).status).toBe(200);
    const second = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
    const replay = await redeem(second, verifier, once);
    expect(replay).toMatchObject({ status: 401, json: { error: 'invalid_client' } });
    expect(replay.json.error_description).toMatch(/jti/);
  });

  it('requires private_key_jwt from a client registered for it', async () => {
    const verifier = randomToken(40);
    const code = (await authorize({ code_challenge: pkceChallenge(verifier) })).searchParams.get('code')!;
    const response = await postForm(pg.app, '/ref/as/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: MIMOTO_CLIENT_ID,
    });
    expect(response).toMatchObject({ status: 401, json: { error: 'invalid_client' } });
  });

  it('does not redirect to an unregistered redirect_uri', async () => {
    const response = await pg.app.inject({
      method: 'GET',
      url: `/ref/as/authorize?response_type=code&client_id=${MIMOTO_CLIENT_ID}&redirect_uri=${encodeURIComponent('https://evil.test/cb')}&code_challenge=x&code_challenge_method=S256`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });

  it('the client reports an authorization error from the redirect', async () => {
    const error = await fetchViaAuthorizationCode(`${ISSUER_BASE}/draft13`, {
      configurationId: 'FarmerCredential_ldp_vc',
      clientId: PUBLIC_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scope: 'not-a-scope',
      fetch: pg.fetch,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Oid4vciClientError);
    expect(error).toMatchObject({ code: 'AUTHORIZATION_FAILED', oauthError: 'invalid_scope' });
  });
});
