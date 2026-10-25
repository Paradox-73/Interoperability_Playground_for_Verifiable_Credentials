// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * What the holder-web profile needs from the server without the stack: the test authorization server issues
 * tokens for certify-ac's scopes with certify-ac's credential endpoint as audience (the value certify-ac checks
 * in `mosip.certify.authn.allowed-audiences`), and every other scope keeps the reference issuer's audience.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { REFERENCE_WALLET_CLIENT_ID } from '../src/hosting/reference-hosting.js';
import { buildTestApp } from './helpers.js';

const ORIGIN = 'http://localhost:28100';
const CALLBACK = `${ORIGIN}/ref/wallet/callback`;

let app: FastifyInstance | undefined;
let runDir: string | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (runDir) rmSync(runDir, { recursive: true, force: true });
  runDir = undefined;
});

/** The server as `PLAYGROUND_STACK=host` starts it; without a stack it does not offer certify-ac's scopes. */
async function withStack(env: Record<string, string> = {}): Promise<FastifyInstance> {
  runDir = mkdtempSync(join(tmpdir(), 'ps02-holder-web-'));
  return buildTestApp({ env: { PLAYGROUND_STACK: 'host', PLAYGROUND_RUN_DIR: runDir, ...env } });
}

async function authorize(server: FastifyInstance, scope: string, verifier: string) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: REFERENCE_WALLET_CLIENT_ID,
    redirect_uri: CALLBACK,
    scope,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'state-1',
  });
  const approved = await server.inject({ method: 'GET', url: `/ref/as/authorize?${query.toString()}` });
  expect(approved.statusCode, approved.body).toBe(302);
  return new URL(String(approved.headers.location)).searchParams;
}

/** Authorization code flow with PKCE for the reference wallet's public client; the access token's claims. */
async function tokenClaims(server: FastifyInstance, scope: string): Promise<Record<string, unknown>> {
  const verifier = randomBytes(32).toString('base64url');
  const redirect = await authorize(server, scope, verifier);
  const code = redirect.get('code');
  expect(code, redirect.toString()).toBeTruthy();
  const token = await server.inject({
    method: 'POST',
    url: '/ref/as/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: CALLBACK,
      code_verifier: verifier,
      client_id: REFERENCE_WALLET_CLIENT_ID,
    }).toString(),
  });
  expect(token.statusCode, token.body).toBe(200);
  const accessToken = token.json<{ access_token: string }>().access_token;
  return JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

describe('test authorization server for certify-ac', () => {
  it('gives certify-ac scopes certify-ac’s credential endpoint as audience', async () => {
    app = await withStack();
    const claims = await tokenClaims(app, 'farmer_sd_jwt');
    expect(claims.aud).toBe('https://ref.ps02.test/proxy/certify-ac/v1/certify/issuance/credential');
    expect(claims.iss).toBe(`${ORIGIN}/ref/as`);
  });

  it('follows INJI_CERTIFY_AC_ISSUER', async () => {
    app = await withStack({ INJI_CERTIFY_AC_ISSUER: 'https://certify-ac.example/' });
    const claims = await tokenClaims(app, 'mock_identity_vc_ldp');
    expect(claims.aud).toBe('https://certify-ac.example/v1/certify/issuance/credential');
  });

  it('keeps the reference issuer as audience for its own scopes, and has no certify-ac scopes without a stack', async () => {
    app = await withStack();
    expect((await tokenClaims(app, 'farmer_ldp_vc')).aud).toBe(`${ORIGIN}/ref/issuer`);
    await app.close();
    app = await buildTestApp();
    const refused = await authorize(app, 'farmer_sd_jwt', randomBytes(32).toString('base64url'));
    expect(refused.get('error')).toBe('invalid_scope');
  });
});
