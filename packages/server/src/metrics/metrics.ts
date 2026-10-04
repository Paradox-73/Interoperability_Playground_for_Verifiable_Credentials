/**
 * Light telemetry computed from stored reports: success rate and p50/p95 durations per protocol step,
 * per role pair (issuer -> wallet for issuance, wallet -> verifier for presentation) and per flow
 * (issuer, wallet, verifier, format), plus issued credential sizes. Everything is derived on request
 * from the runs table, so there is no second store to keep in step and a filter (dates, roles,
 * format, mode) narrows every figure at once.
 */
import {
  STEP_IDS,
  STEP_INFO,
  type CredentialFormat,
  type CredentialSizeMetric,
  type DurationStats,
  type FlowMetric,
  type Metrics,
  type PairMetric,
  type PairPhase,
  type StepId,
  type StepMetric,
} from '@inji-playground/protocol';
import type { StoredReport } from '../store/run-store.js';

/** Steps of each half of a run, in protocol order; the last one completes the phase. */
export const PHASE_STEPS: Readonly<Record<PairPhase, readonly StepId[]>> = {
  issuance: ['issuer.offer', 'issuer.metadata', 'as.metadata', 'token', 'nonce', 'credential'],
  presentation: ['verifier.request', 'wallet.fetch-request', 'wallet.submit', 'verifier.result'],
};

/**
 * Nearest-rank percentile (the smallest value with at least p% of the values at or below it). Exact
 * for the small samples the playground produces, and it always returns a value that was measured.
 */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

export function durationStats(values: readonly number[]): DurationStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    sumMs: round(sum),
    p50Ms: nullableRound(percentile(sorted, 50)),
    p95Ms: nullableRound(percentile(sorted, 95)),
    maxMs: nullableRound(sorted.at(-1) ?? null),
  };
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 10_000) / 10_000;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : round(value);
}

