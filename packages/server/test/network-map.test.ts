// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The connection-level network map of host mode: URLs the stack advertises inside its compose network
 * (`http://certify-nginx`, `http://verify-service:8080`) reach a port on the host while the request keeps
 * its URL. The real map file is `deploy/inji-stack/network-map.host.json`.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_FETCH_ALLOWED_HOSTS, fetchLimited } from '@inji-playground/formats';
import { describe, expect, it } from 'vitest';
import { extraCaPath, loadConfig, networkMapPath } from '../src/config/index.js';
import { NetworkMap, networkFetch } from '../src/recording/network-map.js';
import { stackContextHosts, stackFetchHosts } from '../src/recording/targets.js';
import { listenInTestRange } from './helpers.js';

describe('NetworkMap', () => {
  const map = new NetworkMap([
    { from: 'http://certify-nginx', to: 'http://localhost:28091' },
    { from: 'http://verify-service:8080', to: 'http://localhost:28080' },
    { from: 'https://certify.ps02.test', to: 'https://localhost:28443' },
  ]);

  it('finds an origin written with or without its default port (undici passes an empty port)', () => {
    expect(map.lookup('http:', 'certify-nginx', '')).toEqual({ hostname: 'localhost', port: '28091' });
    expect(map.lookup('http:', 'CERTIFY-NGINX', '80')).toEqual({ hostname: 'localhost', port: '28091' });
    expect(map.lookup('https:', 'certify.ps02.test', '')).toEqual({ hostname: 'localhost', port: '28443' });
    expect(map.lookup('http:', 'verify-service', '8080')).toEqual({ hostname: 'localhost', port: '28080' });
    expect(map.lookup('http:', 'verify-service', '')).toBeUndefined();
    expect(map.lookup('http:', 'elsewhere', '')).toBeUndefined();
  });

  it('refuses an entry that changes the scheme', () => {
    expect(() => new NetworkMap([{ from: 'http://a', to: 'https://b' }])).toThrow(/changes the scheme/);
  });

  it('sends a request for a mapped name to the host port and keeps its Host header', async () => {
    const seen: Array<{ host?: string; url?: string }> = [];
    const { server, url } = await listenInTestRange((request, response) => {
      seen.push({ host: request.headers.host, url: request.url });
      response.setHeader('connection', 'close');
      response.end('ok');
    });
    try {
      const port = new URL(url).port;
      const fetch = networkFetch(
        new NetworkMap([{ from: 'http://certify-nginx', to: `http://127.0.0.1:${port}` }]),
      );
      const response = await fetch('http://certify-nginx/v1/certify/credential-offer-data/abc');
      expect(await response.text()).toBe('ok');
      expect(seen).toEqual([{ host: 'certify-nginx', url: '/v1/certify/credential-offer-data/abc' }]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('host mode uses the stack map unless another file is configured', () => {
    const host = networkMapPath(loadConfig({ PLAYGROUND_STACK: 'host' }));
    expect(host).toMatch(/deploy[\\/]inji-stack[\\/]network-map\.host\.json$/);
    expect(JSON.parse(readFileSync(host!, 'utf8'))).toHaveProperty('entries');
    expect(networkMapPath(loadConfig({}))).toBeUndefined();
    expect(networkMapPath(loadConfig({ PLAYGROUND_STACK: 'host', PLAYGROUND_NETWORK_MAP: 'x.json' }))).toBe(
      'x.json',
    );
    expect(extraCaPath(loadConfig({ PLAYGROUND_EXTRA_CA: 'ca.pem' }))).toBe('ca.pem');
    expect(extraCaPath(loadConfig({ PLAYGROUND_RUN_DIR: '/nonexistent-run-dir' }))).toBeUndefined();
  });
});

describe('status and DID fetches from the Inji stack', () => {
  // Inji Certify's domain URL is http://certify-nginx:80, so a status list it names lives on that host.
  const fetchFromCertify = (
    allowedHosts: readonly string[],
    url = 'http://certify-nginx/v1/certify/status-list/1',
  ) =>
    fetchLimited(
      {
        url,
        accept: 'application/json',
        codes: { insecure: 'STATUS_LIST_UNAVAILABLE', failed: 'STATUS_LIST_UNAVAILABLE' },
      },
      {
        allowedHosts,
        // A compose-network address, as certify-nginx resolves inside the bundle.
        lookup: () => Promise.resolve(['172.18.0.5']),
        fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }),
      },
    );
  const hostsFor = (env: Record<string, string>) => {
    const config = loadConfig(env);
    return [
      ...DEFAULT_FETCH_ALLOWED_HOSTS,
      ...stackFetchHosts(config, NetworkMap.fromFile(networkMapPath(config))),
    ];
  };

  it('a certify-nginx status list is refused with only the default allowlist', async () => {
    await expect(fetchFromCertify(DEFAULT_FETCH_ALLOWED_HOSTS)).rejects.toMatchObject({
      code: 'STATUS_LIST_UNAVAILABLE',
    });
  });

  it.each(['bundle', 'host'])(
    'stack %s: the stack hosts are allowed, so certify-nginx is fetched',
    async (stack) => {
      await expect(fetchFromCertify(hostsFor({ PLAYGROUND_STACK: stack }))).resolves.toBe('{}');
    },
  );

  it.each(['bundle', 'host'])('stack %s: a stack name is allowed on its own port only', async (stack) => {
    await expect(
      fetchFromCertify(hostsFor({ PLAYGROUND_STACK: stack }), 'http://certify-nginx:9000/internal'),
    ).rejects.toMatchObject({ code: 'STATUS_LIST_UNAVAILABLE' });
  });

  it('bundle: the context hosts the TLS front caches are for the context loader only, on 443', () => {
    const contexts = ['www.w3.org:443', 'w3id.org:443', 'piyush7034.github.io:443'];
    expect(stackContextHosts(loadConfig({ PLAYGROUND_STACK: 'bundle' }))).toEqual(contexts);
    expect(stackContextHosts(loadConfig({ PLAYGROUND_STACK: 'host' }))).toEqual([]);
    // did:web documents and status lists keep the address check: the TLS front follows redirects.
    expect(hostsFor({ PLAYGROUND_STACK: 'bundle' })).not.toContain('piyush7034.github.io:443');
  });

  it('INJI_*_URL hosts are allowed when the stack is on; with the stack off nothing is added', () => {
    expect(hostsFor({ PLAYGROUND_STACK: 'bundle', INJI_CERTIFY_URL: 'http://certify.lan:8090' })).toContain(
      'certify.lan:8090',
    );
    expect(stackFetchHosts(loadConfig({}), new NetworkMap())).toEqual([]);
  });
});
