/**
 * Reasons a run stops, used as `AbortSignal` reasons so every pending call of the run sees why.
 */

/** A step took longer than its timeout. */
export class StepTimeoutError extends Error {
  override readonly name = 'StepTimeoutError';
  constructor(
    readonly step: string,
    readonly timeoutMs: number,
  ) {
    super(`step ${step} did not finish within ${timeoutMs} ms`);
  }
}

/** Someone cancelled the run (`POST /api/runs/{id}/cancel`) or the server is shutting down. */
export class RunCancelledError extends Error {
  override readonly name = 'RunCancelledError';
  constructor(readonly reason: string = 'cancelled by request') {
    super(`run cancelled: ${reason}`);
  }
}

/** A run request the API must refuse: unknown role or scenario, unknown run to replay, wrong state. */
export class RunRequestError extends Error {
  override readonly name = 'RunRequestError';
  constructor(
    readonly code: string,
    message: string,
    /** HTTP status the API answers with. */
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}
