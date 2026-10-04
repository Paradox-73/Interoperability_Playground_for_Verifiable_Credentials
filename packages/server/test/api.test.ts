/**
 * REST routes through `app.inject()`: catalogue, runs (create, list with filters, detail, events,
 * exchanges, cancel, person-done, verifier-callback), error bodies and the OpenAPI document.
 */
import {
  ApiErrorSchema,
  CompatibilityResultSchema,
  RecordedExchangeSchema,
  RoleListResponseSchema,
  RunDetailSchema,
  RunEventListSchema,
  RunListResponseSchema,
  StackStatusResponseSchema,
} from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_CELL, buildTestApp, fakeSet, registrations, type FakeSetOptions } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(options: FakeSetOptions = {}) {
  app = await buildTestApp({ roles: registrations(fakeSet(options).roles) });
  return app;
}

async function createRun(server: FastifyInstance, body: object): Promise<string> {
  const res = await server.inject({ method: 'POST', url: '/api/runs', payload: body });
  expect(res.statusCode, res.body).toBe(201);
  const { runId } = res.json<{ runId: string }>();
  expect(res.headers.location).toBe(`/api/runs/${runId}`);
  return runId;
}

describe('catalogue routes', () => {
  it('lists roles with health, filtered by kind', async () => {
    const server = await start();
    const all = RoleListResponseSchema.parse((await server.inject('/api/roles')).json());
    expect(all.map((entry) => entry.descriptor.id)).toEqual(['fake-issuer', 'fake-wallet', 'fake-verifier']);
    expect(all.every((entry) => entry.health.status === 'up')).toBe(true);
    const wallets = RoleListResponseSchema.parse((await server.inject('/api/roles?kind=wallet')).json());
    expect(wallets.map((entry) => entry.descriptor.id)).toEqual(['fake-wallet']);
    expect((await server.inject('/api/roles?kind=printer')).statusCode).toBe(400);
  });

  it('reports the stack mode and role health on /api/stack/status', async () => {
    const server = await start({ verifier: { health: 'down' } });
    const body = StackStatusResponseSchema.parse((await server.inject('/api/stack/status')).json());
    expect(body.mode).toBe('off');
    expect(body.roles.find((entry) => entry.descriptor.id === 'fake-verifier')?.health.status).toBe('down');
  });

  it('lists scenarios', async () => {
    const server = await start();
    const res = await server.inject('/api/scenarios');
    expect(res.json()).toEqual([expect.objectContaining({ id: 'happy', expected: 'VALID' })]);
  });

  it('answers the compatibility question with reasons', async () => {
    const server = await start({ wallet: { vpProfiles: ['inji-draft'] } });
    const ok = CompatibilityResultSchema.parse(
      (await server.inject({ url: '/api/compatibility', query: { ...FAKE_CELL } })).json(),
    );
    expect(ok).toEqual({ runnable: true, mode: 'reference', reasons: [] });

    const no = CompatibilityResultSchema.parse(
      (
        await server.inject({ url: '/api/compatibility', query: { ...FAKE_CELL, vpProfile: 'final-1.0' } })
      ).json(),
    );
    expect(no.runnable).toBe(false);
    expect(no.reasons).toEqual([
      expect.objectContaining({ code: 'wallet.vp-profile-unsupported', roles: ['fake-wallet'] }),
    ]);

    const unknown = await server.inject({
      url: '/api/compatibility',
      query: { ...FAKE_CELL, issuer: 'nope' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(unknown.json()).error).toBe('unknown-role');
  });
});

describe('runs', () => {
  it('creates a run, then serves its detail, events and exchanges', async () => {
    const server = await start();
    const runId = await createRun(server, FAKE_CELL);
    await server.playground.orchestrator.wait(runId);

    const detail = RunDetailSchema.parse((await server.inject(`/api/runs/${runId}`)).json());
    expect(detail).toMatchObject({ runId, status: 'finished', verdict: 'pass', outcome: 'VALID' });
    expect(detail.report?.issuer).toEqual({
      id: 'fake-issuer',
      name: 'Test role (fake) issuer',
      version: 'fake',
      ecosystem: 'reference',
    });

    const events = RunEventListSchema.parse((await server.inject(`/api/runs/${runId}/events`)).json());
    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.finished');
    const tail = RunEventListSchema.parse(
      (await server.inject(`/api/runs/${runId}/events?after=${events.length - 1}`)).json(),
    );
    expect(tail.map((event) => event.type)).toEqual(['run.finished']);

    const exchanges = (await server.inject(`/api/runs/${runId}/exchanges`)).json<unknown[]>();
    expect(exchanges.map((x) => RecordedExchangeSchema.parse(x))).toEqual([]);

    expect((await server.inject('/api/runs/unknown-run')).statusCode).toBe(404);
    expect((await server.inject('/api/runs/unknown-run/events')).statusCode).toBe(404);
  });

  it('refuses malformed requests with the API error body', async () => {
    const server = await start();
    const missing = await server.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { issuer: 'fake-issuer' },
    });
    expect(missing.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(missing.json()).error).toBe('bad-request');

    const badFormat = await server.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { ...FAKE_CELL, format: 'jwt_vc' },
    });
    expect(badFormat.statusCode).toBe(400);

    const replay = await server.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { replayOf: 'never-ran' },
    });
    expect(replay.statusCode).toBe(404);
    expect(replay.json()).toMatchObject({ error: 'replay-not-found' });
  });

  it('filters the history by format and verdict, newest first, with paging (TC_PG_API_01)', async () => {
    const server = await start({ verifier: { formats: ['vc+sd-jwt', 'ldp_vc'] } });
    const ids = {
      sdjwt: await createRun(server, FAKE_CELL),
      ldp: await createRun(server, { ...FAKE_CELL, format: 'ldp_vc' }),
      unsupported: await createRun(server, { ...FAKE_CELL, format: 'mso_mdoc' }),
    };
    for (const id of Object.values(ids)) await server.playground.orchestrator.wait(id);

    const list = async (query: Record<string, string>) =>
      RunListResponseSchema.parse((await server.inject({ url: '/api/runs', query })).json());

    const all = await list({});
    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.runId)).toEqual([ids.unsupported, ids.ldp, ids.sdjwt]);

    expect((await list({ format: 'ldp_vc' })).items.map((item) => item.runId)).toEqual([ids.ldp]);
    expect((await list({ verdict: 'pass' })).items.map((item) => item.runId)).toEqual([ids.ldp, ids.sdjwt]);
    expect((await list({ verdict: 'not-supported' })).items.map((item) => item.runId)).toEqual([
      ids.unsupported,
    ]);
    expect((await list({ format: 'vc+sd-jwt', verdict: 'pass' })).items.map((item) => item.runId)).toEqual([
      ids.sdjwt,
    ]);
    expect((await list({ verdict: 'fail' })).total).toBe(0);
    expect((await list({ version: 'fake', issuer: 'fake-issuer' })).total).toBe(3);

    const page = await list({ limit: '1', offset: '1' });
    expect(page).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(page.items.map((item) => item.runId)).toEqual([ids.ldp]);

    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await list({ from: future })).total).toBe(0);
    expect((await list({ to: future })).total).toBe(3);

    expect((await server.inject({ url: '/api/runs', query: { verdict: 'maybe' } })).statusCode).toBe(400);
  });

  it('replays a stored run through the API', async () => {
    const server = await start();
    const original = await createRun(server, FAKE_CELL);
    await server.playground.orchestrator.wait(original);
    const replay = await createRun(server, { replayOf: original });
    await server.playground.orchestrator.wait(replay);
    const detail = RunDetailSchema.parse((await server.inject(`/api/runs/${replay}`)).json());
    expect(detail.config).toMatchObject({ ...FAKE_CELL, replayOf: original });
    expect(detail.report?.replayOf).toBe(original);
  });

  it('cancels a running run and refuses to cancel it twice', async () => {
    const server = await start({ verifier: { hangIn: 'awaitResult' } });
    const runId = await createRun(server, FAKE_CELL);
    const cancel = await server.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
    expect(cancel.statusCode).toBe(202);
    const report = await server.playground.orchestrator.wait(runId);
    expect(report.error?.code).toBe('run.cancelled');
    const again = await server.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'run-finished' });
    expect((await server.inject({ method: 'POST', url: '/api/runs/no-such-run/cancel' })).statusCode).toBe(
      404,
    );
  });

  it('shows the pending person action in the detail and continues on person-done', async () => {
    const server = await start({ wallet: { interaction: 'manual' } });
    const runId = await createRun(server, FAKE_CELL);
    const pending = async () =>
      RunDetailSchema.parse((await server.inject(`/api/runs/${runId}`)).json()).pendingAction;

    await until(async () => (await pending()) !== undefined);
    expect((await pending())?.kind).toBe('scan-offer');
    const wrong = await server.inject({
      method: 'POST',
      url: `/api/runs/${runId}/person-done`,
      payload: { actionId: 'nope' },
    });
    expect(wrong.statusCode).toBe(409);
    expect((await server.inject({ method: 'POST', url: `/api/runs/${runId}/person-done` })).statusCode).toBe(
      202,
    );

    await until(async () => (await pending())?.kind === 'scan-request');
    const action = await pending();
    const done = await server.inject({
      method: 'POST',
      url: `/api/runs/${runId}/person-done`,
      payload: { actionId: action!.id },
    });
    expect(done.statusCode).toBe(202);
    expect((await server.playground.orchestrator.wait(runId)).verdict).toBe('pass');
    expect((await server.inject({ method: 'POST', url: `/api/runs/${runId}/person-done` })).statusCode).toBe(
      409,
    );
  });

  it('hands a verifier callback to the run (TC_PG_API_02)', async () => {
    const server = await start({ verifier: { interaction: 'browser' } });
    const runId = await createRun(server, FAKE_CELL);
    const res = await server.inject({
      method: 'POST',
      url: `/api/runs/${runId}/verifier-callback`,
      payload: { kind: 'vp-received', transactionId: 'txn-42' },
    });
    expect(res.statusCode).toBe(202);
    expect((await server.playground.orchestrator.wait(runId)).verdict).toBe('pass');

    const late = await server.inject({
      method: 'POST',
      url: `/api/runs/${runId}/verifier-callback`,
      payload: { kind: 'vp-received' },
    });
    expect(late.statusCode).toBe(409);
    const malformed = await server.inject({
      method: 'POST',
      url: `/api/runs/${runId}/verifier-callback`,
      payload: { kind: 'shrug' },
    });
    expect(malformed.statusCode).toBe(400);
  });
});

