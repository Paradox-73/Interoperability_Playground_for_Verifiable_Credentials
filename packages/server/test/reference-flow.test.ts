/**
 * The walking skeleton: reference issuer -> reference wallet -> reference verifier through the real
 * orchestrator, hosted routes and recording layer, for both mandatory formats and both OpenID4VP
 * profiles. Each exchange must be recorded exactly once, at the capture point that saw it.
 */
import { InteropReportSchema, type RecordedExchange } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function runCell(body: Record<string, unknown>) {
  app = await buildTestApp();
  const created = await app.inject({ method: 'POST', url: '/api/runs', payload: body });
  expect(created.statusCode).toBe(201);
  const { runId } = created.json<{ runId: string }>();
  const report = await app.playground.orchestrator.wait(runId);
  const exchanges = app.playground.store.listExchanges(runId);
  return { runId, report, exchanges };
}

const REFERENCE_CELL = { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier' } as const;

function steps(exchanges: readonly RecordedExchange[]): string[] {
  return exchanges.map((exchange) => exchange.step ?? 'untagged');
}

describe('reference flow (OpenID4VCI draft 13 + OpenID4VP inji-draft)', () => {
  it.each(['ldp_vc', 'vc+sd-jwt'] as const)(
    '%s: issue, hold, present, verify -> verdict pass',
    async (format) => {
      const { report, exchanges } = await runCell({ ...REFERENCE_CELL, format });
      expect(InteropReportSchema.parse(report)).toMatchObject({
        mode: 'reference',
        format,
        outcome: 'VALID',
        verdict: 'pass',
        vciProfile: 'draft13',
        vpProfile: 'inji-draft',
      });
      expect(report.error).toBeUndefined();
      expect(report.credentialProof).toBe(format === 'ldp_vc' ? 'Ed25519Signature2020' : 'EdDSA');
      expect(report.issuerDid).toMatch(/^did:key:/);

      // Every protocol exchange went to a hosted role, so the inbound recorder stored all of them.
      expect(exchanges.every((exchange) => exchange.capture === 'inbound')).toBe(true);
      expect(steps(exchanges)).toEqual([
        'issuer.offer',
        'issuer.metadata',
        'as.metadata',
        'token',
        'credential',
        'wallet.fetch-request',
        'wallet.submit',
      ]);
      expect(exchanges.map((exchange) => exchange.to)).toEqual([
        'ref-issuer',
        'ref-issuer',
        'ref-issuer',
        'ref-issuer',
        'ref-issuer',
        'ref-verifier',
        'ref-verifier',
      ]);
      expect(new Set(exchanges.map((exchange) => exchange.from))).toEqual(new Set(['ref-wallet']));
      // No duplicates: one record per request.
      const keys = exchanges.map((exchange) => `${exchange.request.method} ${exchange.request.url}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(exchanges.map((exchange) => exchange.seq)).toEqual(exchanges.map((_, index) => index + 1));

      const credential = exchanges.find((exchange) => exchange.step === 'credential');
      expect(credential?.response?.status).toBe(200);
      expect(credential?.request.body).toContain('"proof"');
      const submit = exchanges.find((exchange) => exchange.step === 'wallet.submit');
      expect(submit?.request.headers['content-type']).toContain('application/x-www-form-urlencoded');
      expect(submit?.request.body).toContain('vp_token=');
      expect(submit?.request.body).toContain('presentation_submission=');
      // Attribution headers are a playground detail and never part of the recorded request.
      expect(
        Object.keys(submit?.request.headers ?? {}).some((name) => name.startsWith('x-playground-')),
      ).toBe(false);
    },
  );

  it('final-1.0 (DCQL) with OpenID4VCI 1.0 also passes for vc+sd-jwt', async () => {
    const { report, exchanges } = await runCell({
      ...REFERENCE_CELL,
      format: 'vc+sd-jwt',
      vciProfile: 'v1',
      vpProfile: 'final-1.0',
    });
    expect(report).toMatchObject({ outcome: 'VALID', verdict: 'pass' });
    expect(steps(exchanges)).toContain('nonce');
    const request = exchanges.find((exchange) => exchange.step === 'wallet.fetch-request');
    expect(request?.response?.headers['content-type']).toContain('oauth-authz-req+jwt');
  });

  it('streams artefacts and step events for the timeline', async () => {
    const { runId } = await runCell({ ...REFERENCE_CELL, format: 'vc+sd-jwt' });
    const events = app!.playground.store.listEvents(runId);
    const artefacts = events.flatMap((event) => (event.type === 'artifact' ? [event.kind] : []));
    expect(artefacts).toEqual(['offer', 'credential', 'request-object', 'vp-token', 'result']);
    const started = events.flatMap((event) => (event.type === 'step.started' ? [event.step] : []));
    expect(started).toEqual([
      'issuer.offer',
      'issuer.metadata',
      'as.metadata',
      'token',
      'credential',
      'verifier.request',
      'wallet.fetch-request',
      'wallet.submit',
      'verifier.result',
    ]);
  });
});