export function computeMetrics(reports: readonly StoredReport[], now: Date = new Date()): Metrics {
  const verdicts = { pass: 0, fail: 0, error: 0, notSupported: 0 };
  const steps = new Map<StepId, { ok: number; failed: number; durations: number[] }>();
  const pairs = new Map<
    string,
    { phase: PairPhase; from: string; to: string; attempts: number; succeeded: number; durations: number[] }
  >();
  const flows = new Map<string, Omit<FlowMetric, 'successRate' | 'duration'> & { durations: number[] }>();
  const sizes = new Map<string, CredentialSizeMetric>();

  for (const { report } of reports) {
    if (report.verdict === 'not-supported') verdicts.notSupported += 1;
    else verdicts[report.verdict] += 1;

    // Steps.
    for (const step of report.steps) {
      if (step.status !== 'ok' && step.status !== 'failed') continue;
      const entry = steps.get(step.step) ?? { ok: 0, failed: 0, durations: [] };
      entry[step.status === 'ok' ? 'ok' : 'failed'] += 1;
      entry.durations.push(step.durationMs);
      steps.set(step.step, entry);
    }

    // Role pairs.
    const ends: Record<PairPhase, [string, string]> = {
      issuance: [report.issuer.id, report.wallet.id],
      presentation: [report.wallet.id, report.verifier.id],
    };
    for (const phase of ['issuance', 'presentation'] as const) {
      const phaseSteps = PHASE_STEPS[phase];
      const ran = report.steps.filter(
        (step) => phaseSteps.includes(step.step) && (step.status === 'ok' || step.status === 'failed'),
      );
      if (ran.length === 0) continue;
      const [from, to] = ends[phase];
      const key = `${phase}|${from}|${to}`;
      const entry = pairs.get(key) ?? { phase, from, to, attempts: 0, succeeded: 0, durations: [] };
      entry.attempts += 1;
      const last = phaseSteps[phaseSteps.length - 1];
      const completed = ran.some((step) => step.step === last && step.status === 'ok');
      if (completed && ran.every((step) => step.status === 'ok')) entry.succeeded += 1;
      entry.durations.push(ran.reduce((total, step) => total + step.durationMs, 0));
      pairs.set(key, entry);
    }

    // Flows.
    const flowKey = [report.issuer.id, report.wallet.id, report.verifier.id, report.format].join('|');
    const flow = flows.get(flowKey) ?? {
      issuer: report.issuer.id,
      wallet: report.wallet.id,
      verifier: report.verifier.id,
      format: report.format,
      runs: 0,
      pass: 0,
      fail: 0,
      error: 0,
      notSupported: 0,
      durations: [],
    };
    flow.runs += 1;
    if (report.verdict === 'not-supported') flow.notSupported += 1;
    else {
      flow[report.verdict] += 1;
      flow.durations.push(report.steps.reduce((total, step) => total + step.durationMs, 0));
    }
    flows.set(flowKey, flow);

    // Credential sizes.
    if (report.credentialSize) {
      const size = report.credentialSize;
      const sizeKey = `${report.issuer.id}|${report.format}`;
      const entry = sizes.get(sizeKey);
      const latest = { ...size, runId: report.runId };
      if (!entry) {
        sizes.set(sizeKey, {
          issuer: report.issuer.id,
          format: report.format,
          samples: 1,
          maxBytes: size.bytes,
          maxPixelpassChars: size.pixelpassChars,
          fitsQrV40: size.fitsQrV40 ? 1 : 0,
          latest,
        });
      } else {
        entry.samples += 1;
        entry.maxBytes = Math.max(entry.maxBytes, size.bytes);
        entry.maxPixelpassChars = Math.max(entry.maxPixelpassChars, size.pixelpassChars);
        entry.fitsQrV40 += size.fitsQrV40 ? 1 : 0;
        // Reports arrive oldest first, so the last one seen is the newest.
        entry.latest = latest;
      }
    }
  }

  const stepMetrics: StepMetric[] = STEP_IDS.filter((id) => steps.has(id)).map((id) => {
    const entry = steps.get(id) as { ok: number; failed: number; durations: number[] };
    const executed = entry.ok + entry.failed;
    return {
      step: id,
      label: STEP_INFO[id].label,
      executed,
      ok: entry.ok,
      failed: entry.failed,
      successRate: ratio(entry.ok, executed),
      duration: durationStats(entry.durations),
    };
  });

  const pairMetrics: PairMetric[] = [...pairs.values()]
    .sort(
      (a, b) => a.phase.localeCompare(b.phase) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    )
    .map(({ durations, ...entry }) => ({
      ...entry,
      successRate: ratio(entry.succeeded, entry.attempts),
      duration: durationStats(durations),
    }));

  const flowMetrics: FlowMetric[] = [...flows.values()]
    .sort((a, b) => flowSortKey(a).localeCompare(flowSortKey(b)))
    .map(({ durations, ...entry }) => ({
      ...entry,
      successRate: ratio(entry.pass, entry.pass + entry.fail + entry.error),
      duration: durationStats(durations),
    }));

  const attempted = verdicts.pass + verdicts.fail + verdicts.error;
  const first = reports[0]?.summary.createdAt;
  const last = reports.at(-1)?.summary.createdAt;
  return {
    generatedAt: now.toISOString(),
    window: {
      runs: reports.length,
      ...(first ? { firstRunAt: first } : {}),
      ...(last ? { lastRunAt: last } : {}),
    },
    verdicts,
    successRate: ratio(verdicts.pass, attempted),
    steps: stepMetrics,
    pairs: pairMetrics,
    flows: flowMetrics,
    credentialSizes: [...sizes.values()].sort(
      (a, b) => a.issuer.localeCompare(b.issuer) || formatRank(a.format) - formatRank(b.format),
    ),
  };
}

function flowSortKey(flow: { issuer: string; wallet: string; verifier: string; format: string }): string {
  return [flow.issuer, flow.wallet, flow.verifier, flow.format].join('|');
}

const FORMAT_ORDER: readonly CredentialFormat[] = ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc'];
function formatRank(format: CredentialFormat): number {
  return FORMAT_ORDER.indexOf(format);
}