describe('OpenAPI', () => {
  it('documents the run, role, stack and callback routes', async () => {
    const server = await start();
    const res = await server.inject('/api/openapi.json');
    expect(res.statusCode).toBe(200);
    const doc = res.json<{ openapi: string; paths: Record<string, Record<string, unknown>> }>();
    expect(doc.openapi).toMatch(/^3\./);
    for (const path of ['/api/runs', '/api/roles', '/api/stack/status', '/api/runs/{id}/verifier-callback']) {
      expect(Object.keys(doc.paths)).toContain(path);
    }
    expect(Object.keys(doc.paths['/api/runs'] ?? {})).toEqual(expect.arrayContaining(['get', 'post']));
    expect(Object.keys(doc.paths)).not.toContain('/api/openapi.json');
    expect((await server.inject('/api/docs')).statusCode).toBeLessThan(400);
  });
});

describe('development-only fake roles', () => {
  it('are registered only when PLAYGROUND_FAKE_ROLES is on', async () => {
    app = await buildTestApp();
    expect((await app.inject('/api/roles')).json()).toEqual([]);
    await app.close();

    app = await buildTestApp({ env: { PLAYGROUND_FAKE_ROLES: '1' } });
    const roles = RoleListResponseSchema.parse((await app.inject('/api/roles')).json());
    expect(roles.map((entry) => entry.descriptor.id)).toEqual([
      'fake-issuer',
      'fake-wallet',
      'fake-person-wallet',
      'fake-verifier',
      'fake-callback-verifier',
    ]);
    expect(roles.every((entry) => entry.descriptor.name.startsWith('Test role (fake)'))).toBe(true);
    const runId = await createRun(app, FAKE_CELL);
    expect((await app.playground.orchestrator.wait(runId)).verdict).toBe('pass');
  });
});

async function until(condition: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
