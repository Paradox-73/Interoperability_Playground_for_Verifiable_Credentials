// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchLimited, pinnedFetch, type FetchLike } from '../src/index.js';

const codes = { insecure: 'DID_WEB_INSECURE', failed: 'DID_WEB_FETCH_FAILED' } as const;

describe('limited fetch: DNS rebinding', () => {
  let server: Server;
  let port: number;
  const hosts: string[] = [];
  beforeAll(async () => {
    server = createServer((request, response) => {
      hosts.push(request.headers.host ?? '');
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('connects to the pinned address and keeps the host name in the Host header', async () => {
    // `.invalid` never resolves (RFC 6761), so only the pinned address can answer.
    const response = await pinnedFetch(`http://rebind.invalid:${port}/doc`, { pinnedAddress: '127.0.0.1' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}');
    expect(hosts.at(-1)).toBe(`rebind.invalid:${port}`);
  });

  it('hands the checked address to the client, so a second lookup cannot change it', async () => {
    const inits: Parameters<FetchLike>[1][] = [];
    const lookups: string[][] = [['93.184.216.34'], ['127.0.0.1']];
    const body = await fetchLimited(
      { url: 'https://rebind.example/doc', accept: 'application/json', codes },
      {
        lookup: () => Promise.resolve(lookups.shift()!),
        fetch: (_url, init) => {
          inits.push(init);
          return Promise.resolve(new Response('{}'));
        },
      },
    );
    expect(body).toBe('{}');
    expect(inits[0]?.pinnedAddress).toBe('93.184.216.34');
    expect(lookups).toHaveLength(1);
  });

  it('pins nothing for an allowed host (the stack names, the server itself)', async () => {
    const inits: Parameters<FetchLike>[1][] = [];
    await fetchLimited(
      { url: 'https://certify.ps02.test/doc', accept: 'application/json', codes },
      {
        fetch: (_url, init) => {
          inits.push(init);
          return Promise.resolve(new Response('{}'));
        },
      },
    );
    expect(inits[0]).not.toHaveProperty('pinnedAddress');
  });
});

describe('limited fetch: URL schemes', () => {
  it.each([
    'file:///etc/passwd',
    'data:application/json,{}',
    'ftp://93.184.216.34/doc',
    'ws://certify.ps02.test/doc',
  ])('refuses %s before any lookup or request', async (url) => {
    const calls: string[] = [];
    const error = await fetchLimited(
      { url, accept: 'application/json', codes },
      {
        lookup: (host) => {
          calls.push(`lookup ${host}`);
          return Promise.resolve(['93.184.216.34']);
        },
        fetch: (target) => {
          calls.push(`fetch ${target}`);
          return Promise.resolve(new Response('{}'));
        },
      },
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'DID_WEB_INSECURE' });
    expect(String((error as Error).message)).toContain('not an http or https URL');
    expect(calls).toEqual([]);
  });
});
