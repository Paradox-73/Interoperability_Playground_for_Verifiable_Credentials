/**
 * Verification of one presentation inside a `vp_token`, for each format, as checks a run report can
 * show. The format library stops at the first failure, so a failed check is followed by `skipped`
 * entries for the checks it never reached: the report never claims a check passed that did not run.
 *
 * - `ldp_vp`: proof `challenge` = request nonce and `domain` = client_id (OpenID4VP 1.0 Appendix
 *   B.1.3.2.5), holder proof, every credential proof and validity period, then holder binding: each
 *   credential's `credentialSubject.id` equals the presentation `holder`, compared literally, so a
 *   padded and an unpadded did:jwk of one key are reported (inji/inji-certify#1054). A credential
 *   whose `credentialSubject.id` is missing or not a DID binds no holder: the check is `skipped`.
 * - SD-JWT VC: issuer signature, disclosures, validity, and the KB-JWT `nonce`, `aud` (the full
 *   client_id, prefix included, Appendix B.3.6), `sd_hash` and `iat` (RFC 9901 section 7.3).
 * - `mso_mdoc` (Appendix B.2): a base64url DeviceResponse. Issuer certificate chain to a trust anchor,
 *   issuer signature, value digests, validity, and the DeviceSignature over the SessionTranscript the
 *   verifier rebuilds from its own request: ISO/IEC TS 18013-7 Annex B.4.4 in `inji-draft` (with the
 *   wallet's mdoc generated nonce), OpenID4VP 1.0 Appendix B.2.6.1 in `final-1.0`. Nonce and client_id
 *   are inside that transcript, so a presentation made for another request fails the device signature
 *   (reported as holder binding: the check that failed cannot tell which input differed).
 * - `status`, for `ldp_vp` and SD-JWT VC: each Bitstring Status List entry or Token Status List
 *   reference is read from its list, which must be signed by the credential's issuer; revoked or
 *   suspended is INVALID. No status entry, an unsupported mechanism, or an mdoc: `skipped`, with why.
 */
import {
  FormatError,
  LDP_STATUS_NOT_CHECKED,
  checkStatusEntry,
  createDidResolver,
  errorMessage,
  isRecord,
  mdocSessionTranscript,
  verifyLdpVp,
  verifyMdocDeviceResponse,
  statusEntriesOf,
  verifySdJwtVc,
  type DidResolver,
  type DocumentLoader,
  type FetchLimits,
  type FormatErrorCode,
  type JsonObject,
  type PublicJwk,
} from '@inji-playground/formats';
import type { Outcome, VpProfile } from '@inji-playground/protocol';
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
  'status',
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
  ISSUER_UNTRUSTED: 'signature',
  MDOC_DEVICE_SIGNATURE_INVALID: 'holder-binding',
  MDOC_EXPIRED: 'validity',
  MDOC_NOT_YET_VALID: 'validity',
  MDOC_ISSUER_SIGNATURE_INVALID: 'signature',
  MDOC_DIGEST_MISMATCH: 'signature',
  MDOC_ALG_REJECTED: 'signature',
  VERIFICATION_METHOD_NOT_FOUND: 'signature',
  DID_INVALID: 'signature',
  DID_METHOD_UNSUPPORTED: 'signature',
  DID_WEB_FETCH_FAILED: 'signature',
  DID_WEB_INSECURE: 'signature',
  DID_DOCUMENT_INVALID: 'signature',
  STATUS_REVOKED: 'status',
  STATUS_SUSPENDED: 'status',
  STATUS_LIST_UNAVAILABLE: 'status',
  STATUS_LIST_INVALID: 'status',
};

const EXPIRY_CODES: ReadonlySet<string> = new Set(['LDP_EXPIRED', 'SDJWT_EXPIRED', 'MDOC_EXPIRED']);

