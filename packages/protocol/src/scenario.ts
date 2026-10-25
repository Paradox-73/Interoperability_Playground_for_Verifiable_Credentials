// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';
import { RoleIdSchema, ScenarioIdSchema } from './common.js';
import { CredentialFormatSchema, OutcomeSchema, VpProfileSchema } from './enums.js';

/**
 * Which artefact a tamper scenario corrupts. The issuer and wallet roles apply credential and
 * presentation tampering respectively; `none` is the happy path.
 */
export const TamperTargetSchema = z.enum(['none', 'credential', 'presentation']);
export type TamperTarget = z.infer<typeof TamperTargetSchema>;

/**
 * `happy`: nothing changed. `tamper`: a deliberate corruption a correct verifier must reject (or report
 * as expired). `probe`: a valid variant (another DID method, proof type or format id) that every
 * standards-compliant role should accept, so a red cell against it points at an interoperability gap.
 */
export const ScenarioCategorySchema = z.enum(['happy', 'tamper', 'probe']);
export type ScenarioCategory = z.infer<typeof ScenarioCategorySchema>;

/**
 * Roles a scenario needs, per role kind: the scenario applies only when the chosen role is listed.
 * Missing kinds accept any role. Issuer-side variants need an issuer the playground controls
 * (`ref-issuer`); wallet-side tampering needs `ref-wallet`.
 */
export const ScenarioRequirementsSchema = z.object({
  issuer: z.array(RoleIdSchema).min(1).optional(),
  wallet: z.array(RoleIdSchema).min(1).optional(),
  verifier: z.array(RoleIdSchema).min(1).optional(),
});
export type ScenarioRequirements = z.infer<typeof ScenarioRequirementsSchema>;

/** A happy path or a deliberate corruption, with the outcome a correct verifier must report. */
export const ScenarioSpecSchema = z.object({
  id: ScenarioIdSchema,
  title: z.string().min(1),
  /** Plain-language explanation shown in the UI and the report. */
  description: z.string().min(1),
  expected: OutcomeSchema,
  target: TamperTargetSchema,
  /** Formats the scenario can be applied to; missing means every format. */
  formats: z.array(CredentialFormatSchema).optional(),
  /** Specification text that makes the expected outcome correct, for example a section reference. */
  reference: z.string().optional(),
  category: ScenarioCategorySchema.optional(),
  /** Roles the scenario needs; missing means any combination. */
  requires: ScenarioRequirementsSchema.optional(),
  /** OpenID4VP profiles the scenario applies to; missing means both. */
  vpProfiles: z.array(VpProfileSchema).min(1).optional(),
  /** Gap id or upstream issue the scenario probes, for example `G7` or `inji/inji-certify#1054`. */
  gap: z.string().min(1).optional(),
});
export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;
