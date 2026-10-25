// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The scenario catalogue through the server: every scenario that applies to the reference roles, in
 * every applicable format and both OpenID4VP profiles, started with `POST /api/runs` and carried out
 * by the real orchestrator, hosted roles and recording layer. The verdict must be `pass`: the
 * reference verifier reported the outcome the scenario expects. Combinations a scenario cannot be
 * produced on are stored as `not-supported`, never attempted.
 */
import { InteropReportSchema, type InteropReport } from '@inji-playground/protocol';
import { referenceCells, scenarioCatalog } from '@inji-playground/scenarios';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

const REFERENCE = { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier' } as const;

async function run(server: FastifyInstance, body: Record<string, unknown>): Promise<InteropReport> {
  const created = await server.inject({ method: 'POST', url: '/api/runs', payload: body });
  expect(created.statusCode, created.body).toBe(201);
  const { runId } = created.json<{ runId: string }>();
  return InteropReportSchema.parse(await server.playground.orchestrator.wait(runId));
}

describe('scenario catalogue x reference roles, through the server', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  // Catalogue order runs the happy path first, so vp-replay has an earlier presentation to replay.
  const cells = referenceCells(scenarioCatalog);

  it.each(
    cells.map((cell) => [cell.scenario.id, cell.format, cell.vpProfile, cell.scenario.expected] as const),
  )(
    '%s, %s, %s -> %s, verdict pass',
    async (scenario, format, vpProfile, expected) => {
      const report = await run(app, {
        ...REFERENCE,
        format,
        vpProfile,
        vciProfile: vpProfile === 'inji-draft' ? 'draft13' : 'v1',
        scenario,
      });
      expect({ outcome: report.outcome, verdict: report.verdict }, JSON.stringify(report.error)).toEqual({
        outcome: expected,
        verdict: 'pass',
      });
      expect(report.scenario).toEqual({ id: scenario, expected });
    },
    20_000,
  );

  it('signs with the DID method a probe asks for', async () => {
    const didJwk = await run(app, { ...REFERENCE, format: 'vc+sd-jwt', scenario: 'issuer-did-jwk' });
    expect(didJwk.issuerDid).toMatch(/^did:jwk:/);
    const didKey = await run(app, { ...REFERENCE, format: 'ldp_vc', scenario: 'issuer-did-key' });
    expect(didKey.issuerDid).toMatch(/^did:key:/);
  });

  it('the reference verifier trusts the reference issuers, and only them and the configured DIDs', async () => {
    const happy = await run(app, { ...REFERENCE, format: 'vc+sd-jwt', scenario: 'happy' });
    expect(happy.outcome).toBe('VALID');
    const selfIssued = await run(app, { ...REFERENCE, format: 'vc+sd-jwt', scenario: 'self-issued' });
    expect(selfIssued).toMatchObject({ outcome: 'INVALID', verdict: 'pass' });
    // The verification result the inspector shows names the reason.
    const result = app.playground.store
      .listEvents(selfIssued.runId)
      .find((event) => event.type === 'artifact' && event.kind === 'result');
    expect(result && 'raw' in result ? result.raw : '').toContain('ISSUER_UNTRUSTED');
  });

  it.each(['ldp_vc', 'vc+sd-jwt'])(
    'a revoked %s is refused for its status, read from the issuer status list the run records',
    async (format) => {
      const report = await run(app, { ...REFERENCE, format, scenario: 'revoked' });
      expect(report).toMatchObject({ outcome: 'INVALID', verdict: 'pass' });
      const result = app.playground.store
        .listEvents(report.runId)
        .find((event) => event.type === 'artifact' && event.kind === 'result');
      expect(result && 'raw' in result ? result.raw : '').toContain('STATUS_REVOKED');
      const statusFetch = app.playground.store
        .listExchanges(report.runId)
        .find((exchange) => exchange.request.url.includes('/ref/issuer/status/'));
      expect(statusFetch?.response?.status).toBe(200);
    },
  );

  it('records a tampered presentation as it was sent, and the verifier that rejected it', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { ...REFERENCE, format: 'vc+sd-jwt', scenario: 'kb-wrong-aud' },
    });
    const { runId } = created.json<{ runId: string }>();
    const report = await app.playground.orchestrator.wait(runId);
    expect(report).toMatchObject({ outcome: 'INVALID', verdict: 'pass' });
    const vpToken = app.playground.store
      .listEvents(runId)
      .find((event) => event.type === 'artifact' && event.kind === 'vp-token');
    const submit = app.playground.store
      .listExchanges(runId)
      .find((exchange) => exchange.step === 'wallet.submit');
    const sent = vpToken && 'raw' in vpToken ? vpToken.raw : undefined;
    expect(sent).toBeTruthy();
    expect(new URLSearchParams(submit?.request.body ?? '').get('vp_token')).toBe(sent);
  });
});

describe('combinations a scenario cannot be produced on', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('are stored as not-supported with the reason, not attempted', async () => {
    app = await buildTestApp();
    const phone = await run(app, {
      ...REFERENCE,
      wallet: 'mobile-wallet',
      format: 'ldp_vc',
      scenario: 'bad-signature',
    });
    expect(phone).toMatchObject({ verdict: 'not-supported', outcome: 'NOT_RUN' });
    expect(phone.error?.code).toBe('compatibility.scenario.wallet-unsupported');
    expect(phone.error?.message).toMatch(/needs the wallet ref-wallet/);

    // holder-did-canonical needs Inji Certify (it pads did:jwk); the reference issuer cannot produce it.
    const canonical = await run(app, { ...REFERENCE, format: 'ldp_vc', scenario: 'holder-did-canonical' });
    expect(canonical).toMatchObject({ verdict: 'not-supported' });
    expect(canonical.error?.code).toBe('compatibility.scenario.issuer-unsupported');

    const format = await run(app, { ...REFERENCE, format: 'ldp_vc', scenario: 'kb-wrong-nonce' });
    expect(format.error?.code).toBe('compatibility.scenario.format-unsupported');
    expect(app.playground.store.listExchanges(format.runId)).toEqual([]);

    const compatibility = await app.inject({
      url: '/api/compatibility',
      query: { ...REFERENCE, wallet: 'mobile-wallet', format: 'ldp_vc', scenario: 'expired' },
    });
    expect(compatibility.json()).toMatchObject({ runnable: true });
  });

  it('vp-replay with nothing to replay stops before posting, as an environment error', async () => {
    app = await buildTestApp();
    const report = await run(app, { ...REFERENCE, format: 'vc+sd-jwt', scenario: 'vp-replay' });
    expect(report).toMatchObject({ outcome: 'NOT_RUN', verdict: 'error' });
    expect(report.error?.code).toBe('wallet.no-earlier-presentation');
    const steps = app.playground.store.listExchanges(report.runId).map((exchange) => exchange.step);
    expect(steps).toContain('wallet.fetch-request');
    expect(steps).not.toContain('wallet.submit');
  });
});
