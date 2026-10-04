/**
 * Metrics from stored runs: nearest-rank percentiles, success rate and p50/p95 per step, per role
 * pair and per flow, credential sizes, the JSON route and the Prometheus text format.
 */
import { MetricsSchema } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { computeMetrics, durationStats, percentile } from '../src/metrics/metrics.js';
import { PROMETHEUS_CONTENT_TYPE, renderPrometheus } from '../src/metrics/prometheus.js';
import { RunStore } from '../src/store/run-store.js';
import { buildTestApp } from './helpers.js';
import { okSteps, seedRun } from './run-fixtures.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Ten passing runs whose token step took 10, 20, ..., 100 ms, one failing run and one not supported. */
function seed(store: RunStore): void {
  for (let index = 1; index <= 10; index += 1) {
    seedRun(store, {
      id: `p${String(index).padStart(2, '0')}`,
      createdAt: `2026-10-0${index < 6 ? 1 : 2}T10:00:${String(index).padStart(2, '0')}.000Z`,
      report: {
        steps: okSteps({ token: index * 10 }),
        credentialSize: { bytes: 1000 + index, pixelpassChars: 900 + index, fitsQrV40: true },
      },
    });
  }
  seedRun(store, {
    id: 'f01',
    createdAt: '2026-10-03T10:00:00.000Z',
    config: { verifier: 'inji-verify', format: 'ldp_vc' },
    versions: { verifier: '0.18.2' },
    report: {
      outcome: 'ERROR',
      verdict: 'fail',
      error: { step: 'wallet.submit', code: 'http.400', message: 'rejected' },
      steps: [
        ...okSteps({ token: 500 }).slice(0, 6),
        { step: 'wallet.submit', status: 'failed', durationMs: 40 },
        { step: 'verifier.result', status: 'not-run', durationMs: 0 },
      ],
      credentialSize: { bytes: 9000, pixelpassChars: 5000, fitsQrV40: false },
    },
  });
  seedRun(store, {
    id: 'n01',
    createdAt: '2026-10-03T11:00:00.000Z',
    config: { format: 'mso_mdoc' },
    report: { outcome: 'NOT_RUN', verdict: 'not-supported', steps: [] },
  });
}

describe('percentiles', () => {
  it('use the nearest-rank method and return measured values', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
    expect(durationStats([30, 10, 20])).toEqual({ count: 3, sumMs: 60, p50Ms: 20, p95Ms: 30, maxMs: 30 });
    expect(durationStats([])).toEqual({ count: 0, sumMs: 0, p50Ms: null, p95Ms: null, maxMs: null });
  });
});

