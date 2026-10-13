/**
 * Every failure this package reports is a `FormatError` with a stable `code`, so the orchestrator can
 * put the code into a run report and the matrix can group failures without parsing messages. `spec`
 * names the rule that was broken, in the same words the tests use.
 */

export const FORMAT_ERROR_CODES = [
  // Keys
  'KEY_UNSUPPORTED',
  'KEY_INVALID',
  'KEY_NOT_FOUND',
  // DIDs
  'DID_INVALID',
  'DID_METHOD_UNSUPPORTED',
  'DID_WEB_INSECURE',
  'DID_WEB_FETCH_FAILED',
  'DID_DOCUMENT_INVALID',
  'VERIFICATION_METHOD_NOT_FOUND',
  // JSON-LD
  'CONTEXT_NOT_PINNED',
  'CONTEXT_FETCH_FAILED',
  // W3C VC Data Integrity (ldp_vc / ldp_vp)
  'LDP_MALFORMED',
  'LDP_PROOF_INVALID',
  'LDP_EXPIRED',
  'LDP_NOT_YET_VALID',
  'LDP_CHALLENGE_MISMATCH',
  'LDP_DOMAIN_MISMATCH',
  'LDP_HOLDER_MISMATCH',
  // SD-JWT VC
  'SDJWT_MALFORMED',
  'SDJWT_TYP_UNEXPECTED',
  'SDJWT_ALG_REJECTED',
  'SDJWT_ISSUER_KEY_UNRESOLVED',
  'SDJWT_ISSUER_MISMATCH',
  'SDJWT_SIGNATURE_INVALID',
  'SDJWT_DISCLOSURE_INVALID',
  'SDJWT_CLAIM_MISSING',
  'SDJWT_VCT_MISMATCH',
  'SDJWT_EXPIRED',
  'SDJWT_NOT_YET_VALID',
  'X5C_INVALID',
  'X5C_UNTRUSTED',
  // Issuer trust (a verifier's list of the issuers it accepts)
  'ISSUER_UNTRUSTED',
  // Key binding (SD-JWT+KB)
  'KB_JWT_MISSING',
  'KB_JWT_MALFORMED',
  'KB_JWT_HOLDER_KEY_UNRESOLVED',
  'KB_JWT_SIGNATURE_INVALID',
  'KB_JWT_NONCE_MISMATCH',
  'KB_JWT_AUDIENCE_MISMATCH',
  'KB_JWT_SD_HASH_MISMATCH',
  'KB_JWT_IAT_OUT_OF_WINDOW',
  // mso_mdoc (ISO/IEC 18013-5)
  'MDOC_MALFORMED',
  'MDOC_ALG_REJECTED',
  'MDOC_DOCTYPE_MISMATCH',
  'MDOC_ISSUER_SIGNATURE_INVALID',
  'MDOC_DIGEST_MISMATCH',
  'MDOC_EXPIRED',
  'MDOC_NOT_YET_VALID',
  'MDOC_DEVICE_SIGNATURE_INVALID',
  'MDOC_ELEMENT_MISSING',
] as const;

export type FormatErrorCode = (typeof FORMAT_ERROR_CODES)[number];

export interface FormatErrorOptions {
  /** Specification rule that was violated, for example `RFC 9901 section 7.3 step 5f`. */
  spec?: string;
  /** Extra machine-readable facts for the protocol inspector (expected vs. received values). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class FormatError extends Error {
  readonly code: FormatErrorCode;
  readonly spec: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: FormatErrorCode, message: string, options: FormatErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'FormatError';
    this.code = code;
    this.spec = options.spec;
    this.details = options.details;
  }

  /** Plain object for a run report or a WebSocket event (an `Error` does not survive JSON.stringify). */
  toJSON(): { code: FormatErrorCode; message: string; spec?: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.spec === undefined ? {} : { spec: this.spec }),
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function isFormatError(value: unknown): value is FormatError {
  return value instanceof FormatError;
}

/** Message of any thrown value, for wrapping library errors. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
