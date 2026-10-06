/**
 * Live runs with Inji Web (Mimoto 0.22.0 behind Inji Web 0.17.0) and certify-ac, the authorization code
 * Inji Certify of the holder-web profile (part of the default `npm run stack:up`), then
 * `npm run test:live`. The server listens on 28100 with the public URL https://ref.ps02.test, because Mimoto
 * and certify-ac reach the test authorization server and the reference issuer there (via the TLS front).
 *
 * Each cell asserts the outcome measured on 2026-10-05; a cell decided by an upstream gap names it and
 * checks the stored evidence, so a fixed gap shows up as a failing test to update.
 */
import { readFileSync } from 'node:fs';
import { InteropReportSchema, type InteropReport, type RunConfigInput } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';

const PORT = 28_100;
let app: FastifyInstance;

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    PLAYGROUND_STACK: 'host',
    PLAYGROUND_PORT: String(PORT),
    PLAYGROUND_PUBLIC_URL: 'https://ref.ps02.test',
    PLAYGROUND_DB: ':memory:',
    PLAYGROUND_LOG_LEVEL: 'warn',
  });
  app = await buildApp({ config, logger: false });
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
  } catch (error) {
    await app.close();
    throw new Error(
      `port ${PORT} is taken: stop the playground server before npm run test:live (${String(error)})`,
    );
  }
  const probes = {
    'certify-ac': 'http://localhost:28093/v1/certify/.well-known/openid-credential-issuer',
    mimoto: 'http://localhost:28099/v1/mimoto/issuers',
    'verify-service': 'http://localhost:28080/v1/verify/actuator/health',
  };
  const down: string[] = [];
  for (const [name, url] of Object.entries(probes)) {
    const ok = await fetch(url, { signal: AbortSignal.timeout(10_000) }).then(
      (response) => response.ok,
      () => false,
    );
    if (!ok) down.push(name);
  }
  if (down.length > 0) {
    throw new Error(`holder-web stack not ready (${down.join(', ')}): npm run stack:up`);
  }
});

afterAll(async () => {
  await app?.close();
});

const REGISTER = JSON.parse(
  readFileSync(new URL('../../../../docs/gaps/gaps.json', import.meta.url), 'utf8'),
) as Array<{ id: string }>;

async function run(config: RunConfigInput): Promise<InteropReport> {
  const created = await app.inject({ method: 'POST', url: '/api/runs', payload: config });
  expect(created.statusCode, created.body).toBe(201);
  return InteropReportSchema.parse(
    await app.playground.orchestrator.wait(created.json<{ runId: string }>().runId),
  );
}

function exchangesOf(report: InteropReport) {
  return app.playground.store.listExchanges(report.runId);
}

/** The gap is in the register and the report names the step that failed. */
function expectGap(report: InteropReport, gap: string, step: string): void {
  expect(REGISTER.map((entry) => entry.id)).toContain(gap);
  expect(report.error?.step).toBe(step);
}

describe('certify-ac -> reference wallet -> Inji Verify', () => {
  it('vc+sd-jwt is VALID: certify-ac accepts access tokens of the test authorization server', async () => {
    const report = await run({
      issuer: 'inji-certify-ac',
      wallet: 'ref-wallet',
      verifier: 'inji-verify',
      format: 'vc+sd-jwt',
    });
    expect(report).toMatchObject({ mode: 'live', outcome: 'VALID', verdict: 'pass' });
    const exchanges = exchangesOf(report);
    expect(
      exchanges.some((exchange) => exchange.step === 'credential' && exchange.to === 'inji-certify-ac'),
    ).toBe(true);
  });
});

describe('certify-ac -> Inji Web -> Inji Verify', () => {
  it('ldp_vc: all Inji, Mimoto downloads from certify-ac and the presentation is VALID (G22 worked around)', async () => {
    const report = await run({
      issuer: 'inji-certify-ac',
      wallet: 'inji-web',
      verifier: 'inji-verify',
      format: 'ldp_vc',
    });
    expect(report).toMatchObject({ outcome: 'VALID', verdict: 'pass' });
    expect(report.wallet.version).toBe('0.17.0 + Mimoto 0.22.0');
    const exchanges = exchangesOf(report);
    // Mimoto's own calls, recorded through /ref/* and /proxy/certify-ac: the token request and the credential.
    expect(
      exchanges.some(
        (exchange) => exchange.to === 'ref-as' && /\/ref\/as\/token$/.test(exchange.request.url),
      ),
    ).toBe(true);
    expect(
      exchanges.some((exchange) => exchange.step === 'credential' && exchange.to === 'inji-certify-ac'),
    ).toBe(true);
    // The signed-in wallet's presentation reached Inji Verify.
    expect(exchanges.some((exchange) => exchange.step === 'wallet.submit')).toBe(true);
    // The credential is read from Mimoto's recorded call to certify-ac.
    expect(report.credentialProof).toBe('Ed25519Signature2020');
  });

  it('vc+sd-jwt: Mimoto stores the credential but offers nothing to present (G25)', async () => {
    const report = await run({
      issuer: 'inji-certify-ac',
      wallet: 'inji-web',
      verifier: 'inji-verify',
      format: 'vc+sd-jwt',
    });
    expect(report).toMatchObject({ outcome: 'ERROR', verdict: 'fail' });
    expect(report.error?.code).toBe('wallet.no-matching-credential');
    expectGap(report, 'G25', 'wallet.fetch-request');
    expect(report.credentialProof).toMatch(/^(ES|RS|PS)\d{3}$|^EdDSA$/);
  });
});

describe('reference issuer -> Inji Web', () => {
  it('-> Inji Verify ldp_vc: Mimoto runs the authorization code flow at /ref/*, the presentation is VALID (G22 worked around)', async () => {
    const report = await run({
      issuer: 'ref-issuer',
      wallet: 'inji-web',
      verifier: 'inji-verify',
      format: 'ldp_vc',
    });
    expect(report).toMatchObject({ outcome: 'VALID', verdict: 'pass' });
    const exchanges = exchangesOf(report);
    // Mimoto's token request (private_key_jwt) and credential request to the reference roles.
    expect(
      exchanges.some(
        (exchange) =>
          exchange.to === 'ref-as' &&
          /\/ref\/as\/token$/.test(exchange.request.url) &&
          exchange.response?.status === 200,
      ),
    ).toBe(true);
    expect(exchanges.some((exchange) => exchange.step === 'credential' && exchange.to === 'ref-issuer')).toBe(
      true,
    );
  });

  it('-> reference verifier ldp_vc: Mimoto refuses the request, its filters have no pattern (G23)', async () => {
    const report = await run({
      issuer: 'ref-issuer',
      wallet: 'inji-web',
      verifier: 'ref-verifier',
      format: 'ldp_vc',
    });
    expect(report).toMatchObject({ outcome: 'ERROR', verdict: 'fail' });
    expect(report.error?.message).toContain('filter->pattern');
    expectGap(report, 'G23', 'wallet.fetch-request');
  });
});
