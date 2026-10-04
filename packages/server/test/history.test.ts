/**
 * Run history (`GET /api/runs`): filters by role, module version, format, scenario, outcome, verdict
 * and dates, combined; paging and sort order.
 */
import { RunListResponseSchema } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';
import { seedRun } from './run-fixtures.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
  const { store } = app.playground;
  seedRun(store, { id: 'h1', createdAt: '2026-10-01T09:00:00.000Z' });
  seedRun(store, {
    id: 'h2',
    createdAt: '2026-10-02T09:00:00.000Z',
    config: { issuer: 'inji-certify', verifier: 'inji-verify', format: 'ldp_vc' },
    versions: { issuer: '0.14.0', verifier: '0.18.2' },
    report: { outcome: 'INVALID', verdict: 'fail' },
  });
  seedRun(store, {
    id: 'h3',
    createdAt: '2026-10-03T09:00:00.000Z',
    config: { verifier: 'inji-verify', scenario: 'tamper.expired' },
    versions: { verifier: '0.18.2' },
    report: { outcome: 'EXPIRED', verdict: 'pass', scenario: { id: 'tamper.expired', expected: 'EXPIRED' } },
  });
  seedRun(store, { id: 'h4', createdAt: '2026-10-04T09:00:00.000Z', config: { format: 'ldp_vc' } });
});
afterAll(async () => {
  await app.close();
});

async function ids(query: string): Promise<string[]> {
  const res = await app.inject(`/api/runs${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return RunListResponseSchema.parse(res.json()).items.map((item) => item.runId);
}

describe('history filters', () => {
  it('filter by module version of any role', async () => {
    expect(await ids('?version=0.18.2')).toEqual(['h3', 'h2']);
    expect(await ids('?version=0.14.0')).toEqual(['h2']);
  });

  it('filter by format, outcome, verdict, scenario and role', async () => {
    expect(await ids('?format=ldp_vc')).toEqual(['h4', 'h2']);
    expect(await ids('?outcome=EXPIRED')).toEqual(['h3']);
    expect(await ids('?verdict=fail')).toEqual(['h2']);
    expect(await ids('?scenario=tamper.expired')).toEqual(['h3']);
    expect(await ids('?issuer=inji-certify')).toEqual(['h2']);
    expect(await ids('?verifier=inji-verify&format=vc%2Bsd-jwt')).toEqual(['h3']);
  });

  it('filter by date range (from inclusive, to exclusive, any offset)', async () => {
    expect(await ids('?from=2026-10-02T09:00:00Z&to=2026-10-04T09:00:00Z')).toEqual(['h3', 'h2']);
    expect(await ids('?from=2026-10-03T14:30:01%2B05:30')).toEqual(['h4']);
    expect(await ids('?to=2026-10-01T09:00:00.001Z')).toEqual(['h1']);
  });

  it('page and sort, reporting the total of the filtered set', async () => {
    const page = RunListResponseSchema.parse((await app.inject('/api/runs?limit=2&offset=1')).json());
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 1 });
    expect(page.items.map((item) => item.runId)).toEqual(['h3', 'h2']);
    expect(await ids('?order=oldest&limit=2')).toEqual(['h1', 'h2']);
    expect((await app.inject('/api/runs?order=random')).statusCode).toBe(400);
    expect((await app.inject('/api/runs?format=jpeg')).statusCode).toBe(400);
  });
});
