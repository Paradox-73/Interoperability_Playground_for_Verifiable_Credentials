// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';
import { IsoDateTimeSchema, RoleIdSchema, RunIdSchema, ScenarioIdSchema } from './common.js';
import { CredentialFormatSchema, StepIdSchema, VciProfileSchema, VpProfileSchema } from './enums.js';

/**
 * The configuration of one run: one cell of the compatibility matrix. Also the body of `POST /api/runs`;
 * the defaults are Inji's stable protocol versions and the happy path.
 */
export const RunConfigSchema = z.object({
  issuer: RoleIdSchema,
  wallet: RoleIdSchema,
  verifier: RoleIdSchema,
  format: CredentialFormatSchema,
  vciProfile: VciProfileSchema.default('draft13'),
  vpProfile: VpProfileSchema.default('inji-draft'),
  scenario: ScenarioIdSchema.default('happy'),
  /** Id of a stored run whose configuration this run repeats (replay mode). */
  replayOf: RunIdSchema.optional(),
});
/** A fully resolved run configuration (defaults applied). */
export type RunConfig = z.infer<typeof RunConfigSchema>;
/** What a client may send: optional fields may be left out and get their defaults. */
export type RunConfigInput = z.input<typeof RunConfigSchema>;

/** Body of the `POST /api/runs` response. */
export const CreateRunResponseSchema = z.object({ runId: RunIdSchema });
export type CreateRunResponse = z.infer<typeof CreateRunResponseSchema>;

/** Machine-readable error of a failed step. */
export const StepErrorSchema = z.object({
  /** Stable code, for example `http.400`, `timeout`, `verifier.signature-invalid`, `person.cancelled`. */
  code: z.string().min(1),
  message: z.string().min(1),
  /** The recorded exchange that shows the failure, when there is one. */
  exchangeId: z.string().optional(),
});
export type StepError = z.infer<typeof StepErrorSchema>;

/** Timing and result of one step, as stored in the report. */
export const StepSummarySchema = z.object({
  step: StepIdSchema,
  status: z.enum(['ok', 'failed', 'skipped', 'not-run']),
  durationMs: z.number().nonnegative(),
  startedAt: IsoDateTimeSchema.optional(),
});
export type StepSummary = z.infer<typeof StepSummarySchema>;
