// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The SQLite store: migrations, run rows, the event log with its exchange and artefact side tables,
 * history filters, and recovery of runs left unfinished by a stopped server.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InteropReport, RecordedExchange, RunConfig } from '@inji-playground/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/store/migrations.js';
import { RunStore, type NewRun } from '../src/store/run-store.js';

const dir = mkdtempSync(join(tmpdir(), 'ps02-store-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config: RunConfig = {
  issuer: 'ref-issuer',
  wallet: 'ref-wallet',
  verifier: 'inji-verify',
  format: 'ldp_vc',
  vciProfile: 'draft13',
  vpProfile: 'inji-draft',
  scenario: 'happy',
};

function newRun(id: string, overrides: Partial<NewRun> = {}): NewRun {
  return {
    id,
    mode: 'live',
    config,
    versions: { issuer: '0.1.0', wallet: '0.1.0', verifier: '0.18.2' },
    createdAt: '2026-10-04T10:00:00.000Z',
    ...overrides,
  };
}

function report(runId: string, overrides: Partial<InteropReport> = {}): InteropReport {
  return {
    runId,
    createdAt: '2026-10-04T10:00:05.000Z',
    mode: 'live',
    issuer: { id: 'ref-issuer', name: 'Reference issuer', version: '0.1.0', ecosystem: 'reference' },
    wallet: { id: 'ref-wallet', name: 'Reference wallet', version: '0.1.0', ecosystem: 'reference' },
    verifier: { id: 'inji-verify', name: 'Inji Verify', version: '0.18.2', ecosystem: 'inji' },
    format: 'ldp_vc',
    credentialProof: 'Ed25519Signature2020',
    vciProfile: 'draft13',
    vpProfile: 'inji-draft',
    scenario: { id: 'happy', expected: 'VALID' },
    outcome: 'VALID',
    verdict: 'pass',
    steps: [],
    ...overrides,
  };
}

const exchange = (runId: string, seq: number): RecordedExchange => ({
  id: `${runId}-x${seq}`,
  runId,
  seq,
  capture: 'outbound',
  step: 'token',
  from: 'ref-wallet',
  to: 'certify',
  request: {
    method: 'POST',
    url: 'http://certify/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'a=b',
  },
  response: { status: 200, headers: {}, body: '{}' },
  startedAt: '2026-10-04T10:00:01.000Z',
  durationMs: 12.5,
});

describe('migrations', () => {
  it('apply once to a new file database and not again when it is reopened', () => {
    const path = join(dir, 'migrate.db');
    const first = RunStore.open(path);
    expect(first.schemaVersion()).toBe(MIGRATIONS.at(-1)?.version);
    first.close();
    const second = RunStore.open(path);
    expect(second.migrate()).toEqual([]);
    second.close();
  });

  it('roll back a migration that fails, leaving the version unchanged', () => {
    const store = RunStore.open(':memory:');
    expect(() =>
      store.migrate([...MIGRATIONS, { version: 99, name: 'broken', sql: 'CREATE TABLE x (a); SELEKT 1;' }]),
    ).toThrow();
    expect(store.schemaVersion()).toBe(1);
    store.close();
  });
});

describe('runs and events', () => {
  it('stores a run through its life: queued, running, events, finished with report', () => {
    const store = RunStore.open(':memory:');
    store.createRun(newRun('r1'));
    expect(store.getRun('r1')).toMatchObject({ runId: 'r1', status: 'queued', mode: 'live', config });

    store.markStarted('r1', '2026-10-04T10:00:00.100Z');
    expect(
      store.appendEvent(
        { type: 'run.started', runId: 'r1', config, at: '2026-10-04T10:00:00.100Z' },
        '2026-10-04T10:00:00.100Z',
      ),
    ).toBe(1);
    expect(
      store.appendEvent(
        { type: 'exchange', runId: 'r1', exchange: exchange('r1', 1) },
        '2026-10-04T10:00:01.000Z',
      ),
    ).toBe(2);
    expect(
      store.appendEvent(
        { type: 'artifact', runId: 'r1', kind: 'credential', format: 'ldp_vc', raw: '{"vc":1}' },
        '2026-10-04T10:00:02.000Z',
      ),
    ).toBe(3);
    const finished = report('r1');
    store.finishRun(finished, finished.createdAt);
    store.appendEvent({ type: 'run.finished', runId: 'r1', report: finished }, finished.createdAt);

    expect(store.getRun('r1')).toMatchObject({
      status: 'finished',
      startedAt: '2026-10-04T10:00:00.100Z',
      finishedAt: finished.createdAt,
      verdict: 'pass',
      outcome: 'VALID',
      report: finished,
      versions: { issuer: '0.1.0', wallet: '0.1.0', verifier: '0.18.2' },
    });
    expect(store.listEvents('r1').map((event) => event.type)).toEqual([
      'run.started',
      'exchange',
      'artifact',
      'run.finished',
    ]);
    expect(store.listEvents('r1', 2).map((event) => event.type)).toEqual(['artifact', 'run.finished']);
    expect(store.listExchanges('r1')).toEqual([exchange('r1', 1)]);
    expect(store.listArtifacts('r1')).toEqual([
      {
        seq: 3,
        kind: 'credential',
        format: 'ldp_vc',
        raw: '{"vc":1}',
        createdAt: '2026-10-04T10:00:02.000Z',
      },
    ]);
    expect(store.getRun('missing')).toBeUndefined();
    store.close();
  });

  it('keeps the error of a failed run in the summary', () => {
    const store = RunStore.open(':memory:');
    store.createRun(newRun('r2'));
    store.finishRun(
      report('r2', {
        outcome: 'ERROR',
        verdict: 'fail',
        error: { step: 'credential', code: 'http.400', message: 'invalid_proof', exchangeId: 'r2-x3' },
      }),
      '2026-10-04T10:00:09.000Z',
    );
    expect(store.getRun('r2')?.error).toEqual({
      step: 'credential',
      code: 'http.400',
      message: 'invalid_proof',
      exchangeId: 'r2-x3',
    });
    store.close();
  });

  it('refuses an event for a run that does not exist', () => {
    const store = RunStore.open(':memory:');
    expect(() =>
      store.appendEvent(
        { type: 'run.started', runId: 'ghost', config, at: '2026-10-04T10:00:00.000Z' },
        '2026-10-04T10:00:00.000Z',
      ),
    ).toThrow(/FOREIGN KEY/);
    store.close();
  });

  it('closes runs a previous process left unfinished', () => {
    const path = join(dir, 'restart.db');
    const before = RunStore.open(path);
    before.createRun(newRun('stuck'));
    before.markStarted('stuck', '2026-10-04T10:00:00.000Z');
    before.close();

    const after = RunStore.open(path);
    expect(after.interruptUnfinished('2026-10-04T11:00:00.000Z')).toBe(1);
    expect(after.getRun('stuck')).toMatchObject({
      status: 'finished',
      verdict: 'error',
      outcome: 'NOT_RUN',
      error: { code: 'server.restarted', step: 'playground.admin' },
    });
    expect(after.interruptUnfinished('2026-10-04T11:00:00.000Z')).toBe(0);
    after.close();
  });
});

describe('listRuns', () => {
  const store = RunStore.open(':memory:');
  const rows: Array<[string, string, Partial<RunConfig>, Partial<InteropReport>, string]> = [
    ['a', '2026-10-01T09:00:00.000Z', {}, {}, '0.18.2'],
    [
      'b',
      '2026-10-02T09:00:00.000Z',
      { format: 'vc+sd-jwt' },
      { format: 'vc+sd-jwt', outcome: 'INVALID', verdict: 'fail' },
      '0.18.2',
    ],
    [
      'c',
      '2026-10-03T09:00:00.000Z',
      { format: 'vc+sd-jwt', scenario: 'tamper.expired' },
      {
        format: 'vc+sd-jwt',
        outcome: 'EXPIRED',
        verdict: 'pass',
        scenario: { id: 'tamper.expired', expected: 'EXPIRED' },
      },
      '1.0.0',
    ],
  ];
  for (const [id, createdAt, configOverrides, reportOverrides, verifierVersion] of rows) {
    store.createRun(
      newRun(id, {
        createdAt,
        config: { ...config, ...configOverrides },
        versions: { issuer: '0.1.0', wallet: '0.1.0', verifier: verifierVersion },
      }),
    );
    store.finishRun(report(id, reportOverrides), createdAt);
  }
  const ids = (query: Parameters<RunStore['listRuns']>[0]) =>
    store.listRuns(query).items.map((item) => item.runId);
  const page = { limit: 50, offset: 0 };

  it('lists newest first with the total', () => {
    expect(store.listRuns(page)).toMatchObject({ total: 3, limit: 50, offset: 0 });
    expect(ids(page)).toEqual(['c', 'b', 'a']);
  });

  it('filters by format, verdict, outcome, scenario, role, version and dates', () => {
    expect(ids({ ...page, format: 'vc+sd-jwt' })).toEqual(['c', 'b']);
    expect(ids({ ...page, verdict: 'pass' })).toEqual(['c', 'a']);
    expect(ids({ ...page, format: 'vc+sd-jwt', verdict: 'pass' })).toEqual(['c']);
    expect(ids({ ...page, outcome: 'INVALID' })).toEqual(['b']);
    expect(ids({ ...page, scenario: 'tamper.expired' })).toEqual(['c']);
    expect(ids({ ...page, verifier: 'inji-verify', issuer: 'ref-issuer' })).toEqual(['c', 'b', 'a']);
    expect(ids({ ...page, version: '1.0.0' })).toEqual(['c']);
    expect(ids({ ...page, from: '2026-10-02T00:00:00.000Z', to: '2026-10-03T00:00:00.000Z' })).toEqual(['b']);
    // Offsets other than Z are normalised before comparing.
    expect(ids({ ...page, from: '2026-10-02T14:30:00+05:30' })).toEqual(['c', 'b']);
  });

  it('pages', () => {
    expect(ids({ limit: 2, offset: 0 })).toEqual(['c', 'b']);
    expect(ids({ limit: 2, offset: 2 })).toEqual(['a']);
  });
});
