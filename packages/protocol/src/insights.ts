/**
 * Shapes of what the server derives from stored runs: the run report document (JSON and Markdown),
 * the redacted run export, the compatibility matrix, run metrics and the interoperability gap
 * register. The server answers with these; the UI and the CLI parse the answers with them.
 */
import { z } from 'zod';
import { IsoDateTimeSchema, RoleIdSchema, RunIdSchema, ScenarioIdSchema } from './common.js';
import {
  ArtifactKindSchema,
  CredentialFormatSchema,
  OutcomeSchema,
  RoleKindSchema,
  RunModeSchema,
  StepIdSchema,
  VciProfileSchema,
  VerdictSchema,
  VpProfileSchema,
} from './enums.js';
import { RunEventSchema } from './events.js';
import { RecordedExchangeSchema } from './exchange.js';
import { CompatibilityReasonSchema, RunDetailSchema, RunListQuerySchema, RunStatusSchema } from './api.js';
import { CredentialSizeSchema, InteropReportSchema, ReportErrorSchema } from './report.js';
import { RoleRefSchema } from './roles.js';

// -----------------------------------------------------------------------------------------------------
// Run report document

/** One step of the report, with the words the timeline uses for it. */
export const ReportStepSchema = z.object({
  step: StepIdSchema,
  label: z.string(),
  protocolTerm: z.string(),
  status: z.enum(['ok', 'failed', 'skipped', 'not-run']),
  durationMs: z.number().nonnegative(),
  startedAt: IsoDateTimeSchema.optional(),
  /** Specification section that defines the step, when there is one. */
  spec: z.object({ name: z.string(), url: z.string(), section: z.string() }).optional(),
});
export type ReportStep = z.infer<typeof ReportStepSchema>;

/** The recorded exchange a failure points at, summarised (URL already redacted). */
export const ReportExchangeRefSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().positive(),
  method: z.string(),
  url: z.string(),
  status: z.number().int().optional(),
  error: z.string().optional(),
  /** API path that returns the exchange with full payloads. */
  apiLink: z.string(),
  /** Playground page that opens the exchange in the protocol inspector. */
  uiLink: z.string(),
});
export type ReportExchangeRef = z.infer<typeof ReportExchangeRefSchema>;

/**
 * `GET /api/runs/{id}/report.json`: the stored `InteropReport` plus what a reader of a report needs
 * next to it: the versions of every component, step labels and timings, and the failing exchange.
 */
export const RunReportDocumentSchema = z.object({
  /** Increases when a field is removed or changes meaning. */
  schemaVersion: z.literal(1),
  generatedAt: IsoDateTimeSchema,
  report: InteropReportSchema,
  run: z.object({
    status: RunStatusSchema,
    startedAt: IsoDateTimeSchema.optional(),
    finishedAt: IsoDateTimeSchema.optional(),
    /** Sum of the step durations, in milliseconds. */
    totalStepMs: z.number().nonnegative(),
  }),
  versions: z.object({
    issuer: z.string(),
    wallet: z.string(),
    verifier: z.string(),
    playground: z.string(),
  }),
  steps: z.array(ReportStepSchema),
  error: ReportErrorSchema.extend({
    stepLabel: z.string(),
    exchange: ReportExchangeRefSchema.optional(),
  }).optional(),
  credentialSize: CredentialSizeSchema.optional(),
  links: z.object({
    run: z.string(),
    exchanges: z.string(),
    markdown: z.string(),
    export: z.string(),
    ui: z.string(),
  }),
});
export type RunReportDocument = z.infer<typeof RunReportDocumentSchema>;

/** A stored artefact (offer, credential, request object, presentation, result). */
export const ExportedArtifactSchema = z.object({
  seq: z.number().int().positive(),
  kind: ArtifactKindSchema,
  format: CredentialFormatSchema.optional(),
  raw: z.string(),
  createdAt: IsoDateTimeSchema,
});

/**
 * `GET /api/runs/{id}/export`: everything stored about a run, safe to attach to an issue. Access and
 * refresh tokens, authorization and pre-authorized codes, transaction codes, client secrets, cookies
 * and private key members are replaced by `[redacted sha256:<8 hex>]`; the digest prefix lets a
 * reader see that two exchanges carried the same value without seeing the value.
 */
export const RunExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: IsoDateTimeSchema,
  redacted: z.literal(true),
  /** How many values were replaced. */
  redactions: z.number().int().nonnegative(),
  run: RunDetailSchema,
  events: z.array(RunEventSchema),
  exchanges: z.array(RecordedExchangeSchema),
  artifacts: z.array(ExportedArtifactSchema),
});
export type RunExport = z.infer<typeof RunExportSchema>;

// -----------------------------------------------------------------------------------------------------
// History