export interface PresentationVerifierContext {
  nonce: string;
  /** The full client_id the request carried (with its 1.0 prefix, if any). */
  clientId: string;
  documentLoader: DocumentLoader;
  didResolver?: DidResolver;
  /** SD-JWT issuer keys known out of band, and x5c trust anchors (SD-JWT x5c and mdoc x5chain). */
  sdJwtIssuerKeys?: PublicJwk[];
  x5cTrustAnchors?: string[];
  /**
   * DIDs of the issuers this verifier accepts. When given, a credential whose issuer key is a DID outside
   * the list is INVALID, however good its signature: anyone can make a DID and sign with it. Issuers named
   * by x5c are trusted through `x5cTrustAnchors`, configured SD-JWT keys through `sdJwtIssuerKeys`.
   * Missing: every DID issuer is accepted.
   */
  trustedIssuers?: readonly string[];
  /** How status lists are fetched (client, address limits); default: global fetch with the default limits. */
  fetchLimits?: FetchLimits;
  now?: Date;
  clockSkewSeconds?: number;
  /** mso_mdoc: the profile picks the SessionTranscript; `response_uri` is part of it. */
  profile?: VpProfile;
  responseUri?: string;
  /** mso_mdoc in `inji-draft`: the wallet's mdoc generated nonce (ISO/IEC TS 18013-7 Annex B.4.4). */
  mdocGeneratedNonce?: string;
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
    if (format === 'mso_mdoc') return await verifyMdocPresentation(presentation, context);
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
  let unbound = false;
  for (const credential of credentials) {
    const subject = credential.credentialSubject;
    const subjectId = isRecord(subject) && typeof subject.id === 'string' ? subject.id : undefined;
    if (!subjectId?.startsWith('did:')) unbound = true;
    else if (subjectId !== verified.holder) {
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
  // The proof purpose already ties each credential's issuer to the controller of its signing key.
  for (const credential of verified.credentials) checkIssuerTrusted(credential.issuer, context);
  const status = await checkStatus(
    credentials.map((credential, index) => ({
      credential,
      issuer: verified.credentials[index]?.issuer ?? '',
    })),
    context,
  );
  const subject = first.credentialSubject;
  return {
    outcome: 'VALID',
    checks: PRESENTATION_CHECKS.map((id): Check => {
      if (id === 'status') return status;
      return id === 'holder-binding' && unbound
        ? {
            id,
            status: 'skipped',
            detail: 'a credentialSubject.id is not a DID, so there is no holder to bind the credential to',
          }
        : { id, status: 'pass' };
    }),
    view: { format: 'ldp_vc', json: first, types: credentialTypes(first) },
    claims: isRecord(subject) ? subject : {},
    issuer: verified.credentials[0]?.issuer ?? '',
    proofType: verified.credentials[0]?.proofType ?? verified.proofType,
    errors: [],
    // The status the format library could not check was checked above.
    warnings: verified.credentials
      .flatMap((credential) => credential.warnings)
      .filter((warning) => warning !== LDP_STATUS_NOT_CHECKED),
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
    // An x5c chain must end at a configured trust anchor (SD-JWT VC draft 19 section 2.5): checking
    // the signature against a self-signed leaf alone would accept any forger's key (scenario forged-x5c).
    x5c: { trustAnchors: context.x5cTrustAnchors ?? [], requireTrusted: true },
    ...(context.now ? { now: context.now } : {}),
    ...(context.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: context.clockSkewSeconds }),
  });
  const { claims, issuerKey } = verified;
  if (issuerKey.source === 'did') checkIssuerTrusted(issuerKey.issuer ?? '', context);
  const status = await checkStatus([{ credential: claims, issuer: issuerKey.issuer ?? '' }], context);
  return {
    outcome: 'VALID',
    checks: PRESENTATION_CHECKS.map((id): Check => (id === 'status' ? status : { id, status: 'pass' })),
    view: { format, json: claims, types: [], ...(typeof claims.vct === 'string' ? { vct: claims.vct } : {}) },
    claims,
    // The issuer the key is bound to, never a bare `iss` (which anyone can write).
    issuer: issuerKey.issuer ?? issuerKey.kid ?? issuerKey.source,
    proofType: typeof verified.header.alg === 'string' ? verified.header.alg : 'unknown',
    errors: [],
    warnings: verified.warnings,
  };
}

/**
 * The `status` check of verified credentials: every status entry is read from its list, which must be
 * the issuer's. A revoked or suspended credential, or a list that cannot be used, rejects (INVALID). A
 * credential without status, or with a mechanism this verifier does not implement, is `skipped` with the
 * reason: the report never says revocation was checked when it was not.
 */
