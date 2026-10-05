/**
 * Live runs against the local Inji stack (Inji Certify 0.14.0, Inji Verify 0.18.2): `npm run stack:up`,
 * then `npm run test:live`. The server listens on 28100 because the stack's TLS front sends
 * `ref.ps02.test` and `playground.ps02.test` there (the reference credentials' JSON-LD context).
 *
 * Each cell asserts the outcome measured on 2026-10-05. Where an upstream gap decides the outcome, the
 * test names the gap, checks that the register holds it, and checks that the run stored the failing step
 * and exchange, so a fixed gap shows up as a failing test to update.
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
  const health = await app.inject('/api/stack/status');
  const down = health
    .json<{ services: Array<{ name: string; health: { status: string } }> }>()
    .services.filter((service) => service.name !== 'mimoto' && service.health.status !== 'up');
  if (down.length > 0)
    throw new Error(`Inji stack not ready (${down.map((s) => s.name).join(', ')}): npm run stack:up`);
});

afterAll(async () => {
  await app?.close();
});

const REGISTER = JSON.parse(
  readFileSync(new URL('../../../../docs/gaps/gaps.json', import.meta.url), 'utf8'),
) as Array<{
  id: string;
}>;

async function run(config: Omit<RunConfigInput, 'wallet'> & { wallet?: string }): Promise<InteropReport> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { wallet: 'ref-wallet', ...config },
  });
  expect(created.statusCode, created.body).toBe(201);
  return InteropReportSchema.parse(
    await app.playground.orchestrator.wait(created.json<{ runId: string }>().runId),
  );
}

/** The gap is in the register, the report names the failing step, and the exchange behind it is stored. */
function expectGapEvidence(report: InteropReport, gap: string, step: string, exchangeStep = step): void {
  expect(REGISTER.map((entry) => entry.id)).toContain(gap);
  expect(report.error?.step).toBe(step);
  const exchanges = app.playground.store.listExchanges(report.runId);
  expect(exchanges.some((exchange) => exchange.step === exchangeStep)).toBe(true);
}

describe('Inji Certify -> reference wallet -> Inji Verify (all-Inji issuance and verification)', () => {
  it('vc+sd-jwt is VALID, with every exchange recorded and the image versions in the report', async () => {
    const report = await run({ issuer: 'inji-certify', verifier: 'inji-verify', format: 'vc+sd-jwt' });
    expect(report).toMatchObject({ mode: 'live', outcome: 'VALID', verdict: 'pass' });
    expect(report.issuer.version).toBe('0.14.0');
    expect(report.verifier.version).toBe('0.18.2');
    const exchanges = app.playground.store.listExchanges(report.runId);
    expect(exchanges.map((exchange) => exchange.step)).toEqual(
      expect.arrayContaining([
        'issuer.offer',
        'token',
        'credential',
        'verifier.request',
        'wallet.submit',
        'verifier.result',
      ]),
    );
    expect(new Set(exchanges.map((exchange) => exchange.to))).toEqual(
      new Set(['inji-certify', 'inji-verify']),
    );
  });

  it('ldp_vc is INVALID: Inji Verify rejects the ecdsa-rdfc-2019 holder proof a P-256 holder can make (G15, with G9)', async () => {
    const report = await run({ issuer: 'inji-certify', verifier: 'inji-verify', format: 'ldp_vc' });
    expect(report).toMatchObject({ outcome: 'INVALID', verdict: 'fail' });
    expectGapEvidence(report, 'G15', 'verifier.result');
  });
});

describe('Inji Certify -> reference wallet -> reference verifier', () => {
  it('vc+sd-jwt is VALID once Certify publishes its x5c trust anchors', async () => {
    const report = await run({ issuer: 'inji-certify', verifier: 'ref-verifier', format: 'vc+sd-jwt' });
    expect(report).toMatchObject({ outcome: 'VALID', verdict: 'pass' });
  });

  it('ldp_vc is INVALID: Certify’s did:web document does not authorise its key for assertionMethod (G14)', async () => {
    const report = await run({ issuer: 'inji-certify', verifier: 'ref-verifier', format: 'ldp_vc' });
    expect(report).toMatchObject({ outcome: 'INVALID', verdict: 'fail' });
    // The reference verifier checks in-process; the exchange behind its answer is the wallet's submission.
    expectGapEvidence(report, 'G14', 'verifier.result', 'wallet.submit');
  });
});

describe('reference issuer -> reference wallet -> Inji Verify', () => {
  it.each([
    ['ldp_vc', 'happy', 'VALID'],
    ['ldp_vc', 'expired', 'EXPIRED'],
    ['ldp_vc', 'holder-mismatch', 'INVALID'],
  ] as const)('%s %s -> %s, verdict pass', async (format, scenario, outcome) => {
    const report = await run({ issuer: 'ref-issuer', verifier: 'inji-verify', format, scenario });
    expect({ outcome: report.outcome, verdict: report.verdict }).toEqual({ outcome, verdict: 'pass' });
  });

  it('vc+sd-jwt with a DID-named issuer key is INVALID: Inji Verify needs an x5c header (G16)', async () => {
    const report = await run({ issuer: 'ref-issuer', verifier: 'inji-verify', format: 'vc+sd-jwt' });
    expect(report).toMatchObject({ outcome: 'INVALID', verdict: 'fail' });
    expectGapEvidence(report, 'G16', 'verifier.result');
  });

  it('dc+sd-jwt is not supported: Inji Verify 0.18.2 advertises vc+sd-jwt only', async () => {
    const report = await run({ issuer: 'ref-issuer', verifier: 'inji-verify', format: 'dc+sd-jwt' });
    expect(report).toMatchObject({ verdict: 'not-supported', outcome: 'NOT_RUN' });
  });
});

// Certify's SD-JWT verifies at Inji Verify, so with it the tamper is the only fault in the presentation.
// (The reference issuer's SD-JWT fails at Inji Verify for another reason, G16, and would hide the tamper.)
describe('Inji Certify SD-JWT VC, tampered by the reference wallet -> Inji Verify', () => {
  it.each([
    'bad-signature',
    'altered-disclosure',
    'unreferenced-disclosure',
    'kb-wrong-aud',
    'holder-mismatch',
  ])('%s -> INVALID, verdict pass', async (scenario) => {
    const report = await run({
      issuer: 'inji-certify',
      verifier: 'inji-verify',
      format: 'vc+sd-jwt',
      scenario,
    });
    expect({ outcome: report.outcome, verdict: report.verdict }).toEqual({
      outcome: 'INVALID',
      verdict: 'pass',
    });
  });
});

describe('stored runs', () => {
  it('keeps at least 8 live runs with reports', () => {
    const runs = app.playground.store.listRuns({ mode: 'live', order: 'newest', limit: 100, offset: 0 });
    expect(runs.total).toBeGreaterThanOrEqual(8);
    expect(
      runs.items.every((summary) => summary.status === 'finished' && summary.verdict !== undefined),
    ).toBe(true);
  });
});