/** Filters shared by the history, the matrix and the metrics (no paging). */
export const RunFilterSchema = RunListQuerySchema.pick({
  issuer: true,
  wallet: true,
  verifier: true,
  version: true,
  format: true,
  scenario: true,
  outcome: true,
  verdict: true,
  mode: true,
  from: true,
  to: true,
});
export type RunFilter = z.infer<typeof RunFilterSchema>;

// -----------------------------------------------------------------------------------------------------
// Compatibility matrix

/** The six values that identify a matrix cell. */
export const MatrixCellKeySchema = z.object({
  issuer: RoleIdSchema,
  wallet: RoleIdSchema,
  verifier: RoleIdSchema,
  format: CredentialFormatSchema,
  vpProfile: VpProfileSchema,
  scenario: ScenarioIdSchema,
});
export type MatrixCellKey = z.infer<typeof MatrixCellKeySchema>;

/**
 * State of a cell: the verdict of its latest finished run, `not-supported` when the compatibility check
 * rules the combination out (whether or not a run was stored), or `untested` when it could run but
 * never has.
 */
export const MatrixCellStatusSchema = z.enum(['pass', 'fail', 'error', 'not-supported', 'untested']);
export type MatrixCellStatus = z.infer<typeof MatrixCellStatusSchema>;

export const MatrixCountsSchema = z.object({
  runs: z.number().int().nonnegative(),
  pass: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
  notSupported: z.number().int().nonnegative(),
});
export type MatrixCounts = z.infer<typeof MatrixCountsSchema>;

export const MatrixLatestRunSchema = z.object({
  runId: RunIdSchema,
  createdAt: IsoDateTimeSchema,
  mode: RunModeSchema,
  vciProfile: VciProfileSchema,
  outcome: OutcomeSchema.optional(),
  verdict: VerdictSchema.optional(),
  credentialProof: z.string().optional(),
  error: ReportErrorSchema.optional(),
  versions: z.object({ issuer: z.string(), wallet: z.string(), verifier: z.string() }),
});
export type MatrixLatestRun = z.infer<typeof MatrixLatestRunSchema>;

export const MatrixCellSchema = z.object({
  /** `issuer/wallet/verifier/format/vpProfile/scenario`; stable, URL-safe once encoded. */
  id: z.string(),
  key: MatrixCellKeySchema,
  status: MatrixCellStatusSchema,
  /** `run`: the status comes from a stored run; `compatibility`: from the check alone. */
  source: z.enum(['run', 'compatibility']),
  latestRun: MatrixLatestRunSchema.optional(),
  counts: MatrixCountsSchema,
  /** Compatibility reasons for the roles as registered now (blocking ones explain `not-supported`). */
  reasons: z.array(CompatibilityReasonSchema),
  /** Entries of the gap register linked to this cell. */
  gapIds: z.array(z.string()),
});
export type MatrixCell = z.infer<typeof MatrixCellSchema>;

export const MatrixRoleSchema = RoleRefSchema.extend({ kind: RoleKindSchema, registered: z.boolean() });
export type MatrixRole = z.infer<typeof MatrixRoleSchema>;

/** Query of `GET /api/matrix`. */
export const MatrixQuerySchema = z.object({
  /** Answer as JSON (default) or as a dated Markdown document. */
  format: z.enum(['json', 'md']).default('json'),
  issuer: RoleIdSchema.optional(),
  wallet: RoleIdSchema.optional(),
  verifier: RoleIdSchema.optional(),
  credentialFormat: CredentialFormatSchema.optional(),
  vpProfile: VpProfileSchema.optional(),
  /** Scenario of the cells listed from the compatibility check; stored runs of every scenario are shown. */
  scenario: ScenarioIdSchema.default('happy'),
  /** Run mode of the stored runs to use. */
  mode: RunModeSchema.optional(),
  /** Leave out cells that cannot run (default: included, with reasons). */
  hideNotSupported: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});
export type MatrixQuery = z.infer<typeof MatrixQuerySchema>;

export const MatrixSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  playgroundVersion: z.string(),
  roles: z.array(MatrixRoleSchema),
  totals: z.object({
    cells: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    notSupported: z.number().int().nonnegative(),
    untested: z.number().int().nonnegative(),
  }),
  cells: z.array(MatrixCellSchema),
});
export type Matrix = z.infer<typeof MatrixSchema>;

// -----------------------------------------------------------------------------------------------------
// Metrics

/** Duration distribution in milliseconds; percentiles use the nearest-rank method. */
export const DurationStatsSchema = z.object({
  count: z.number().int().nonnegative(),
  sumMs: z.number().nonnegative(),
  p50Ms: z.number().nonnegative().nullable(),
  p95Ms: z.number().nonnegative().nullable(),
  maxMs: z.number().nonnegative().nullable(),
});
export type DurationStats = z.infer<typeof DurationStatsSchema>;

