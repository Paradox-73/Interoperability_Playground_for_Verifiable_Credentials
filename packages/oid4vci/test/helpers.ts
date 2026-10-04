/**
 * One in-process playground for the tests: the reference issuer at `/ref/issuer`, the test
 * authorization server at `/ref/as`, the RFC 8615 root well-known routes, and a `fetch` that reaches
 * them through `app.inject()`. Time is `Date.now()` plus an offset the test can move forward.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, type JWK } from 'jose';
import {
  createReferenceIssuer,
  createTestAuthorizationServer,
  injectFetch,
  registerRootWellKnown,
  type FetchFn,
  type InjectExchange,
  type ReferenceIssuer,
  type ReferenceIssuerOptions,
  type TestAuthorizationServer,
} from '../src/index.js';

export const ORIGIN = 'http://localhost:28100';
export const ISSUER_BASE = `${ORIGIN}/ref/issuer`;
export const AS_BASE = `${ORIGIN}/ref/as`;
export const MIMOTO_CLIENT_ID = 'mimoto-test-client';
export const PUBLIC_CLIENT_ID = 'reference-wallet';
export const REDIRECT_URI = 'http://localhost:28004/redirect';

export interface Playground {
  app: FastifyInstance;
  issuer: ReferenceIssuer;
  as: TestAuthorizationServer;
  fetch: FetchFn;
  exchanges: InjectExchange[];
  clock: () => number;
  advance(seconds: number): void;
  /** Private JWK of the `private_key_jwt` client (RSA, like Mimoto's PKCS#12 key). */
  clientKey: JWK;
}

export async function startPlayground(
  issuerOptions: Partial<ReferenceIssuerOptions> = {},
): Promise<Playground> {
  let offset = 0;
  const clock = () => Date.now() + offset;
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const clientKey: JWK = { ...(await exportJWK(privateKey)), alg: 'RS256', kid: 'mimoto-client-key' };
  const clientPublic: JWK = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'mimoto-client-key' };

  const as = await createTestAuthorizationServer({
    issuer: AS_BASE,
    clients: [
      {
        clientId: MIMOTO_CLIENT_ID,
        redirectUris: [REDIRECT_URI],
        authMethod: 'private_key_jwt',
        jwks: { keys: [clientPublic] },
      },
      { clientId: PUBLIC_CLIENT_ID, redirectUris: [REDIRECT_URI], authMethod: 'none' },
    ],
    scopesSupported: [
      'openid',
      'profile',
      'email',
      'farmer_ldp_vc',
      'farmer_ldp_vc_v2',
      'farmer_vc_sd_jwt',
      'farmer_dc_sd_jwt',
    ],
    audience: ISSUER_BASE,
    clock,
  });
  const issuer = createReferenceIssuer({
    baseUrl: ISSUER_BASE,
    authorizationServer: { issuer: AS_BASE, jwks: as.jwks() },
    clock,
    ...issuerOptions,
  });

  const app = Fastify({ logger: false });
  await app.register(issuer.plugin, { prefix: '/ref/issuer' });
  await app.register(as.plugin, { prefix: '/ref/as' });
  registerRootWellKnown(app, [...issuer.wellKnownDocuments, ...as.wellKnownDocuments]);
  await app.ready();

  const exchanges: InjectExchange[] = [];
  return {
    app,
    issuer,
    as,
    fetch: injectFetch(app, ORIGIN, exchanges),
    exchanges,
    clock,
    advance: (seconds) => {
      offset += seconds * 1000;
    },
    clientKey,
  };
}

/** Raw JSON POST through `app.inject`, for error cases the client would never send. */
export async function postJson(
  app: FastifyInstance,
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    payload: JSON.stringify(body),
  });
  return { status: response.statusCode, json: response.json() };
}

export async function postForm(
  app: FastifyInstance,
  path: string,
  form: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: path,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(form).toString(),
  });
  return { status: response.statusCode, json: response.json() };
}
