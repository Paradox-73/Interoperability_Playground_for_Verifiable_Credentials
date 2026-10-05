/**
 * Outbound capture point: the `fetch` every role uses for protocol calls. It sends the request, reads
 * the whole response, stores both (headers, body, status, timing) as a `RecordedExchange`, and hands
 * the caller an equivalent `Response` built from the bytes it read.
 *
 * Step tagging: an exchange gets the step the caller names, else the step the tagging rules recognise
 * from the wire (`step-tagging.ts`), else the run's current step.
 *
 * No duplicates: a call to one of the playground's own capture points (its reverse proxy or a hosted
 * reference role, see `selfCapture`) is recorded there, not here. This client then only adds the
 * attribution headers that tell the capture point which run, step and sender the call belongs to.
 */
import {
  RoleError,
  type BodyEncoding,
  type RecordedExchange,
  type RecordedRequestInit,
  type RecordingHttpClient,
  type StepId,
} from '@inji-playground/protocol';
import { ATTRIBUTION_HEADERS } from './capture-hub.js';
import { tagStep } from './step-tagging.js';

/** An exchange before the run assigns its id and sequence number. */
export type ExchangeDraft = Omit<RecordedExchange, 'id' | 'runId' | 'seq'>;

/** Where recorded exchanges go: the run assigns `id` and `seq`, stores the exchange and streams it. */
export interface ExchangeRecorder {
  record(draft: ExchangeDraft): RecordedExchange;
  /** Every exchange of the run so far, from all capture points, oldest first. */
  list(): readonly RecordedExchange[];
}

export interface RecordingFetchOptions {
  recorder: ExchangeRecorder;
  /** Sender shown on the sequence diagram when a request does not name one (usually the role id). */
  from: string;
  /** Step to tag an exchange with when the request does not name one. */
  currentStep?: () => StepId | undefined;
  /** Signal used when the request has none, so a timeout or cancel also stops calls that forgot it. */
  defaultSignal?: () => AbortSignal | undefined;
  /** The underlying fetch; the global one by default. */
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /**
   * True for URLs served by one of this server's own capture points (reverse proxy, hosted reference
   * roles). Such calls are recorded by that capture point, so this client does not record them too.
   */
  selfCapture?: (url: URL) => boolean;
  /** Run id sent in the attribution header on self-captured calls. */
  runId?: string;
  /** Diagram name of a request's receiver (for example `inji-certify` for Certify's host); else its host. */
  labelFor?: (url: URL) => string | undefined;
}

/** Status codes whose responses never have a body; `new Response(body)` rejects one for them. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

export class RecordingFetch implements RecordingHttpClient {
  readonly #options: RecordingFetchOptions;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;

  constructor(options: RecordingFetchOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => new Date());
  }

  exchanges(): readonly RecordedExchange[] {
    return this.#options.recorder.list();
  }

  async fetch(input: string | URL, init: RecordedRequestInit = {}): Promise<Response> {
    const { step, from, to, ...requestInit } = init;
    const signal = requestInit.signal ?? this.#options.defaultSignal?.() ?? null;
    const selfCaptured = this.#options.selfCapture?.(new URL(input)) === true;
    const sender = from ?? this.#options.from;
    const contextStep = this.#options.currentStep?.();
    const headers = new Headers(requestInit.headers);
    if (selfCaptured) {
      if (this.#options.runId) headers.set(ATTRIBUTION_HEADERS.run, this.#options.runId);
      const hint = step ?? contextStep;
      if (hint) headers.set(ATTRIBUTION_HEADERS.step, hint);
      headers.set(ATTRIBUTION_HEADERS.from, sender);
    }
    const request = new Request(input, { ...requestInit, headers, signal });
    const requestBody = request.body ? encodeBody(new Uint8Array(await request.clone().arrayBuffer())) : {};
    const url = new URL(request.url);

    const base = {
      capture: 'outbound' as const,
      from: sender,
      to: to ?? this.#options.labelFor?.(url) ?? url.host,
      request: {
        method: request.method,
        url: request.url,
        headers: headersToRecord(request.headers),
        ...requestBody,
      },
    };
    const requestContentType = request.headers.get('content-type');
    const stepOf = (responseContentType?: string | null): { step?: StepId } => {
      const chosen =
        step ??
        tagStep({
          method: request.method,
          url: request.url,
          ...(requestContentType ? { contentType: requestContentType } : {}),
          ...(requestBody.bodyEncoding === 'utf8' && requestBody.body !== undefined
            ? { body: requestBody.body }
            : {}),
          ...(responseContentType ? { responseContentType } : {}),
        }) ??
        contextStep;
      return chosen ? { step: chosen } : {};
    };
    const startedAt = this.#now();
    const started = performance.now();

    let response: Response;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      response = await this.#fetch(request);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      const exchange = this.#options.recorder.record({
        ...base,
        ...stepOf(),
        startedAt: startedAt.toISOString(),
        durationMs: performance.now() - started,
        error: describeError(error, signal),
      });
      // A timeout or cancel aborted the call: let the abort reason through, the orchestrator reports it.
      if (signal?.aborted) throw error;
      const code = networkErrorCode(error);
      throw new RoleError(
        `network.${code}`,
        `${request.method} ${request.url} failed: ${describeError(error)}`,
        {
          category: 'environment',
          exchangeId: exchange.id,
          cause: error,
        },
      );
    }

    // A self-captured call was stored by the proxy or inbound recorder; storing it here would duplicate it.
    if (!selfCaptured) {
      this.#options.recorder.record({
        ...base,
        ...stepOf(response.headers.get('content-type')),
        response: {
          status: response.status,
          headers: headersToRecord(response.headers),
          ...encodeBody(bytes),
        },
        startedAt: startedAt.toISOString(),
        durationMs: performance.now() - started,
      });
    }

    // The body has been consumed for recording; give the caller a fresh Response with the same bytes.
    const copy = new Response(NULL_BODY_STATUSES.has(response.status) ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperties(copy, {
      url: { value: response.url },
      redirected: { value: response.redirected },
    });
    return copy;
  }
}

/** Header names lower-case; repeated headers (for example `set-cookie`) joined with ", ". */
export function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, name) => {
    record[name] = record[name] === undefined ? value : `${record[name]}, ${value}`;
  });
  return record;
}

/** Text bodies are stored as they are; anything that is not valid UTF-8 is stored as base64. */
export function encodeBody(bytes: Uint8Array): { body?: string; bodyEncoding?: BodyEncoding } {
  if (bytes.byteLength === 0) return {};
  try {
    return { body: strictUtf8.decode(bytes), bodyEncoding: 'utf8' };
  } catch {
    return { body: Buffer.from(bytes).toString('base64'), bodyEncoding: 'base64' };
  }
}

function networkErrorCode(error: unknown): string {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  if (cause && typeof cause.code === 'string') return cause.code;
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code;
  return 'error';
}

function describeError(error: unknown, signal?: AbortSignal | null): string {
  if (signal?.aborted) {
    const reason: unknown = signal.reason;
    return `aborted: ${reason instanceof Error ? reason.message : String(reason)}`;
  }
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}
