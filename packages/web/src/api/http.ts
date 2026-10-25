// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Minimal JSON client for the playground server. The UI always talks to its own origin: in development
 * Vite forwards `/api` to the server (vite.config.ts), in production the server serves the UI.
 *
 * Every response body goes through a parser (usually a zod schema from @inji-playground/protocol), so
 * a server that drifts from the contract fails loudly here instead of rendering half-broken data.
 */

/** A request that reached the server and got a non-2xx answer, or whose answer broke the contract. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the body did not match the expected shape. */
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Parser<T> = (json: unknown) => T;

/**
 * Absolute URL of a server path on the page's own origin. Relative URLs would work in a browser, but
 * not under Node's fetch (tests), which has no page to resolve them against.
 */
export function apiUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

/** Pulls a readable message out of an error body (Fastify answers `{ statusCode, error, message }`). */
function errorMessage(status: number, statusText: string, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function send<T>(path: string, init: RequestInit, parse: Parser<T>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { accept: 'application/json', ...init.headers },
  });
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(errorMessage(res.status, res.statusText, body), res.status, body);
  try {
    return parse(body);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError(`unexpected response from ${path}: ${detail}`, 0, body);
  }
}

export function getJson<T>(path: string, parse: Parser<T>, signal?: AbortSignal): Promise<T> {
  return send(path, { method: 'GET', signal }, parse);
}

export function postJson<T>(
  path: string,
  payload: unknown,
  parse: Parser<T>,
  signal?: AbortSignal,
): Promise<T> {
  return send(
    path,
    {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    parse,
  );
}

/** Short, user-facing text for any error thrown by a query or mutation. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
