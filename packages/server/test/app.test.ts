import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerHealthSchema } from '@inji-playground/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { injiRoles, stackStatus } from '../src/adapters/inji/index.js';
import { loadConfig } from '../src/config/index.js';

describe('GET /api/health', () => {
  it('answers with the health body defined in the protocol package', async () => {
    const app = await buildApp({
      config: loadConfig({ PLAYGROUND_DB: ':memory:', PLAYGROUND_WEB_DIST: '/nonexistent' }),
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = ServerHealthSchema.parse(res.json());
    expect(body.status).toBe('ok');
    await app.close();
  });

  it('returns a JSON 404 for an unknown API path', async () => {
    const app = await buildApp({
      config: loadConfig({ PLAYGROUND_DB: ':memory:', PLAYGROUND_WEB_DIST: '/nonexistent' }),
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not-found' });
    await app.close();
  });
});

describe('serving the built UI', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ps02-web-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>playground</title>');
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it('serves index.html for client-side routes but not for missing files or API paths', async () => {
    const app = await buildApp({
      config: loadConfig({ PLAYGROUND_DB: ':memory:', PLAYGROUND_WEB_DIST: dist }),
      logger: false,
    });
    const page = await app.inject({ method: 'GET', url: '/runs/42' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body).toContain('<title>playground</title>');

    expect((await app.inject({ method: 'GET', url: '/assets/missing.js' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/missing' })).statusCode).toBe(404);
    await app.close();
  });

  it('sends security headers with pages and API answers: CSP without inline scripts, no framing, nosniff', async () => {
    const app = await buildApp({
      config: loadConfig({ PLAYGROUND_DB: ':memory:', PLAYGROUND_WEB_DIST: dist }),
      logger: false,
    });
    for (const url of ['/', '/runs/42', '/api/health']) {
      const { headers } = await app.inject({ method: 'GET', url });
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['x-frame-options']).toBe('DENY');
      const csp = String(headers['content-security-policy']);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    }
    await app.close();
  });
});

describe('loadConfig', () => {
  it('uses port 28100 and loopback by default', () => {
    expect(loadConfig({})).toMatchObject({ port: 28_100, host: '127.0.0.1', stack: 'off' });
  });

  it('names the environment variable that is invalid', () => {
    expect(() => loadConfig({ PLAYGROUND_PORT: 'eighty' })).toThrow(/PLAYGROUND_PORT/);
    expect(() => loadConfig({ PLAYGROUND_STACK: 'cloud' })).toThrow(/PLAYGROUND_STACK/);
  });

  it('trusts the two Inji Certify DIDs by default and reads more from PLAYGROUND_TRUSTED_ISSUERS', () => {
    expect(loadConfig({}).trustedIssuers).toEqual([
      'did:web:certify.ps02.test',
      'did:web:certify-ac.ps02.test',
    ]);
    expect(
      loadConfig({ PLAYGROUND_TRUSTED_ISSUERS: ' did:web:issuer.example , did:key:z6Mk1,, ' }).trustedIssuers,
    ).toEqual(['did:web:issuer.example', 'did:key:z6Mk1']);
    expect(() => loadConfig({ PLAYGROUND_TRUSTED_ISSUERS: 'https://issuer.example' })).toThrow(
      /PLAYGROUND_TRUSTED_ISSUERS/,
    );
  });

  it('lets did:web reach the local stack names by default and reads more from PLAYGROUND_DID_WEB_ALLOWED_HOSTS', () => {
    expect(loadConfig({}).didWebAllowedHosts).toEqual(['*.ps02.test', 'localhost']);
    expect(
      loadConfig({ PLAYGROUND_DID_WEB_ALLOWED_HOSTS: ' Issuer.LAN ,*.corp,, ' }).didWebAllowedHosts,
    ).toEqual(['issuer.lan', '*.corp']);
  });
});

describe('Inji adapter registry', () => {
  it('starts empty and reports an empty stack', async () => {
    expect(injiRoles()).toEqual([]);
    expect(await stackStatus('off')).toMatchObject({ mode: 'off', services: [] });
  });
});