export const StepMetricSchema = z.object({
  step: StepIdSchema,
  label: z.string(),
  /** Steps that ran (`ok` or `failed`); skipped and not-run steps are not counted. */
  executed: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** ok / executed, or null when the step never ran. */
  successRate: z.number().min(0).max(1).nullable(),
  duration: DurationStatsSchema,
});
export type StepMetric = z.infer<typeof StepMetricSchema>;

/** The two halves of a run: issuer -> wallet (issuance) and wallet -> verifier (presentation). */
export const PairPhaseSchema = z.enum(['issuance', 'presentation']);
export type PairPhase = z.infer<typeof PairPhaseSchema>;

export const PairMetricSchema = z.object({
  phase: PairPhaseSchema,
  from: RoleIdSchema,
  to: RoleIdSchema,
  /** Runs in which at least one step of this phase ran. */
  attempts: z.number().int().nonnegative(),
  /** Runs in which every step of the phase that ran was `ok` and its last step completed. */
  succeeded: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  /** Duration of the phase: sum of its step durations per run. */
  duration: DurationStatsSchema,
});
export type PairMetric = z.infer<typeof PairMetricSchema>;

export const FlowMetricSchema = z.object({
  issuer: RoleIdSchema,
  wallet: RoleIdSchema,
  verifier: RoleIdSchema,
  format: CredentialFormatSchema,
  runs: z.number().int().nonnegative(),
  pass: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
  notSupported: z.number().int().nonnegative(),
  /** pass / (pass + fail + error); not-supported runs were never attempted and are left out. */
  successRate: z.number().min(0).max(1).nullable(),
  duration: DurationStatsSchema,
});
export type FlowMetric = z.infer<typeof FlowMetricSchema>;

/** Issued credential sizes per issuer and format. */
export const CredentialSizeMetricSchema = z.object({
  issuer: RoleIdSchema,
  format: CredentialFormatSchema,
  samples: z.number().int().positive(),
  maxBytes: z.number().int().nonnegative(),
  maxPixelpassChars: z.number().int().nonnegative(),
  /** Samples whose PixelPass text fits a version 40 QR code at level L. */
  fitsQrV40: z.number().int().nonnegative(),
  latest: CredentialSizeSchema.extend({ runId: RunIdSchema }),
});
export type CredentialSizeMetric = z.infer<typeof CredentialSizeMetricSchema>;

export const MetricsQuerySchema = RunFilterSchema.omit({ outcome: true, verdict: true });
export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;

/** `GET /api/metrics`. */
export const MetricsSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  /** Finished runs the figures are computed from. */
  window: z.object({
    runs: z.number().int().nonnegative(),
    firstRunAt: IsoDateTimeSchema.optional(),
    lastRunAt: IsoDateTimeSchema.optional(),
  }),
  verdicts: z.object({
    pass: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    notSupported: z.number().int().nonnegative(),
  }),
  successRate: z.number().min(0).max(1).nullable(),
  steps: z.array(StepMetricSchema),
  pairs: z.array(PairMetricSchema),
  flows: z.array(FlowMetricSchema),
  credentialSizes: z.array(CredentialSizeMetricSchema),
});
export type Metrics = z.infer<typeof MetricsSchema>;

// -----------------------------------------------------------------------------------------------------
// Gap register

/**
 * One entry of `docs/gaps/gaps.json`. `cells` link the gap to matrix cells with patterns of the cell
 * id: `issuer/wallet/verifier/format/vpProfile/scenario`, where `*` matches any value and trailing
 * segments may be left out.
 */
export const GapSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  repository: z.string().min(1),
  version: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['new', 'existing-upstream', 'fixed-locally', 'resolved']).optional(),
  summary: z.string().optional(),
  cells: z.array(z.string().min(1)).default([]),
  upstreamIssue: z.string().optional(),
  issueDraft: z.string().optional(),
  evidence: z
    .object({ caseId: z.string().optional(), runId: z.string().optional(), date: z.string().optional() })
    .optional(),
  /** `private`: security-relevant; only the id, repository and severity are published. */
  disclosure: z.enum(['public', 'private']).default('public'),
});
export type Gap = z.infer<typeof GapSchema>;

/** `GET /api/gaps`. */
export const GapListSchema = z.object({
  /** Repository-relative path of the register, or null when it does not exist yet. */
  source: z.string().nullable(),
  gaps: z.array(GapSchema),
  /** Entries that did not match the schema, with the reason; they are left out of `gaps`. */
  problems: z.array(z.object({ index: z.number().int(), message: z.string() })),
});
export type GapList = z.infer<typeof GapListSchema>;
