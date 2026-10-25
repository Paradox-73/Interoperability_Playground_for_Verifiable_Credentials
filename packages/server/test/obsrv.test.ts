// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Obsrv telemetry: a finished run as flat events, the Druid ingestion spec naming exactly those fields,
 * the route that lists them, and the push to an Obsrv dataset, which stays off unless configured.
 */
import { readFileSync } from 'node:fs';
import type { InteropReport } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OBSRV_DIMENSIONS,
  OBSRV_METRIC_FIELDS,
  ObsrvEventSchema,
  obsrvDataInBody,
  obsrvEvents,
} from '../src/metrics/obsrv.js';
import { RunStore } from '../src/store/run-store.js';
import { buildTestApp, listenInTestRange, testConfig } from './helpers.js';
import { okSteps, seedRun } from './run-fixtures.js';

const specUrl = new URL('../../../deploy/obsrv/druid-ingestion-spec.json', import.meta.url);

/** An Inji Verify run that failed at wallet.submit; the last step never ran. */
function failedRun(store: RunStore = RunStore.open(':memory:')): InteropReport {
  return seedRun(store, {
    id: 'f01',
    createdAt: '2026-10-03T10:00:00.000Z',
    config: { verifier: 'inji-verify', format: 'ldp_vc' },
    report: {
      outcome: 'ERROR',
      verdict: 'fail',
      error: { step: 'wallet.submit', code: 'http.400', message: 'rejected' },
      steps: [
        ...okSteps({ token: 120 }).slice(0, 6),
        { step: 'wallet.submit', status: 'failed', durationMs: 40, startedAt: '2026-10-03T10:00:01.500Z' },
        { step: 'verifier.result', status: 'not-run', durationMs: 0 },
      ],
    },
  }) as InteropReport;
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

describe('obsrvEvents', () => {
  const events = obsrvEvents(failedRun());

  it('gives one RUN event with the flow, the verdict and the summed step time', () => {
    expect(events[0]).toEqual({
      ets: Date.parse('2026-10-03T10:00:00.000Z'),
      mid: 'f01:run',
      eid: 'RUN',
      runId: 'f01',
      mode: 'live',
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'inji-verify',
      format: 'ldp_vc',
      scenario: 'happy',
      expected: 'VALID',
      outcome: 'ERROR',
      verdict: 'fail',
      errorCode: 'http.400',
      step: null,
      stepStatus: null,
      durationMs: 5 * 10 + 120 + 40,
      success: 0,
    });
  });

  it('gives one STEP event per step that ran, with the error code only on the failing step', () => {
    const steps = events.filter((event) => event.eid === 'STEP');
    expect(steps.map((event) => event.step)).toEqual([
      'issuer.offer',
      'issuer.metadata',
      'token',
      'credential',
      'verifier.request',
      'wallet.fetch-request',
      'wallet.submit',
    ]);
    expect(steps.find((event) => event.step === 'token')).toMatchObject({
      durationMs: 120,
      stepStatus: 'ok',
      success: 1,
      errorCode: null,
      verifier: 'inji-verify',
    });
    expect(steps.find((event) => event.step === 'wallet.submit')).toMatchObject({
      ets: Date.parse('2026-10-03T10:00:01.500Z'),
      mid: 'f01:6:wallet.submit',
      stepStatus: 'failed',
      success: 0,
      errorCode: 'http.400',
    });
    expect(new Set(events.map((event) => event.mid)).size).toBe(events.length);
    for (const event of events) ObsrvEventSchema.parse(event);
  });

  it('counts a passing run as a success', () => {
    const store = RunStore.open(':memory:');
    const report = seedRun(store, { id: 'p01', createdAt: '2026-10-01T10:00:00.000Z' }) as InteropReport;
    expect(obsrvEvents(report)[0]).toMatchObject({
      eid: 'RUN',
      verdict: 'pass',
      success: 1,
      errorCode: null,
    });
  });

  it('keeps event ids unique when a step comes twice in one run', () => {
    const store = RunStore.open(':memory:');
    const action = { step: 'person.action', status: 'ok', durationMs: 5 } as const;
    const report = seedRun(store, {
      id: 'm01',
      createdAt: '2026-10-01T10:00:00.000Z',
      report: { steps: [action, ...okSteps(), action] },
    }) as InteropReport;
    const ids = obsrvEvents(report).map((event) => event.mid);
    expect(ids.filter((id) => id.endsWith(':person.action'))).toEqual([
      'm01:0:person.action',
      'm01:9:person.action',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wraps the events in the Data In body with the run id as msgid', () => {
    const body = obsrvDataInBody('f01', events, new Date('2026-10-04T00:00:00.000Z'));
    expect(body).toEqual({
      id: 'api.data.in',
      ver: 'v2',
      ts: '2026-10-04T00:00:00.000Z',
      params: { msgid: 'f01' },
      data: events,
    });
  });
});

describe('Druid ingestion spec', () => {
  const spec = JSON.parse(readFileSync(specUrl, 'utf8')) as {
    spec: {
      dataSchema: {
        timestampSpec: { column: string; format: string };
        dimensionsSpec: { dimensions: string[] };
        metricsSpec: { type: string; fieldName?: string }[];
      };
    };
  };
  const { dataSchema } = spec.spec;

  it('names exactly the fields the mapper emits', () => {
    expect(dataSchema.timestampSpec).toEqual({ column: 'ets', format: 'millis' });
    expect(dataSchema.dimensionsSpec.dimensions).toEqual(OBSRV_DIMENSIONS);
    const metricInputs = new Set(dataSchema.metricsSpec.flatMap((metric) => metric.fieldName ?? []));
    expect([...metricInputs].sort()).toEqual([...OBSRV_METRIC_FIELDS].sort());
    const emitted = Object.keys(obsrvEvents(failedRun())[0] ?? {}).sort();
    expect(emitted).toEqual(['ets', 'mid', ...OBSRV_DIMENSIONS, ...OBSRV_METRIC_FIELDS].sort());
  });
});

describe('GET /api/telemetry/obsrv', () => {
  it('lists the events of the finished run asked for', async () => {
    app = await buildTestApp();
    const report = failedRun(app.playground.store);
    seedRun(app.playground.store, { id: 'p01', createdAt: '2026-10-01T10:00:00.000Z' });
    const res = await app.inject('/api/telemetry/obsrv?runId=f01');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ events: obsrvEvents(report) });
    const all = (await app.inject('/api/telemetry/obsrv')).json<{ events: { runId: string }[] }>();
    expect(new Set(all.events.map((event) => event.runId))).toEqual(new Set(['f01', 'p01']));
  });
});

describe('push to Obsrv', () => {
  it('is off by default: a finished run sends nothing', async () => {
    expect(testConfig().obsrvUrl).toBeUndefined();
    app = await buildTestApp();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const report = failedRun(app.playground.store);
    app.playground.bus.publish({ type: 'run.finished', runId: report.runId, report });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the events of a finished run to PLAYGROUND_OBSRV_URL', async () => {
    let received: (value: { url: string; body: unknown }) => void = () => undefined;
    const request = new Promise<{ url: string; body: unknown }>((resolve) => (received = resolve));
    const { server, url } = await listenInTestRange((req, res) => {
      let text = '';
      req.on('data', (chunk: Buffer) => (text += chunk.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        received({ url: req.url ?? '', body: JSON.parse(text) });
      });
    });
    try {
      app = await buildTestApp({
        env: { PLAYGROUND_OBSRV_URL: `${url}/v2/data/in/inji-playground-runs` },
      });
      const report = failedRun(app.playground.store);
      app.playground.bus.publish({ type: 'run.finished', runId: report.runId, report });
      const { url: path, body } = await request;
      expect(path).toBe('/v2/data/in/inji-playground-runs');
      expect(body).toMatchObject({ id: 'api.data.in', params: { msgid: 'f01' }, data: obsrvEvents(report) });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
