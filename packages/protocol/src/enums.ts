// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Closed vocabularies shared by every package. Each one is a zod enum (for runtime validation of
 * API input, stored rows and WebSocket messages) plus the TypeScript union inferred from it.
 */
import { z } from 'zod';

/**
 * Credential formats, named by the `format` identifier used in OpenID4VCI credential configurations.
 * `vc+sd-jwt` and `dc+sd-jwt` are the old and the new name of the same SD-JWT VC format; both stay
 * because Inji's stable releases still use the old one.
 */
export const CredentialFormatSchema = z.enum(['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc']);
export type CredentialFormat = z.infer<typeof CredentialFormatSchema>;
export const CREDENTIAL_FORMATS = CredentialFormatSchema.options;

/** OpenID4VCI version spoken by an issuer or wallet: draft 13 (Inji stable) or the final 1.0. */
export const VciProfileSchema = z.enum(['draft13', 'v1']);
export type VciProfile = z.infer<typeof VciProfileSchema>;

/**
 * OpenID4VP version spoken by a verifier or wallet: `inji-draft` = drafts 21-23 with Presentation
 * Exchange (Inji stable), `final-1.0` = OpenID4VP 1.0 with DCQL.
 */
export const VpProfileSchema = z.enum(['inji-draft', 'final-1.0']);
export type VpProfile = z.infer<typeof VpProfileSchema>;

/**
 * What the verifier answered. `ERROR` is also used when a role rejected a protocol message before the
 * verifier answered; `NOT_RUN` means the run stopped for a reason unrelated to interoperability.
 */
export const OutcomeSchema = z.enum(['VALID', 'INVALID', 'EXPIRED', 'ERROR', 'NOT_RUN']);
export type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * Judgement of a run against its scenario. `pass` / `fail` compare the outcome with the expected one
 * (a role that rejects the other side's message before the verifier answers gives the outcome `ERROR`,
 * which is a `fail` unless the scenario expects it); `error` means nothing about interoperability was
 * learned (a step timed out, the run was cancelled, a service was unreachable); `not-supported` means
 * the combination was rejected by the compatibility check before it started.
 */
export const VerdictSchema = z.enum(['pass', 'fail', 'error', 'not-supported']);
export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Protocol steps a recorded exchange or a timeline row can belong to. The plain-language label and
 * the specification reference of each step are in `steps.ts`.
 */
export const StepIdSchema = z.enum([
  'issuer.offer',
  'issuer.metadata',
  'as.metadata',
  'token',
  'nonce',
  'credential',
  'verifier.request',
  'wallet.fetch-request',
  'wallet.submit',
  'verifier.result',
  'person.action',
  'playground.admin',
]);
export type StepId = z.infer<typeof StepIdSchema>;
export const STEP_IDS = StepIdSchema.options;

export const RoleKindSchema = z.enum(['issuer', 'wallet', 'verifier']);
export type RoleKind = z.infer<typeof RoleKindSchema>;

/** Who wrote an implementation: the Inji project, this playground (independent code), or a third party. */
export const EcosystemSchema = z.enum(['inji', 'reference', 'external']);
export type Ecosystem = z.infer<typeof EcosystemSchema>;

/**
 * How a role is driven: by code (`automatic`), by a person scanning a QR code or opening a link
 * (`manual`), or by a component that must be open in the playground's browser tab (`browser`).
 */
export const InteractionSchema = z.enum(['automatic', 'manual', 'browser']);
export type Interaction = z.infer<typeof InteractionSchema>;

export const IssuanceModeSchema = z.enum(['credential-offer', 'wallet-initiated']);
export type IssuanceMode = z.infer<typeof IssuanceModeSchema>;

/** `dc_api`: the answer comes back through the browser's Digital Credentials API (OpenID4VP 1.0 Appendix A). */
export const ResponseModeSchema = z.enum(['direct_post', 'direct_post.jwt', 'dc_api']);
export type ResponseMode = z.infer<typeof ResponseModeSchema>;

export const StepStatusSchema = z.enum(['ok', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

/** `live` = at least one Inji module took part; `reference` = reference roles only; `playback` = a stored run replayed. */
export const RunModeSchema = z.enum(['live', 'reference', 'playback']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const ArtifactKindSchema = z.enum(['offer', 'credential', 'request-object', 'vp-token', 'result']);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const HealthStatusSchema = z.enum(['up', 'degraded', 'down', 'unknown']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
