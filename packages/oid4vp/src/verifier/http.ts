/**
 * HTTP endpoints of the reference verifier, in two forms:
 * - `verifierFetchHandler()`: a Fetch API handler (`Request` in, `Response` out). Tests and in-process
 *   runs use it directly as the wallet's `fetch`, so no port is opened.
 * - `registerVerifierRoutes()`: the same routes on a Fastify instance (the playground server mounts the
 *   verifier at `/ref/verifier`). The instance is typed structurally, so this package needs no
 *   Fastify dependency; the host registers a form-body parser (`@fastify/formbody`).
 *
 * Routes, relative to the path of `baseUrl`:
 * - `GET /requests/:handle`: the signed request object, `application/oauth-authz-req+jwt`.
 * - `POST /response`: `direct_post` response, `application/x-www-form-urlencoded`.
 */
import { Oid4vpError } from '../common/errors.js';
import { formFields, type ReferenceVerifier } from './verifier.js';

interface RouteReply {
  code(status: number): RouteReply;
  header(name: string, value: string): RouteReply;
  send(body: unknown): unknown;
}

interface RouteRequest {
  params: unknown;
  body: unknown;
}

/** The part of a Fastify instance this module calls. */
export interface RouteHost {
  get(path: string, handler: (request: RouteRequest, reply: RouteReply) => Promise<unknown>): unknown;
  post(path: string, handler: (request: RouteRequest, reply: RouteReply) => Promise<unknown>): unknown;
}

/** Registers the verifier routes under `prefix` (default: the path of the verifier's `baseUrl`). */
export function registerVerifierRoutes(
  app: RouteHost,
  verifier: ReferenceVerifier,
  prefix = new URL(verifier.baseUrl).pathname,
): void {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  app.get(`${base}/requests/:handle`, (request, reply) => {
    const handle = (request.params as { handle?: string }).handle ?? '';
    try {
      const { body, contentType } = verifier.requestObject(handle);
      return Promise.resolve(reply.code(200).header('content-type', contentType).send(body));
    } catch (error) {
      return Promise.resolve(sendError(reply, error));
    }
  });
  app.post(`${base}/response`, async (request, reply) => {
    const result = await verifier.handleResponse(formFields(request.body));
    return reply.code(result.status).header('cache-control', 'no-store').send(result.body);
  });
}

function sendError(reply: RouteReply, error: unknown): unknown {
  const failure =
    error instanceof Oid4vpError ? error : new Oid4vpError('HTTP_ERROR', String(error), { status: 500 });
  return reply.code(failure.status).send({ error: failure.oauthError, error_description: failure.message });
}

/**
 * A Fetch API handler for the verifier's routes. Requests outside the verifier's origin and path are
 * answered 404, so a test cannot reach anything else by mistake.
 */
export function verifierFetchHandler(verifier: ReferenceVerifier): (request: Request) => Promise<Response> {
  const base = new URL(verifier.baseUrl);
  const basePath = base.pathname.endsWith('/') ? base.pathname.slice(0, -1) : base.pathname;
  return async (request) => {
    const url = new URL(request.url);
    const path =
      url.origin === base.origin && url.pathname.startsWith(basePath)
        ? url.pathname.slice(basePath.length)
        : undefined;
    const requestMatch = path === undefined ? null : /^\/requests\/([^/]+)$/.exec(path);
    if (request.method === 'GET' && requestMatch) {
      try {
        const { body, contentType } = verifier.requestObject(decodeURIComponent(requestMatch[1] ?? ''));
        return new Response(body, { status: 200, headers: { 'content-type': contentType } });
      } catch (error) {
        const failure =
          error instanceof Oid4vpError
            ? error
            : new Oid4vpError('HTTP_ERROR', String(error), { status: 500 });
        return Response.json(
          { error: failure.oauthError, error_description: failure.message },
          { status: failure.status },
        );
      }
    }
    if (request.method === 'POST' && path === '/response') {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.startsWith('application/x-www-form-urlencoded')) {
        return Response.json(
          {
            error: 'invalid_request',
            error_description: 'direct_post responses are application/x-www-form-urlencoded',
          },
          { status: 415 },
        );
      }
      const result = await verifier.handleResponse(new URLSearchParams(await request.text()));
      return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
}
