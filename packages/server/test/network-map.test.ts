/**
 * The connection-level network map of host mode: URLs the stack advertises inside its compose network
 * (`http://certify-nginx`, `http://verify-service:8080`) reach a port on the host while the request keeps
 * its URL. The real map file is `deploy/inji-stack/network-map.host.json`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extraCaPath, loadConfig, networkMapPath } from '../src/config/index.js';
import { NetworkMap, networkFetch } from '../src/recording/network-map.js';
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
