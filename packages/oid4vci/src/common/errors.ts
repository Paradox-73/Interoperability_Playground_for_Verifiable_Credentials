/**
 * Errors of both sides.
 *
 * - `OAuthError` is what the issuer and the authorization server send back: an RFC 6749 section 5.2
 *   style body `{error, error_description}` plus the extra members OpenID4VCI defines (a fresh
 *   `c_nonce` with `invalid_proof` in draft 13 section 7.3.1.2).
 * - `Oid4vciClientError` is what the wallet client throws. It names the protocol step that failed, so
 *   the run report can point at the exchange, and keeps the server's OAuth error when there was one.
 */
import type { StepId } from '@inji-playground/protocol';

/** Error codes the reference issuer and the test authorization server send. */
export type OAuthErrorCode =
  // RFC 6749 section 5.2 (token endpoint) and section 4.1.2.1 (authorization endpoint)
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error'
  // RFC 6750 section 3.1 (protected resources)
  | 'invalid_token'
  // OpenID4VCI credential endpoint (d13 section 7.3.1.2, 1.0 section 8.3.1.2)
  | 'invalid_credential_request'
  | 'unsupported_credential_type'
  | 'unsupported_credential_format'
  | 'unknown_credential_configuration'
  | 'invalid_proof'
  | 'invalid_nonce'
  | 'credential_request_denied';

export class OAuthError extends Error {
  readonly error: OAuthErrorCode;
  readonly status: number;
  /** Extra members of the error body, for example `c_nonce` and `c_nonce_expires_in`. */
  readonly extra: Record<string, unknown>;

  constructor(error: OAuthErrorCode, description: string, status = 400, extra: Record<string, unknown> = {}) {
    super(description);
    this.name = 'OAuthError';
    this.error = error;
    this.status = status;
    this.extra = extra;
  }

  toBody(): Record<string, unknown> {
    return { error: this.error, error_description: this.message, ...this.extra };
  }
}

export type ClientErrorCode =
  | 'OFFER_INVALID'
  | 'OFFER_FETCH_FAILED'
  | 'ISSUER_MISMATCH'
  | 'METADATA_FETCH_FAILED'
  | 'METADATA_INVALID'
  | 'CONFIGURATION_UNKNOWN'
  | 'AS_METADATA_INVALID'
  | 'AS_ISSUER_MISMATCH'
  | 'GRANT_UNSUPPORTED'
  | 'TX_CODE_REQUIRED'
  | 'AUTHORIZATION_FAILED'
  | 'TOKEN_FAILED'
  | 'NONCE_FAILED'
  | 'CREDENTIAL_FAILED'
  | 'DEFERRED_UNSUPPORTED';

export interface ClientErrorOptions {
  step: StepId;
  status?: number;
  /** The `error` member of the server's OAuth error body, when it sent one. */
  oauthError?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class Oid4vciClientError extends Error {
  readonly code: ClientErrorCode;
  readonly step: StepId;
  readonly status: number | undefined;
  readonly oauthError: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ClientErrorCode, message: string, options: ClientErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'Oid4vciClientError';
    this.code = code;
    this.step = options.step;
    this.status = options.status;
    this.oauthError = options.oauthError;
    this.details = options.details;
  }

  /** Plain object for a run report (an `Error` does not survive JSON.stringify). */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      step: this.step,
      message: this.message,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.oauthError === undefined ? {} : { oauthError: this.oauthError }),
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}
