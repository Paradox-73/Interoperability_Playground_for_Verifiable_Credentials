/**
 * The error type role implementations throw when a protocol step fails. The orchestrator turns it into
 * the `error` of the run report, so the code and message a role chooses are what a reader of the matrix
 * sees.
 */

/**
 * - `interop`: the other side answered, but not in a way this role accepts (a 400 from the token
 *   endpoint, a credential that does not parse, a signature that does not verify). The run reaches the
 *   outcome `ERROR`, and the verdict compares it with the scenario's expectation (usually `fail`).
 * - `environment`: nothing about interoperability was learned (a container is down, a connection was
 *   refused, nobody scanned the QR code). The run's outcome is `NOT_RUN` and its verdict `error`.
 */
export type RoleErrorCategory = 'interop' | 'environment';

export interface RoleErrorOptions {
  category?: RoleErrorCategory;
  /** Id of the recorded exchange that shows the failure, so the report can link to it. */
  exchangeId?: string;
  cause?: unknown;
}

export class RoleError extends Error {
  override readonly name = 'RoleError';
  /** Stable, machine-readable code, for example `http.400`, `credential.unparseable`, `network.ECONNREFUSED`. */
  readonly code: string;
  readonly category: RoleErrorCategory;
  readonly exchangeId: string | undefined;

  constructor(code: string, message: string, options: RoleErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.category = options.category ?? 'interop';
    this.exchangeId = options.exchangeId;
  }
}

/** True for a `RoleError`, also when it comes from another copy of this package. */
export function isRoleError(error: unknown): error is RoleError {
  return (
    error instanceof RoleError ||
    (error instanceof Error &&
      error.name === 'RoleError' &&
      typeof (error as Partial<RoleError>).code === 'string')
  );
}
