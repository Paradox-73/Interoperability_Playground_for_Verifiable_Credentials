/**
 * Verification of one presentation inside a `vp_token`, for each format, as checks a run report can
 * show. The format library stops at the first failure, so a failed check is followed by `skipped`
 * entries for the checks it never reached: the report never claims a check passed that did not run.
 *
 * - `ldp_vp`: proof `challenge` = request nonce and `domain` = client_id (OpenID4VP 1.0 Appendix
 *   B.1.3.2.5), holder proof, every credential proof and validity period, then holder binding: each
 *   credential's `credentialSubject.id` equals the presentation `holder`, compared literally, so a
 *   padded and an unpadded did:jwk of one key are reported (inji/inji-certify#1054).
 * - SD-JWT VC: issuer signature, disclosures, validity, and the KB-JWT `nonce`, `aud` (the full
 *   client_id, prefix included, Appendix B.3.6), `sd_hash` and `iat` (RFC 9901 section 7.3).
 */
import {
  FormatError,
  errorMessage,
  isRecord,
  verifyLdpVp,
  verifySdJwtVc,
  type DidResolver,
  type DocumentLoader,
  type FormatErrorCode,
  type JsonObject,
  type PublicJwk,
} from '@inji-playground/formats';
import type { Outcome } from '@inji-playground/protocol';
import { isSdJwtVcFormat, type PresentableFormat } from '../common/constants.js';
import { credentialTypes, type CredentialView } from '../query/credential-view.js';

export type CheckStatus = 'pass' | 'fail' | 'skipped';

export interface Check {
  /** Stable id, prefixed with the presentation's position when a response holds several. */
  id: string;
  status: CheckStatus;
  detail?: string;
  spec?: string;
}

export interface ReportedError {
  code: string;
  message: string;
  spec?: string;
  details?: Record<string, unknown>;
}

export const PRESENTATION_CHECKS = [
  'format',
  'nonce',
  'audience',
  'holder-binding',
  'validity',
  'signature',
] as const;
export type PresentationCheck = (typeof PRESENTATION_CHECKS)[number];

const CHECK_FOR_CODE: Partial<Record<FormatErrorCode, PresentationCheck>> = {
  LDP_CHALLENGE_MISMATCH: 'nonce',
  KB_JWT_NONCE_MISMATCH: 'nonce',
  LDP_DOMAIN_MISMATCH: 'audience',
  KB_JWT_AUDIENCE_MISMATCH: 'audience',
  LDP_HOLDER_MISMATCH: 'holder-binding',
  KB_JWT_MISSING: 'holder-binding',
  KB_JWT_MALFORMED: 'holder-binding',
  KB_JWT_SIGNATURE_INVALID: 'holder-binding',
  KB_JWT_SD_HASH_MISMATCH: 'holder-binding',
  KB_JWT_HOLDER_KEY_UNRESOLVED: 'holder-binding',
  KB_JWT_IAT_OUT_OF_WINDOW: 'holder-binding',
  LDP_EXPIRED: 'validity',
  LDP_NOT_YET_VALID: 'validity',
  SDJWT_EXPIRED: 'validity',
  SDJWT_NOT_YET_VALID: 'validity',
  LDP_PROOF_INVALID: 'signature',
  SDJWT_SIGNATURE_INVALID: 'signature',
  SDJWT_DISCLOSURE_INVALID: 'signature',
  SDJWT_ISSUER_KEY_UNRESOLVED: 'signature',
  SDJWT_ISSUER_MISMATCH: 'signature',
  X5C_INVALID: 'signature',
  X5C_UNTRUSTED: 'signature',
  VERIFICATION_METHOD_NOT_FOUND: 'signature',
  DID_INVALID: 'signature',
  DID_METHOD_UNSUPPORTED: 'signature',
  DID_WEB_FETCH_FAILED: 'signature',
  DID_WEB_INSECURE: 'signature',
  DID_DOCUMENT_INVALID: 'signature',
};

const EXPIRY_CODES: ReadonlySet<string> = new Set(['LDP_EXPIRED', 'SDJWT_EXPIRED']);

export interface PresentationVerifierContext {
  nonce: string;
  /** The full client_id the request carried (with its 1.0 prefix, if any). */
  clientId: string;
  documentLoader: DocumentLoader;
  didResolver?: DidResolver;
  /** SD-JWT issuer keys known out of band, and x5c trust anchors. */
  sdJwtIssuerKeys?: PublicJwk[];
  x5cTrustAnchors?: string[];
  now?: Date;
  clockSkewSeconds?: number;
}

export interface PresentationVerification {
  outcome: Exclude<Outcome, 'NOT_RUN' | 'ERROR'>;
  checks: Check[];
  /** The verified credential as a query sees it; missing when verification failed. */
  view?: CredentialView;
  /** Disclosed or embedded claims, for the result page. */
  claims?: JsonObject;
  /** Issuer and proof type, for the run report. */
  issuer?: string;
  proofType?: string;
  errors: ReportedError[];
  warnings: string[];
}

/** Verifies one presentation of the given credential format. Never throws for a bad presentation. */
export async function verifyPresentation(
  format: PresentableFormat,
  presentation: unknown,
  context: PresentationVerifierContext,
): Promise<PresentationVerification> {
  try {
    return isSdJwtVcFormat(format)
      ? await verifySdJwtPresentation(format, presentation, context)
      : await verifyLdpPresentation(presentation, context);
  } catch (error) {
    return failed(error);
  }
}

