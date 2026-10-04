/**
 * Every failure of the OpenID4VP layer is an `Oid4vpError` with a stable `code`, mirroring
 * `FormatError` in `@inji-playground/formats`: run reports and the matrix group failures by code, and
 * `oauthError` gives the error value an HTTP response carries (OpenID4VP 1.0 section 8.5, RFC 6749
 * section 5.2).
 */

export const OID4VP_ERROR_CODES = [
  'REQUEST_URI_INVALID',
  'REQUEST_INVALID',
  'REQUEST_OBJECT_INVALID',
  'REQUEST_SIGNATURE_INVALID',
  'CLIENT_ID_UNSUPPORTED',
  'CLIENT_ID_MISMATCH',
  'REQUEST_NOT_FOUND',
  'REQUEST_EXPIRED',
  'NO_MATCHING_CREDENTIAL',
  'HOLDER_KEY_MISMATCH',
  'RESPONSE_INVALID',
  'SUBMISSION_INVALID',
  'STATE_UNKNOWN',
  'STATE_REPLAYED',
  'VERIFIER_REJECTED',
  'HTTP_ERROR',
  'TIMEOUT',
] as const;

export type Oid4vpErrorCode = (typeof OID4VP_ERROR_CODES)[number];

/** OAuth error value sent on the wire for each code. */
const OAUTH_ERRORS: Record<Oid4vpErrorCode, string> = {
  REQUEST_URI_INVALID: 'invalid_request',
  REQUEST_INVALID: 'invalid_request',
  REQUEST_OBJECT_INVALID: 'invalid_request_object',
  REQUEST_SIGNATURE_INVALID: 'invalid_request_object',
  CLIENT_ID_UNSUPPORTED: 'invalid_client',
  CLIENT_ID_MISMATCH: 'invalid_client',
  REQUEST_NOT_FOUND: 'invalid_request_uri',
  REQUEST_EXPIRED: 'invalid_request',
  NO_MATCHING_CREDENTIAL: 'access_denied',
  HOLDER_KEY_MISMATCH: 'access_denied',
  RESPONSE_INVALID: 'invalid_request',
  SUBMISSION_INVALID: 'invalid_request',
  STATE_UNKNOWN: 'invalid_request',
  STATE_REPLAYED: 'invalid_request',
  VERIFIER_REJECTED: 'invalid_request',
  HTTP_ERROR: 'server_error',
  TIMEOUT: 'server_error',
};

export interface Oid4vpErrorOptions {
  /** Specification rule that was violated, for example `OpenID4VP 1.0 section 5.10`. */
  spec?: string;
  /** Expected and received values for the protocol inspector. */
  details?: Record<string, unknown>;
  /** HTTP status a server answers with. Default 400. */
  status?: number;
  cause?: unknown;
}

export class Oid4vpError extends Error {
  readonly code: Oid4vpErrorCode;
  readonly spec: string | undefined;
  readonly details: Record<string, unknown> | undefined;
  readonly status: number;

  constructor(code: Oid4vpErrorCode, message: string, options: Oid4vpErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'Oid4vpError';
    this.code = code;
    this.spec = options.spec;
    this.details = options.details;
    this.status = options.status ?? 400;
  }

  /** The OAuth `error` value for an HTTP response. */
  get oauthError(): string {
    return OAUTH_ERRORS[this.code];
  }

  /** Plain object for a run report (an `Error` does not survive JSON.stringify). */
  toJSON(): { code: Oid4vpErrorCode; message: string; spec?: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.spec === undefined ? {} : { spec: this.spec }),
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function isOid4vpError(value: unknown): value is Oid4vpError {
  return value instanceof Oid4vpError;
}
