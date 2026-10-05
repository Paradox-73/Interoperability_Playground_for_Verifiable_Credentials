/**
 * Values passed between the issuer, wallet and verifier roles during the four phases of a run:
 * issue -> hold -> present -> verify.
 */
import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';
import {
  CredentialFormatSchema,
  IssuanceModeSchema,
  OutcomeSchema,
  VciProfileSchema,
  VpProfileSchema,
} from './enums.js';

/** What the orchestrator asks the issuer for. */
export const IssuanceRequestSchema = z.object({
  format: CredentialFormatSchema,
  vciProfile: VciProfileSchema,
  /** Credential configuration id in the issuer's metadata; the issuer role picks its default when missing. */
  credentialConfigurationId: z.string().optional(),
  /** Subject claims for issuers that accept them (pre-authorized data); test data only. */
  claims: z.record(z.string(), z.unknown()).optional(),
  /**
   * How the wallet will start: set to `wallet-initiated` when the wallet cannot take a credential offer
   * (Inji Web through Mimoto, gap G5), so an issuer that supports both answers with its entry point.
   */
  mode: IssuanceModeSchema.optional(),
});
export type IssuanceRequest = z.infer<typeof IssuanceRequestSchema>;

/**
 * How the wallet starts receiving the credential: from a credential offer (pre-authorized code or
 * issuer-initiated authorization code), or by contacting the issuer itself (wallet-initiated flow).
 */
export const IssuanceStartSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('credential-offer'),
    /** `openid-credential-offer://?credential_offer_uri=...` or `?credential_offer=...` */
    offerUri: z.string().min(1),
    credentialIssuer: z.url(),
    credentialConfigurationIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    mode: z.literal('wallet-initiated'),
    credentialIssuer: z.url(),
    credentialConfigurationId: z.string().min(1),
  }),
]);
export type IssuanceStart = z.infer<typeof IssuanceStartSchema>;

/** A credential stored by a wallet role for the rest of the run. */
export const HeldCredentialSchema = z.object({
  id: z.string().min(1),
  format: CredentialFormatSchema,
  /** The credential exactly as the issuer returned it: a JSON string for ldp_vc, the compact form for SD-JWT VC, base64url for mso_mdoc. */
  raw: z.string().min(1),
  credentialIssuer: z.string().min(1),
  credentialConfigurationId: z.string().optional(),
  /** Key id (often a DID URL) of the holder key the credential is bound to. */
  holderKeyId: z.string().optional(),
  /** Proof type of the credential as issued, for example `Ed25519Signature2020` or `ES256`; copied into the report. */
  proofType: z.string().min(1).optional(),
  /** Proof type of the wallet's proof of possession sent with the credential request, for example `ES256`. */
  holderProofType: z.string().min(1).optional(),
  /** DID (or other identifier) of the issuer key that signed the credential. */
  issuerDid: z.string().min(1).optional(),
  receivedAt: IsoDateTimeSchema,
});
export type HeldCredential = z.infer<typeof HeldCredentialSchema>;

/** What the orchestrator asks the verifier to request from the wallet. */
export const PresentationSpecSchema = z.object({
  format: CredentialFormatSchema,
  vpProfile: VpProfileSchema,
  /** Credential type or `vct` the verifier asks for; the verifier role picks its default when missing. */
  credentialType: z.string().optional(),
  /** Claim paths to request, for selective disclosure; missing means the verifier's default set. */
  claims: z.array(z.string().min(1)).optional(),
});
export type PresentationSpec = z.infer<typeof PresentationSpecSchema>;

/** Kind of query carried by an authorization request. */
export const PresentationQueryKindSchema = z.enum(['presentation_definition', 'dcql_query']);
export type PresentationQueryKind = z.infer<typeof PresentationQueryKindSchema>;

/** A created authorization request, as handed to the wallet role and back to the verifier role. */
export const PresentationRequestRefSchema = z.object({
  /** `openid4vp://authorize?...` (or the verifier's own scheme); what a QR code would contain. */
  requestUri: z.string().min(1),
  /** The verifier's own id for this request, for example Inji Verify's transaction id. */
  handle: z.string().min(1),
  queryKind: PresentationQueryKindSchema,
  nonce: z.string().optional(),
  clientId: z.string().optional(),
  responseUri: z.string().optional(),
  /** Verifier-specific values the verifier role needs later; other roles must not read them. */
  verifierState: z.record(z.string(), z.unknown()).optional(),
});
export type PresentationRequestRef = z.infer<typeof PresentationRequestRefSchema>;

/** The wallet's confirmation that it posted its response to the verifier. */
export const SubmissionReceiptSchema = z.object({
  submittedAt: IsoDateTimeSchema,
  /** HTTP status of the response submission. */
  status: z.number().int().optional(),
  /** `redirect_uri` returned by the verifier, if any. */
  redirectUri: z.string().optional(),
});
export type SubmissionReceipt = z.infer<typeof SubmissionReceiptSchema>;

/** One check a verifier reports, for example the issuer signature or the expiry date. */
export const VerificationCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pass', 'fail', 'skipped']),
  detail: z.string().optional(),
});
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const VerificationResultSchema = z.object({
  outcome: OutcomeSchema,
  checks: z.array(VerificationCheckSchema),
  /** The verifier's result body, unchanged, for the inspector. */
  raw: z.string().optional(),
  receivedAt: IsoDateTimeSchema,
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
