// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The Digital Credentials API pair: `ref-verifier-dc-api` (an unsigned OpenID4VP 1.0 request with
 * `response_mode` `dc_api`) answered in-process by `ref-wallet`, and by `browser-wallet`, whose run page
 * passes the request to the browser and posts the answer. These tests play the page with `inject()`: the
 * `Origin` header is what a browser sends with the page's POST.
 */
import { InteropReportSchema, type PersonAction, type RunEvent } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

const ORIGIN = 'http://localhost:28100';
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function startRun(server: FastifyInstance, body: object): Promise<string> {
  const created = await server.inject({ method: 'POST', url: '/api/runs', payload: body });
  expect(created.statusCode, created.body).toBe(201);
  return created.json<{ runId: string }>().runId;
}

async function dcApiAction(server: FastifyInstance, runId: string): Promise<PersonAction> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const found = server.playground.store
      .listEvents(runId)
      .find(
        (event): event is Extract<RunEvent, { type: 'person.action-needed' }> =>
          event.type === 'person.action-needed' && event.action.kind === 'dc-api',
      );
    if (found) return found.action;
    if (Date.now() > deadline) throw new Error('no dc-api action in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Digital Credentials API roles', () => {
  it.each(['ldp_vc', 'vc+sd-jwt'] as const)(
    'ref-wallet answers ref-verifier-dc-api in-process: %s VALID, bound to the verifier origin',
    async (format) => {
      app = await buildTestApp();
      const runId = await startRun(app, {
        issuer: 'ref-issuer',
        wallet: 'ref-wallet',
        verifier: 'ref-verifier-dc-api',
        format,
        vpProfile: 'final-1.0',
      });
      const report = InteropReportSchema.parse(await app.playground.orchestrator.wait(runId));
      expect(report.outcome, JSON.stringify(report.error)).toBe('VALID');
      const urls = app.playground.store.listExchanges(runId).map((exchange) => exchange.request.url);
      expect(urls.some((url) => url.includes('/ref/verifier/dc-api/requests/'))).toBe(true);
      expect(urls.some((url) => url.includes('/ref/verifier/dc-api/responses/'))).toBe(true);
    },
  );

  it('the inji-draft profile and a direct_post wallet are not supported with the DC API verifier', async () => {
    app = await buildTestApp();
    const check = async (query: string) =>
      (await app!.inject(`/api/compatibility?${query}`)).json<{
        runnable: boolean;
        reasons: { code: string }[];
      }>();
    const draft = await check(
      'issuer=ref-issuer&wallet=ref-wallet&verifier=ref-verifier-dc-api&format=ldp_vc&vpProfile=inji-draft',
    );
    expect(draft.runnable).toBe(false);
    const phone = await check(
      'issuer=ref-issuer&wallet=mobile-wallet&verifier=ref-verifier-dc-api&format=ldp_vc&vpProfile=final-1.0',
    );
    expect(phone.reasons.map((reason) => reason.code)).toContain('presentation.response-mode-mismatch');
  });

  it('browser-wallet: the page reads the request, the playground wallet answers, the page posts it: VALID', async () => {
    app = await buildTestApp();
    const runId = await startRun(app, {
      issuer: 'ref-issuer',
      wallet: 'browser-wallet',
      verifier: 'ref-verifier-dc-api',
      format: 'vc+sd-jwt',
      vpProfile: 'final-1.0',
    });
    const action = await dcApiAction(app, runId);
    expect(action.dcApi?.requestUrl).toMatch(/^\/ref\/verifier\/dc-api\/requests\//);
    const request = await app.inject({ method: 'GET', url: action.dcApi!.requestUrl });
    expect(request.json()).toMatchObject({
      protocol: 'openid4vp-v1-unsigned',
      data: { response_mode: 'dc_api' },
    });
    const answer = await app.inject({
      method: 'POST',
      url: action.dcApi!.providerUrl,
      headers: { origin: ORIGIN },
      payload: request.json(),
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const posted = await app.inject({
      method: 'POST',
      url: action.dcApi!.responseUrl,
      headers: { origin: ORIGIN },
      payload: answer.json(),
    });
    expect(posted.json()).toEqual({ outcome: 'VALID' });
    const report = InteropReportSchema.parse(await app.playground.orchestrator.wait(runId));
    expect(report.outcome).toBe('VALID');
    expect(report.wallet.id).toBe('browser-wallet');
  });

  it('browser-wallet: an answer posted by a page of another origin is INVALID', async () => {
    app = await buildTestApp();
    const runId = await startRun(app, {
      issuer: 'ref-issuer',
      wallet: 'browser-wallet',
      verifier: 'ref-verifier-dc-api',
      format: 'ldp_vc',
      vpProfile: 'final-1.0',
    });
    const action = await dcApiAction(app, runId);
    const request = (await app.inject({ method: 'GET', url: action.dcApi!.requestUrl })).json<object>();
    const foreign = 'https://attacker.example';
    const answer = await app.inject({
      method: 'POST',
      url: action.dcApi!.providerUrl,
      headers: { origin: foreign },
      payload: request,
    });
    const posted = await app.inject({
      method: 'POST',
      url: action.dcApi!.responseUrl,
      headers: { origin: foreign },
      payload: answer.json(),
    });
    expect(posted.json()).toEqual({ outcome: 'INVALID' });
    const report = InteropReportSchema.parse(await app.playground.orchestrator.wait(runId));
    expect(report.outcome).toBe('INVALID');
  });

  it('the provider endpoint answers only for a browser-wallet run that is waiting', async () => {
    app = await buildTestApp();
    const runId = await startRun(app, {
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'ref-verifier',
      format: 'vc+sd-jwt',
    });
    await app.playground.orchestrator.wait(runId);
    const body = { protocol: 'openid4vp-v1-unsigned', data: {} };
    const wrongWallet = await app.inject({
      method: 'POST',
      url: `/api/runs/${runId}/dc-api/provider`,
      payload: body,
    });
    expect(wrongWallet.statusCode).toBe(409);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/runs/nope/dc-api/provider',
      payload: body,
    });
    expect(missing.statusCode).toBe(404);
  });
});