describe('computeMetrics', () => {
  const store = RunStore.open(':memory:');
  seed(store);
  const metrics = MetricsSchema.parse(
    computeMetrics(store.listFinishedReports(), new Date('2026-10-04T00:00:00Z')),
  );

  it('counts verdicts and gives the overall success rate without not-supported runs', () => {
    expect(metrics.window).toEqual({
      runs: 12,
      firstRunAt: '2026-10-01T10:00:01.000Z',
      lastRunAt: '2026-10-03T11:00:00.000Z',
    });
    expect(metrics.verdicts).toEqual({ pass: 10, fail: 1, error: 0, notSupported: 1 });
    expect(metrics.successRate).toBeCloseTo(10 / 11, 4);
  });

  it('gives success rate and p50/p95 per step', () => {
    const token = metrics.steps.find((step) => step.step === 'token');
    expect(token).toMatchObject({ executed: 11, ok: 11, failed: 0, successRate: 1 });
    expect(token?.duration).toMatchObject({ count: 11, p50Ms: 60, p95Ms: 500, maxMs: 500 });
    const submit = metrics.steps.find((step) => step.step === 'wallet.submit');
    expect(submit).toMatchObject({ executed: 11, ok: 10, failed: 1 });
    expect(submit?.successRate).toBeCloseTo(10 / 11, 4);
    // Not-run steps are not counted as executed.
    expect(metrics.steps.find((step) => step.step === 'verifier.result')?.executed).toBe(10);
    // Steps are listed in protocol order.
    expect(metrics.steps.map((step) => step.step).slice(0, 3)).toEqual([
      'issuer.offer',
      'issuer.metadata',
      'token',
    ]);
  });

  it('gives success rate and durations per role pair', () => {
    const issuance = metrics.pairs.find((pair) => pair.phase === 'issuance' && pair.to === 'ref-wallet');
    expect(issuance).toMatchObject({ from: 'ref-issuer', attempts: 11, succeeded: 11, successRate: 1 });
    const toInji = metrics.pairs.find((pair) => pair.phase === 'presentation' && pair.to === 'inji-verify');
    expect(toInji).toMatchObject({ from: 'ref-wallet', attempts: 1, succeeded: 0, successRate: 0 });
    expect(toInji?.duration.p50Ms).toBe(60);
    const toRef = metrics.pairs.find((pair) => pair.phase === 'presentation' && pair.to === 'ref-verifier');
    expect(toRef).toMatchObject({ attempts: 10, succeeded: 10 });
    expect(toRef?.duration.p95Ms).toBe(40);
  });

  it('gives per-flow figures and credential sizes with the QR flag', () => {
    const flow = metrics.flows.find(
      (entry) => entry.verifier === 'ref-verifier' && entry.format === 'vc+sd-jwt',
    );
    expect(flow).toMatchObject({ runs: 10, pass: 10, successRate: 1 });
    const mdoc = metrics.flows.find((entry) => entry.format === 'mso_mdoc');
    expect(mdoc).toMatchObject({ runs: 1, notSupported: 1, successRate: null });
    expect(mdoc?.duration.count).toBe(0);
    const sdJwt = metrics.credentialSizes.find((size) => size.format === 'vc+sd-jwt');
    expect(sdJwt).toMatchObject({
      samples: 10,
      maxBytes: 1010,
      maxPixelpassChars: 910,
      fitsQrV40: 10,
      latest: { runId: 'p10' },
    });
    const ldp = metrics.credentialSizes.find((size) => size.format === 'ldp_vc');
    expect(ldp).toMatchObject({
      samples: 1,
      fitsQrV40: 0,
      latest: { pixelpassChars: 5000, fitsQrV40: false },
    });
  });

  it('renders the Prometheus text format with summaries in seconds', () => {
    const text = renderPrometheus(metrics);
    expect(text).toContain('# TYPE playground_runs gauge');
    expect(text).toContain('playground_runs{verdict="pass"} 10');
    expect(text).toContain('# TYPE playground_step_duration_seconds summary');
    expect(text).toContain('playground_step_duration_seconds{step="token",quantile="0.5"} 0.06');
    expect(text).toContain('playground_step_duration_seconds{step="token",quantile="0.95"} 0.5');
    expect(text).toContain('playground_step_duration_seconds_count{step="token"} 11');
    expect(text).toContain(
      'playground_pair_success_ratio{phase="presentation",from="ref-wallet",to="inji-verify"} 0',
    );
    expect(text).toContain('playground_credential_fits_qr_v40{issuer="ref-issuer",format="ldp_vc"} 0');
    // Unknown values are left out instead of being written as NaN.
    expect(text).not.toContain('NaN');
    expect(text).not.toMatch(/playground_flow_success_ratio\{[^}]*format="mso_mdoc"\}/);
    expect(text.endsWith('\n')).toBe(true);
    // Every sample line is `name{labels} value`.
    for (const line of text.split('\n').filter((entry) => entry && !entry.startsWith('#'))) {
      expect(line).toMatch(/^[a-z0-9_]+(\{[^}]*\})? -?[0-9.e+-]+$/);
    }
  });
});

describe('metrics routes', () => {
  it('serve /api/metrics with filters and /metrics in the Prometheus format', async () => {
    app = await buildTestApp();
    seed(app.playground.store);

    const all = MetricsSchema.parse((await app.inject('/api/metrics')).json());
    expect(all.window.runs).toBe(12);

    const late = MetricsSchema.parse((await app.inject('/api/metrics?from=2026-10-02T00:00:00Z')).json());
    expect(late.window.runs).toBe(7);
    const inji = MetricsSchema.parse((await app.inject('/api/metrics?verifier=inji-verify')).json());
    expect(inji.verdicts).toEqual({ pass: 0, fail: 1, error: 0, notSupported: 0 });
    const byVersion = MetricsSchema.parse((await app.inject('/api/metrics?version=0.18.2')).json());
    expect(byVersion.window.runs).toBe(1);

    const prom = await app.inject('/metrics');
    expect(prom.statusCode).toBe(200);
    expect(prom.headers['content-type']).toBe(PROMETHEUS_CONTENT_TYPE);
    expect(prom.body).toContain('playground_success_ratio 0.9091');

    expect((await app.inject('/api/metrics?from=yesterday')).statusCode).toBe(400);
  });
});
