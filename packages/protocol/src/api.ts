/**
 * Request and response bodies of the playground server's REST and WebSocket API that are not already
 * a domain object (run config, report, event). The server validates with these schemas and generates
 * its OpenAPI document from them; the UI and the CLI parse responses with them.
 */
import { z } from 'zod';
import { IsoDateTimeSchema, RoleIdSchema, RunIdSchema, ScenarioIdSchema } from './common.js';
import {
  CredentialFormatSchema,
  OutcomeSchema,
  RoleKindSchema,
  RunModeSchema,
  VciProfileSchema,
  VerdictSchema,
  VpProfileSchema,
} from './enums.js';
import { RunEventSchema } from './events.js';
import { PersonActionSchema } from './person.js';
import { InteropReportSchema, ReportErrorSchema } from './report.js';
import { RoleStatusSchema, StackStatusSchema } from './roles.js';
import { RunConfigSchema } from './run.js';

/** Error body of every 4xx and 5xx answer. */
export const ApiErrorSchema = z.object({
  /** Stable code, for example `bad-request`, `not-found`, `run-finished`. */
  error: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Body of `POST /api/runs`. Either a full run configuration, or `replayOf` with the id of a stored run
 * whose configuration is copied; fields sent next to `replayOf` override the copied ones.
 */
export const CreateRunRequestSchema = z.object({
  issuer: RoleIdSchema.optional(),
  wallet: RoleIdSchema.optional(),
  verifier: RoleIdSchema.optional(),
  format: CredentialFormatSchema.optional(),
  vciProfile: VciProfileSchema.optional(),
  vpProfile: VpProfileSchema.optional(),
  scenario: ScenarioIdSchema.optional(),
  replayOf: RunIdSchema.optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

/** `queued`: waiting for the Inji stack (live runs are serialised); `running`; `finished` (report stored). */
export const RunStatusSchema = z.enum(['queued', 'running', 'finished']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** One row of the run history. */
export const RunSummarySchema = z.object({
  runId: RunIdSchema,
  status: RunStatusSchema,
  mode: RunModeSchema,
  config: RunConfigSchema,
  createdAt: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema.optional(),
  finishedAt: IsoDateTimeSchema.optional(),
  /** Set once the run has finished. */
  outcome: OutcomeSchema.optional(),
  verdict: VerdictSchema.optional(),
  error: ReportErrorSchema.optional(),
  /** Versions of the three role implementations, as described when the run was created. */
  versions: z.object({ issuer: z.string(), wallet: z.string(), verifier: z.string() }),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

/** Body of `GET /api/runs/{id}`. */
export const RunDetailSchema = RunSummarySchema.extend({
  report: InteropReportSchema.optional(),
  /** What a person must do right now for the run to continue, if anything. */
  pendingAction: PersonActionSchema.optional(),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

/** Query of `GET /api/runs`. Every filter is optional; filters combine with AND. */
export const RunListQuerySchema = z.object({
  issuer: RoleIdSchema.optional(),
  wallet: RoleIdSchema.optional(),
  verifier: RoleIdSchema.optional(),
  /** Matches runs where any of the three roles had this version. */
  version: z.string().min(1).optional(),
  format: CredentialFormatSchema.optional(),
  scenario: ScenarioIdSchema.optional(),
  outcome: OutcomeSchema.optional(),
  verdict: VerdictSchema.optional(),
  status: RunStatusSchema.optional(),
  mode: RunModeSchema.optional(),
  /** Runs created at or after this time. */
  from: IsoDateTimeSchema.optional(),
  /** Runs created before this time. */
  to: IsoDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RunListQuery = z.infer<typeof RunListQuerySchema>;
export type RunListQueryInput = z.input<typeof RunListQuerySchema>;

/** Body of `GET /api/runs`: newest first. */
export const RunListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  items: z.array(RunSummarySchema),
});
export type RunListResponse = z.infer<typeof RunListResponseSchema>;

export const RunEventListSchema = z.array(RunEventSchema);

/** Body of `POST /api/runs/{id}/cancel` and similar actions on a run. */
export const RunActionResponseSchema = z.object({ runId: RunIdSchema, status: RunStatusSchema });
export type RunActionResponse = z.infer<typeof RunActionResponseSchema>;

/** Body of `POST /api/runs/{id}/person-done`: the person did what the modal asked (manual fallback). */
export const PersonDoneRequestSchema = z.object({
  /** Id of the action being confirmed; when given, it must match the pending action. */
  actionId: z.string().min(1).optional(),
});
export type PersonDoneRequest = z.infer<typeof PersonDoneRequestSchema>;

/**
 * Body of `POST /api/runs/{id}/verifier-callback`: a signal from a verifier component that runs outside
 * the server, such as the Inji Verify React SDK in the browser. The run's verifier role receives it
 * through `RunContext.waitForCallback()`.
 */
export const VerifierCallbackSchema = z.object({
  /**
   * `vp-received`: the SDK's `onVPReceived(transactionId)`; the verifier role then fetches the result
   * itself. `vp-processed`: `onVPProcessed(results)`. `error`: `onError(error)`.
   */
  kind: z.enum(['vp-received', 'vp-processed', 'error']),
  transactionId: z.string().min(1).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  /** The callback's argument, unchanged. */
  data: z.unknown().optional(),
});
export type VerifierCallback = z.infer<typeof VerifierCallbackSchema>;

/** Query of `GET /api/roles`. */
export const RoleListQuerySchema = z.object({ kind: RoleKindSchema.optional() });

export const RoleListResponseSchema = z.array(RoleStatusSchema);

/** Body of `GET /api/stack/status`: the Inji containers plus the health of every registered role. */
export const StackStatusResponseSchema = StackStatusSchema.extend({
  roles: z.array(RoleStatusSchema),
});
export type StackStatusResponse = z.infer<typeof StackStatusResponseSchema>;

/** Query of `GET /api/compatibility`: one cell of the matrix. */
export const CompatibilityQuerySchema = z.object({
  issuer: RoleIdSchema,
  wallet: RoleIdSchema,
  verifier: RoleIdSchema,
  format: CredentialFormatSchema,
  vciProfile: VciProfileSchema.default('draft13'),
  vpProfile: VpProfileSchema.default('inji-draft'),
  scenario: ScenarioIdSchema.default('happy'),
});
export type CompatibilityQuery = z.infer<typeof CompatibilityQuerySchema>;

/** Why a combination cannot run (`blocking`) or may not work as expected (`warning`). */
export const CompatibilityReasonSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['blocking', 'warning']),
  message: z.string().min(1),
  /** Role ids the reason is about. */
  roles: z.array(RoleIdSchema),
  /** Ids of entries in the interoperability gap register that explain the reason. */
  gapIds: z.array(z.string()).optional(),
});
export type CompatibilityReason = z.infer<typeof CompatibilityReasonSchema>;

export const CompatibilityResultSchema = z.object({
  runnable: z.boolean(),
  /** `live` when an Inji module takes part (such runs wait for each other), else `reference`. */
  mode: RunModeSchema,
  reasons: z.array(CompatibilityReasonSchema),
});
export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

/**
 * Messages the server sends on `GET /ws`: every `RunEvent`, plus an acknowledgement of each
 * subscription (sent before the stored events of that run) and an error for a malformed message.
 */
export const WsServerMessageSchema = z.union([
  RunEventSchema,
  z.object({ type: z.literal('subscribed'), runId: z.union([RunIdSchema, z.literal('*')]) }),
  z.object({ type: z.literal('unsubscribed'), runId: z.union([RunIdSchema, z.literal('*')]) }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
