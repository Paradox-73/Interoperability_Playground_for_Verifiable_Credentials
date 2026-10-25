// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';
import { IsoDateTimeSchema, RunIdSchema, ScenarioIdSchema } from './common.js';
import {
  CredentialFormatSchema,
  OutcomeSchema,
  RunModeSchema,
  StepIdSchema,
  VciProfileSchema,
  VerdictSchema,
  VpProfileSchema,
} from './enums.js';
import { RoleRefSchema } from './roles.js';
import { StepSummarySchema } from './run.js';

/**
 * Size of the issued credential and of its PixelPass QR text, used to show where a credential no longer
 * fits a QR code. A version 40 QR code holds at most 4,296 alphanumeric characters (ISO/IEC 18004).
 */
export const CredentialSizeSchema = z.object({
  bytes: z.number().int().nonnegative(),
  pixelpassChars: z.number().int().nonnegative(),
  fitsQrV40: z.boolean(),
});
export type CredentialSize = z.infer<typeof CredentialSizeSchema>;

/** Largest number of alphanumeric characters a version 40 QR code holds at error correction level L. */
export const QR_V40_ALPHANUMERIC_CAPACITY = 4296;

/** Where and why a run failed. */
export const ReportErrorSchema = z.object({
  step: StepIdSchema,
  code: z.string().min(1),
  message: z.string().min(1),
  exchangeId: z.string().optional(),
});
export type ReportError = z.infer<typeof ReportErrorSchema>;

/**
 * Pass/fail interoperability report of one run. The first fields are the ones the problem statement asks
 * for: issuer, wallet, verifier, format, proof type, outcome and error detail.
 */
export const InteropReportSchema = z.object({
  runId: RunIdSchema,
  createdAt: IsoDateTimeSchema,
  mode: RunModeSchema,
  issuer: RoleRefSchema,
  wallet: RoleRefSchema,
  verifier: RoleRefSchema,
  format: CredentialFormatSchema,
  /** Proof type of the credential, for example `Ed25519Signature2020` or `ES256`. */
  credentialProof: z.string().min(1),
  /** Proof type of the holder's key binding (proof of possession or KB-JWT), if any. */
  holderProof: z.string().optional(),
  issuerDid: z.string().optional(),
  vciProfile: VciProfileSchema,
  vpProfile: VpProfileSchema,
  scenario: z.object({ id: ScenarioIdSchema, expected: OutcomeSchema }),
  outcome: OutcomeSchema,
  verdict: VerdictSchema,
  error: ReportErrorSchema.optional(),
  steps: z.array(StepSummarySchema),
  credentialSize: CredentialSizeSchema.optional(),
  /** Id of the run whose configuration this run repeated. */
  replayOf: RunIdSchema.optional(),
});
export type InteropReport = z.infer<typeof InteropReportSchema>;
