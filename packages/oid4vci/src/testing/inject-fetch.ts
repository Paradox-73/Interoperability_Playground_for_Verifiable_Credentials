// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * A `fetch` that answers from a Fastify instance through `app.inject()`, without opening a port.
 * Tests use it to run the wallet client against the reference issuer and the test authorization
 * server in one process; the server package can use it the same way for in-process reference runs.
 *
 * Like `fetch` with `redirect: 'manual'`, it never follows redirects: a 302 comes back as it is.
 * Requests to another origin than `origin` fail, so a test cannot reach the network by mistake.
 */
import type { FastifyInstance } from 'fastify';
import type { FetchFn } from '../client/wallet-client.js';

export interface InjectExchange {
  method: string;
  url: string;
  status: number;
  requestBody?: string;
  responseBody: string;
}

export function injectFetch(app: FastifyInstance, origin: string, exchanges?: InjectExchange[]): FetchFn {
  const allowed = new URL(origin).origin;
  return async (input, init = {}) => {
    const url = new URL(input);
    if (url.origin !== allowed) throw new TypeError(`injectFetch: ${url.origin} is not ${allowed}`);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const body = typeof init.body === 'string' ? init.body : undefined;
    const method = (init.method ?? 'GET').toUpperCase() as 'GET' | 'POST';
    const response = await app.inject({
      method,
      url: `${url.pathname}${url.search}`,
      headers: { ...headers, host: url.host },
      ...(body === undefined ? {} : { payload: body }),
    });
    exchanges?.push({
      method,
      url: url.toString(),
      status: response.statusCode,
      ...(body === undefined ? {} : { requestBody: body }),
      responseBody: response.body,
    });
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [String(value)]) responseHeaders.append(key, item);
    }
    const hasBody = response.statusCode !== 204 && response.statusCode !== 304;
    return new Response(hasBody ? response.body : null, {
      status: response.statusCode,
      headers: responseHeaders,
    });
  };
}
