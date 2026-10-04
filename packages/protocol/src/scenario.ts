import { z } from 'zod';
import { ScenarioIdSchema } from './common.js';
import { CredentialFormatSchema, OutcomeSchema } from './enums.js';

/**
 * Which artefact a tamper scenario corrupts. The issuer and wallet roles apply credential and
 * presentation tampering respectively; `none` is the happy path.
 */
export const TamperTargetSchema = z.enum(['none', 'credential', 'presentation']);
export type TamperTarget = z.infer<typeof TamperTargetSchema>;

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
});
export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;
