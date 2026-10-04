/**
 * Inbound capture point: records requests that reach the hosted reference roles (`/ref/issuer`,
 * `/ref/verifier`, `/ref/as`, and their RFC 8615 well-known URLs at the host root) together with the
 * answers they get. Outside wallets (a phone, Mimoto) and the playground's own roles both arrive
 * here, so this is where those exchanges are recorded, exactly once.
 *
 * Mechanism: Fastify hooks on the root instance. `onRequest` notes the start time, `preParsing`
 * keeps a copy of the raw body before any parser sees it, `onSend` records the request with the
 * serialised response. Install it before the reference roles' plugins are registered.
 */
import { Readable } from 'node:stream';
import { StepIdSchema, type StepId } from '@inji-playground/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ATTRIBUTION_HEADERS, isAttributionHeader, type CaptureHub } from './capture-hub.js';
import { encodeBody } from './http-client.js';
import { tagStep } from './step-tagging.js';

/** Hosted reference roles: path segment under `/ref/` -> capture target (also the diagram name). */
export const INBOUND_TARGETS = {
  issuer: 'ref-issuer',
  verifier: 'ref-verifier',
  as: 'ref-as',
} as const;

const INBOUND_PATH = /^(?:\/\.well-known\/[^/]+)?\/ref\/(issuer|verifier|as)(?:[/?#]|$)/;

/** The capture target of a request path, or `undefined` for paths outside the hosted roles. */
export function inboundTargetOf(path: string): string | undefined {
  const match = INBOUND_PATH.exec(path);
  return match ? INBOUND_TARGETS[match[1] as keyof typeof INBOUND_TARGETS] : undefined;
}

interface PendingInbound {
  target: string;
  startedAt: Date;
  started: number;
  body?: Buffer;
}

/** A readable stream with the length Fastify's body reader checks against `content-length`. */
type CountedStream = Readable & { receivedEncodedLength?: number };

export function installInboundRecorder(app: FastifyInstance, hub: CaptureHub): void {
  const pending = new WeakMap<FastifyRequest, PendingInbound>();

  app.addHook('onRequest', async (request) => {
    const target = inboundTargetOf(request.url);
    if (target) pending.set(request, { target, startedAt: new Date(), started: performance.now() });
  });

  app.addHook('preParsing', async (request, _reply, payload) => {
    const state = pending.get(request);
    if (!state) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    state.body = Buffer.concat(chunks);
    const copy: CountedStream = Readable.from([state.body]);
    copy.receivedEncodedLength = state.body.length;
    return copy;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const state = pending.get(request);
    if (!state) return payload;
    pending.delete(request);
    recordInbound(hub, request, reply, state, payload);
    return payload;
  });
}

function recordInbound(
  hub: CaptureHub,
  request: FastifyRequest,
  reply: FastifyReply,
  state: PendingInbound,
  payload: unknown,
): void {
  const runId = hub.resolveRun(state.target, headerValue(request, ATTRIBUTION_HEADERS.run));
  if (!runId) {
    hub.unattributed += 1;
    return;
  }
  const url = `${request.protocol}://${request.host}${request.url}`;
  const requestBody = state.body && state.body.length > 0 ? encodeBody(state.body) : {};
  const requestHeaders = recordableHeaders(request.headers);
  const responseHeaders = recordableHeaders(reply.getHeaders());
  const responseBody = payloadBytes(payload);
  // What the wire shows wins over the sender's current step (the wallet may still be in the step
  // before, for example fetching an offer while the timeline already shows the metadata step).
  const step =
    tagStep({
      method: request.method,
      url,
      ...(requestHeaders['content-type'] ? { contentType: requestHeaders['content-type'] } : {}),
      ...(requestBody.bodyEncoding === 'utf8' && requestBody.body !== undefined ? { body: requestBody.body } : {}),
      ...(responseHeaders['content-type'] ? { responseContentType: responseHeaders['content-type'] } : {}),
    }) ?? parseStep(headerValue(request, ATTRIBUTION_HEADERS.step));
  hub.record(runId, {
    capture: 'inbound',
    ...(step ? { step } : {}),
    from: headerValue(request, ATTRIBUTION_HEADERS.from) ?? hub.configOf(runId)?.wallet ?? 'outside-client',
    to: state.target,
    request: { method: request.method, url, headers: requestHeaders, ...requestBody },
    response: {
      status: reply.statusCode,
      headers: responseHeaders,
      ...(responseBody ? encodeBody(responseBody) : {}),
    },
    startedAt: state.startedAt.toISOString(),
    durationMs: performance.now() - state.started,
  });
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function parseStep(value: string | undefined): StepId | undefined {
  const parsed = StepIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Lower-case names, repeated values joined with ", ", attribution headers left out. */
export function recordableHeaders(
  headers: Record<string, string | number | readonly string[] | string[] | undefined>,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || isAttributionHeader(name)) continue;
    record[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return record;
}

/** The bytes Fastify is about to send; streamed payloads (files) are not recorded. */
function payloadBytes(payload: unknown): Uint8Array | undefined {
  if (payload === null || payload === undefined) return undefined;
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8');
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return payload;
  return undefined;
}
