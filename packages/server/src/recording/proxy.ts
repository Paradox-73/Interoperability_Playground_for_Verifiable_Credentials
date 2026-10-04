/**
 * Reverse-proxy capture point.
 *
 * - `ALL /proxy/:target/*` forwards to one Inji service (`certify`, `certify-ac`, `verify`, `mimoto`).
 *   When `PLAYGROUND_PUBLIC_URL` is set, the stack can advertise these URLs, so traffic from a phone
 *   or from Mimoto passes through the playground and is recorded.
 * - `ALL /v1/verify/*` forwards to verify-service under the same path. The Inji Verify SDK in the
 *   browser needs this: verify-service sends no CORS headers, and its `transaction_id` cookie has the
 *   path `/v1/verify`, so the SDK must reach it on the page's own origin.
 *
 * Bodies are read whole (protocol messages are small) and recorded byte for byte; the upstream call
 * may take up to `timeoutMs`, longer than the 55 s the SDK's status poll waits. The exchange goes to
 * the run that the attribution headers name, else to the run that claimed the target.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ATTRIBUTION_HEADERS, isAttributionHeader, type CaptureHub } from './capture-hub.js';
import { encodeBody, headersToRecord } from './http-client.js';
import { recordableHeaders } from './inbound.js';
import { tagStep } from './step-tagging.js';
import { StepIdSchema } from '@inji-playground/protocol';

export interface ProxyTarget {
  /** Upstream base URL, for example `http://localhost:28080`. */
  url: string;
  /** Name drawn on the sequence diagram, for example `inji-verify`. */
  label: string;
}

export interface ProxyOptions {
  hub: CaptureHub;
  /** Targets by the name used in `/proxy/:target/*` and in run claims. */
  targets: Readonly<Record<string, ProxyTarget>>;
  /** Target `/v1/verify/*` goes to (its `url` is verify-service's origin). Default `verify`. */
  verifyTarget?: string;
  /** Network fetch (with the network map). */
  fetch: typeof globalThis.fetch;
  /** Upstream timeout. Default 110 s, above the SDK's 55 s long poll and under the server's 120 s. */
  timeoutMs?: number;
}

/** Hop-by-hop headers (RFC 9110 section 7.6.1) and those the forwarder sets itself. */
const DROP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'content-length',
  'expect',
]);
/** `fetch` already decoded the body, so its encoding and length no longer describe what is sent. */
const DROP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'trailer',
  'upgrade',
]);

export async function registerProxyRoutes(app: FastifyInstance, options: ProxyOptions): Promise<void> {
  const verifyTarget = options.verifyTarget ?? 'verify';
  await app.register((scope, _options, done) => {
    // Bodies stay raw bytes in this scope: the proxy forwards them unchanged, whatever their type.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

    scope.all('/proxy/:target/*', async (request, reply) => {
      const { target, '*': rest } = request.params as { target: string; '*': string };
      const upstream = options.targets[target];
      if (!upstream) {
        return reply.code(404).send({
          error: 'unknown-proxy-target',
          message: `no proxy target "${target}"; known: ${Object.keys(options.targets).join(', ')}`,
        });
      }
      return forward(request, reply, options, target, upstream, joinUrl(upstream.url, rest, request.url));
    });

    scope.all('/v1/verify/*', async (request, reply) => {
      const upstream = options.targets[verifyTarget];
      if (!upstream) {
        return reply
          .code(503)
          .send({ error: 'verify-not-configured', message: 'no Inji Verify URL configured' });
      }
      const origin = new URL(upstream.url).origin;
      return forward(request, reply, options, verifyTarget, upstream, `${origin}${request.url}`);
    });
    done();
  });
}

/** `base` + the wildcard part of the path + the original query string. */
function joinUrl(base: string, rest: string, originalUrl: string): string {
  const query = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : '';
  return `${base.replace(/\/+$/, '')}/${rest}${query}`;
}

async function forward(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ProxyOptions,
  targetName: string,
  target: ProxyTarget,
  upstreamUrl: string,
): Promise<FastifyReply> {
  const startedAt = new Date();
  const started = performance.now();
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || DROP_REQUEST_HEADERS.has(name) || isAttributionHeader(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('x-forwarded-host', request.host);
  headers.set('x-forwarded-proto', request.protocol);
  const body = Buffer.isBuffer(request.body) && request.body.length > 0 ? request.body : undefined;

  const runId = options.hub.resolveRun(targetName, headerValue(request, ATTRIBUTION_HEADERS.run));
  const requestRecord = {
    method: request.method,
    url: upstreamUrl,
    headers: recordableHeaders(Object.fromEntries(headers)),
    ...(body ? encodeBody(body) : {}),
  };
  const draftBase = {
    capture: 'proxy' as const,
    from:
      headerValue(request, ATTRIBUTION_HEADERS.from) ??
      (runId ? options.hub.configOf(runId)?.wallet : undefined) ??
      'browser',
    to: target.label,
    request: requestRecord,
    startedAt: startedAt.toISOString(),
  };
  const explicitStep = StepIdSchema.safeParse(headerValue(request, ATTRIBUTION_HEADERS.step));

  let response: Response;
  let bytes: Uint8Array;
  try {
    response = await options.fetch(upstreamUrl, {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 110_000),
      ...(body && request.method !== 'GET' && request.method !== 'HEAD' ? { body } : {}),
    });
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    const message = error instanceof Error ? `${error.message}${causeOf(error)}` : String(error);
    if (runId) {
      const step = stepFor(requestRecord) ?? (explicitStep.success ? explicitStep.data : undefined);
      options.hub.record(runId, {
        ...draftBase,
        ...(step ? { step } : {}),
        durationMs: performance.now() - started,
        error: message,
      });
    } else {
      options.hub.unattributed += 1;
    }
    return reply.code(502).send({ error: 'bad-gateway', message: `${targetName}: ${message}` });
  }

  const responseHeaders = headersToRecord(response.headers);
  if (runId) {
    // What the wire shows wins over the sender's current step, as in the inbound recorder.
    const step =
      stepFor(requestRecord, responseHeaders['content-type']) ??
      (explicitStep.success ? explicitStep.data : undefined);
    options.hub.record(runId, {
      ...draftBase,
      ...(step ? { step } : {}),
      response: { status: response.status, headers: responseHeaders, ...encodeBody(bytes) },
      durationMs: performance.now() - started,
    });
  } else {
    options.hub.unattributed += 1;
  }

  reply.code(response.status);
  response.headers.forEach((value, name) => {
    if (DROP_RESPONSE_HEADERS.has(name) || name === 'set-cookie') return;
    reply.header(name, value);
  });
  // Several cookies must stay several headers; `forEach` would join them into one.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  return reply.send(Buffer.from(bytes));
}

function stepFor(
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    bodyEncoding?: string;
  },
  responseContentType?: string,
) {
  return tagStep({
    method: request.method,
    url: request.url,
    ...(request.headers['content-type'] ? { contentType: request.headers['content-type'] } : {}),
    ...(request.bodyEncoding === 'utf8' && request.body !== undefined ? { body: request.body } : {}),
    ...(responseContentType ? { responseContentType } : {}),
  });
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function causeOf(error: Error): string {
  return error.cause instanceof Error ? `: ${error.cause.message}` : '';
}
