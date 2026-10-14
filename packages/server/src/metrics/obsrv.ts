/**
 * Run telemetry as flat events for Sunbird Obsrv, the ingestion pipeline in front of Apache Druid
 * (docs/telemetry-obsrv.md). A finished run becomes one `RUN` event and one `STEP` event per protocol
 * step that ran, each carrying the flow (issuer, wallet, verifier, format) so Druid can group success
 * rate and latency by flow without a join. `deploy/obsrv/druid-ingestion-spec.json` lists the same fields.
 */
import {
  CredentialFormatSchema,
  OutcomeSchema,
  RunIdSchema,
  RunModeSchema,
  StepIdSchema,
  VerdictSchema,
  type InteropReport,
} from '@inji-playground/protocol';
import { z } from 'zod';

export const ObsrvEventSchema = z.object({
  ets: z
    .number()
    .int()
    .describe('Epoch milliseconds when the run finished (RUN) or the step started (STEP); the timestamp key'),
  mid: z.string().min(1).describe('Unique event id; the dataset dedup key'),
  eid: z.enum(['RUN', 'STEP']),
  runId: RunIdSchema,
  mode: RunModeSchema,
  issuer: z.string().min(1),
  wallet: z.string().min(1),
  verifier: z.string().min(1),
  format: CredentialFormatSchema,
  scenario: z.string().min(1),
  expected: OutcomeSchema,
  outcome: OutcomeSchema,
  verdict: VerdictSchema,
  errorCode: z
    .string()
    .nullable()
    .describe('Error code of the run; on a STEP event only for the failing step'),
  step: StepIdSchema.nullable().describe('Null on a RUN event'),
  stepStatus: z.enum(['ok', 'failed']).nullable().describe('Null on a RUN event'),
  durationMs: z.number().nonnegative().describe('Step time, or the sum of the step times on a RUN event'),
  success: z
    .union([z.literal(0), z.literal(1)])
    .describe('1 for a step that finished ok or a run that passed'),
});
export type ObsrvEvent = z.infer<typeof ObsrvEventSchema>;

/** Numeric fields Druid aggregates (metricsSpec); every other field except `ets` and `mid` is a dimension. */
export const OBSRV_METRIC_FIELDS = ['durationMs', 'success'] as const;

/** Druid dimensions, in event order. `mid` is left out: it is unique per event, so it would defeat rollup. */
export const OBSRV_DIMENSIONS = Object.keys(ObsrvEventSchema.shape).filter(
  (field) => !['ets', 'mid', ...OBSRV_METRIC_FIELDS].includes(field),
);

/** The events of one finished run. Skipped and not-run steps produce no event, as in `computeMetrics`. */
export function obsrvEvents(report: InteropReport): ObsrvEvent[] {
  const runAt = Date.parse(report.createdAt);
  const flow = {
    runId: report.runId,
    mode: report.mode,
    issuer: report.issuer.id,
    wallet: report.wallet.id,
    verifier: report.verifier.id,
    format: report.format,
    scenario: report.scenario.id,
    expected: report.scenario.expected,
    outcome: report.outcome,
    verdict: report.verdict,
  };
  // The position keeps `mid` unique when a step id comes twice in one run (two person actions).
  const ran = report.steps.flatMap((step, position) =>
    step.status === 'ok' || step.status === 'failed' ? [{ ...step, status: step.status, position }] : [],
  );
  return [
    {
      ets: runAt,
      mid: `${report.runId}:run`,
      eid: 'RUN',
      ...flow,
      errorCode: report.error?.code ?? null,
      step: null,
      stepStatus: null,
      durationMs: ran.reduce((total, step) => total + step.durationMs, 0),
      success: report.verdict === 'pass' ? 1 : 0,
    },
    ...ran.map((step): ObsrvEvent => ({
      ets: step.startedAt ? Date.parse(step.startedAt) : runAt,
      mid: `${report.runId}:${step.position}:${step.step}`,
      eid: 'STEP',
      ...flow,
      errorCode: report.error?.step === step.step ? report.error.code : null,
      step: step.step,
      stepStatus: step.status,
      durationMs: step.durationMs,
      success: step.status === 'ok' ? 1 : 0,
    })),
  ];
}

/**
 * Body of Obsrv's Data In API (`POST /v2/data/in/{dataset_id}`). With `data` as an array, Obsrv wraps
 * the events as one batch whose dedup key is `msgid`, so the run id as `msgid` makes a repeated push of
 * the same run a duplicate that a dataset with dedup on drops.
 */
export function obsrvDataInBody(runId: string, events: readonly ObsrvEvent[], now: Date = new Date()) {
  return { id: 'api.data.in', ver: 'v2', ts: now.toISOString(), params: { msgid: runId }, data: events };
}

/** Posts the events of one finished run to an Obsrv dataset's Data In URL. Throws on a non-2xx answer. */
export async function pushToObsrv(url: string, report: InteropReport): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obsrvDataInBody(report.runId, obsrvEvents(report))),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Obsrv answered HTTP ${response.status}`);
}