async function verifyLdpPresentation(
  presentation: unknown,
  context: PresentationVerifierContext,
): Promise<PresentationVerification> {
  const vp = typeof presentation === 'string' ? parseJsonPresentation(presentation) : presentation;
  if (!isRecord(vp)) {
    throw new FormatError('LDP_MALFORMED', 'an ldp_vp presentation must be a JSON object');
  }
  const verified = await verifyLdpVp(vp, {
    documentLoader: context.documentLoader,
    expectedChallenge: context.nonce,
    expectedDomain: context.clientId,
    ...(context.now ? { now: context.now } : {}),
    ...(context.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: context.clockSkewSeconds }),
  });
  const embedded = vp.verifiableCredential;
  const credentials = (Array.isArray(embedded) ? embedded : [embedded]).filter(isRecord);
  const first = credentials[0];
  if (!first) throw new FormatError('LDP_MALFORMED', 'the presentation holds no credential');
  for (const credential of credentials) {
    const subject = credential.credentialSubject;
    const subjectId = isRecord(subject) && typeof subject.id === 'string' ? subject.id : undefined;
    if (subjectId?.startsWith('did:') && subjectId !== verified.holder) {
      throw new FormatError(
        'LDP_HOLDER_MISMATCH',
        'the credential is bound to another holder than the one presenting it',
        {
          spec: 'VC Data Model 1.1 section 5.8 (subject-holder relationship); OpenID4VP 1.0 Appendix B.1.3.2.5',
          details: { credentialSubject: subjectId, holder: verified.holder },
        },
      );
    }
  }
  const subject = first.credentialSubject;
  return {
    outcome: 'VALID',
    checks: PRESENTATION_CHECKS.map((id) => ({ id, status: 'pass' as const })),
    view: { format: 'ldp_vc', json: first, types: credentialTypes(first) },
    claims: isRecord(subject) ? subject : {},
    issuer: verified.credentials[0]?.issuer ?? '',
    proofType: verified.credentials[0]?.proofType ?? verified.proofType,
    errors: [],
    warnings: verified.credentials.flatMap((credential) => credential.warnings),
  };
}

async function verifySdJwtPresentation(
  format: 'vc+sd-jwt' | 'dc+sd-jwt',
  presentation: unknown,
  context: PresentationVerifierContext,
): Promise<PresentationVerification> {
  if (typeof presentation !== 'string') {
    throw new FormatError('SDJWT_MALFORMED', 'an SD-JWT VC presentation must be a string');
  }
  const verified = await verifySdJwtVc(presentation, {
    keyBinding: { nonce: context.nonce, audience: context.clientId },
    ...(context.didResolver ? { didResolver: context.didResolver } : {}),
    ...(context.sdJwtIssuerKeys ? { issuerKeys: context.sdJwtIssuerKeys } : {}),
    ...(context.x5cTrustAnchors ? { x5c: { trustAnchors: context.x5cTrustAnchors } } : {}),
    ...(context.now ? { now: context.now } : {}),
    ...(context.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: context.clockSkewSeconds }),
  });
  const { claims } = verified;
  return {
    outcome: 'VALID',
    checks: PRESENTATION_CHECKS.map((id) => ({ id, status: 'pass' as const })),
    view: { format, json: claims, types: [], ...(typeof claims.vct === 'string' ? { vct: claims.vct } : {}) },
    claims,
    issuer:
      typeof claims.iss === 'string' ? claims.iss : (verified.issuerKey.kid ?? verified.issuerKey.source),
    proofType: typeof verified.header.alg === 'string' ? verified.header.alg : 'unknown',
    errors: [],
    warnings: verified.warnings,
  };
}

function parseJsonPresentation(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Inji Verify also accepts a base64url-encoded JSON presentation.
    try {
      return JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
    } catch (cause) {
      throw new FormatError('LDP_MALFORMED', 'ldp_vp presentation is neither JSON nor base64url JSON', {
        cause,
      });
    }
  }
}

/** Turns the first failure into one failed check, the ones after it skipped. */
function failed(error: unknown): PresentationVerification {
  const reported: ReportedError =
    error instanceof FormatError
      ? error.toJSON()
      : { code: 'VERIFICATION_ERROR', message: errorMessage(error) };
  const failedCheck: PresentationCheck =
    error instanceof FormatError ? (CHECK_FOR_CODE[error.code] ?? 'format') : 'format';
  const failedIndex = PRESENTATION_CHECKS.indexOf(failedCheck);
  const checks: Check[] = PRESENTATION_CHECKS.map((id, index) => {
    if (index === failedIndex) {
      return {
        id,
        status: 'fail',
        detail: `${reported.code}: ${reported.message}`,
        ...(reported.spec ? { spec: reported.spec } : {}),
      };
    }
    // The format library checks nonce, audience and holder before signatures and dates; checks listed
    // before the failure in PRESENTATION_CHECKS are therefore not claimed as passed either.
    return { id, status: 'skipped' };
  });
  return {
    outcome: EXPIRY_CODES.has(reported.code) ? 'EXPIRED' : 'INVALID',
    checks,
    errors: [reported],
    warnings: [],
  };
}