async function checkStatus(
  credentials: { credential: Record<string, unknown>; issuer: string }[],
  context: PresentationVerifierContext,
): Promise<Check> {
  const checked: string[] = [];
  const unsupported: string[] = [];
  for (const { credential, issuer } of credentials) {
    for (const entry of statusEntriesOf(credential)) {
      if (entry.kind === 'unsupported') {
        unsupported.push(entry.type);
        continue;
      }
      checked.push(
        await checkStatusEntry(entry, {
          issuer,
          documentLoader: context.documentLoader,
          didResolver: context.didResolver ?? createDidResolver(),
          ...context.fetchLimits,
          ...(context.now ? { now: context.now } : {}),
        }),
      );
    }
  }
  if (unsupported.length > 0) {
    return {
      id: 'status',
      status: 'skipped',
      detail: `status type ${unsupported.join(', ')} is not supported, so the status was not checked`,
    };
  }
  if (checked.length === 0) {
    return {
      id: 'status',
      status: 'skipped',
      detail: 'the credential has no status entry, so revocation was not checked',
    };
  }
  return { id: 'status', status: 'pass', detail: checked.join('; ') };
}

/** Rejects an issuer DID that is not in the verifier's list, when the verifier keeps one. */
function checkIssuerTrusted(issuer: string, context: PresentationVerifierContext): void {
  if (context.trustedIssuers === undefined || context.trustedIssuers.includes(issuer)) return;
  throw new FormatError('ISSUER_UNTRUSTED', `issuer ${issuer || '(none)'} is not one this verifier trusts`, {
    spec: 'W3C VC Data Model 2.0, validation: the verifier decides which issuers it trusts',
    details: { issuer },
  });
}

async function verifyMdocPresentation(
  presentation: unknown,
  context: PresentationVerifierContext,
): Promise<PresentationVerification> {
  if (typeof presentation !== 'string') {
    throw new FormatError(
      'MDOC_MALFORMED',
      'an mso_mdoc presentation must be a base64url DeviceResponse string',
      {
        spec: 'OpenID4VP 1.0 Appendix B.2.6',
      },
    );
  }
  if (context.responseUri === undefined) {
    throw new FormatError('MDOC_MALFORMED', 'the verifier has no response_uri for the SessionTranscript');
  }
  let sessionTranscript: unknown[];
  if (context.profile === 'final-1.0') {
    sessionTranscript = mdocSessionTranscript({
      kind: 'openid4vp-1.0',
      clientId: context.clientId,
      responseUri: context.responseUri,
      nonce: context.nonce,
      // The response is not encrypted (direct_post), so there is no verifier key thumbprint.
      jwkThumbprint: null,
    });
  } else {
    if (!context.mdocGeneratedNonce) {
      throw new FormatError(
        'MDOC_MALFORMED',
        'mdoc_generated_nonce is missing; the SessionTranscript of ISO/IEC TS 18013-7 Annex B.4.4 needs it',
        { spec: 'ISO/IEC TS 18013-7 Annex B.4.4' },
      );
    }
    sessionTranscript = mdocSessionTranscript({
      kind: 'iso-18013-7-annex-b',
      clientId: context.clientId,
      responseUri: context.responseUri,
      nonce: context.nonce,
      mdocGeneratedNonce: context.mdocGeneratedNonce,
    });
  }
  const verified = await verifyMdocDeviceResponse(presentation, {
    sessionTranscript,
    // ISO 18013-5 section 9.3.1 step 1: the document signer chain must end at a trusted IACA.
    trustAnchors: context.x5cTrustAnchors ?? [],
    requireTrusted: true,
    ...(context.now ? { now: context.now } : {}),
    ...(context.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: context.clockSkewSeconds }),
  });
  const [document] = verified.documents;
  return {
    outcome: 'VALID',
    checks: PRESENTATION_CHECKS.map((id): Check =>
      id === 'status'
        ? { id, status: 'skipped', detail: 'the status of an mso_mdoc is not checked by this verifier' }
        : { id, status: 'pass' },
    ),
    view: { format: 'mso_mdoc', json: document!.claims, types: [], doctype: document!.docType },
    claims: document!.claims,
    issuer: document!.issuer,
    proofType: document!.alg,
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
