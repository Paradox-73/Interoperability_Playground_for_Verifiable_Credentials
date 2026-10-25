// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Test helpers: a fake HTTP client that serves DID documents for did:web through the host override
 * map, so no test opens a socket.
 */
import type { FetchLike } from '../src/index.js';

export interface FakeWeb {
  fetch: FetchLike;
  serve(url: string, body: unknown, status?: number): void;
  requests: string[];
}

export function fakeWeb(): FakeWeb {
  const routes = new Map<string, { status: number; body: string }>();
  const requests: string[] = [];
  return {
    requests,
    serve(url, body, status = 200) {
      routes.set(url, { status, body: typeof body === 'string' ? body : JSON.stringify(body) });
    },
    fetch(url) {
      requests.push(url);
      const route = routes.get(url) ?? { status: 404, body: 'not found' };
      return Promise.resolve({
        ok: route.status < 400,
        status: route.status,
        text: () => Promise.resolve(route.body),
      });
    },
  };
}
