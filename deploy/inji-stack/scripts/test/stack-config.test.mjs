// SPDX-License-Identifier: MIT
// Invariants of the committed stack configuration, so a later edit cannot quietly break the rules the stack
// relies on: project name, profiles, port range, the Mimoto service name, the seed data and the network map.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { COMPOSE_FILE, COMPOSE_HOST_FILE, NETWORK_MAP_FILE, STACK_DIR } from '../lib/env.mjs';
import { loadNetworkMap, toHostUrl } from '../lib/http.mjs';
import { ISSUER_DID } from '../lib/smoke.mjs';

const compose = parse(readFileSync(COMPOSE_FILE, 'utf8'));
const hostOverride = parse(readFileSync(COMPOSE_HOST_FILE, 'utf8'));
const hostPorts = (service) => (service.ports ?? []).map((p) => Number(String(p).split(':').at(-2)));

describe('compose.yaml', () => {
  it('is the ps02-inji project', () => {
    expect(compose.name).toBe('ps02-inji');
  });

  it('starts the core without a profile and keeps holder-web and verify-ui opt-in', () => {
    const core = Object.entries(compose.services)
      .filter(([, s]) => !s.profiles)
      .map(([name]) => name)
      .sort();
    expect(core).toEqual([
      'certify',
      'certify-nginx',
      'certify-seed',
      'database',
      'init',
      'tls-front',
      'verify-service',
    ]);
    expect(compose.services['mimoto-service'].profiles).toEqual(['holder-web']);
    expect(compose.services['inji-web'].profiles).toEqual(['holder-web']);
    expect(compose.services['verify-ui'].profiles).toEqual(['verify-ui']);
  });

  it('sets the Inji Verify UI QR header plainly (gap G10: the upstream sample lacks the "$")', () => {
    expect(compose.services['verify-ui'].environment.OVP_QR_HEADER).toBe('INJI_OVP://payload=');
  });

  it('turns off the Secure cookie flag of verify-service, which serves plain http', () => {
    expect(compose.services['verify-service'].environment.INJI_VERIFY_COOKIE_SECURE_VALUE).toBe('false');
  });

  it('mounts the upstream verify-ui config.json unchanged', () => {
    expect(compose.services['verify-ui'].volumes).toContain(
      './config/verify-ui-config.json:/usr/share/nginx/html/assets/config.json:ro',
    );
  });

  it('names Mimoto mimoto-service, the host the inji-web image proxies /v1/mimoto/ to', () => {
    expect(compose.services['mimoto-service'].image).toBe('injistack/mimoto:0.22.0');
  });

  it('pins every non-Inji image by version and digest, so a nightly change is an Inji change', () => {
    const images = Object.values(compose.services).map((s) => s.image);
    expect(
      images.filter((image) => !image.startsWith('injistack/') && !/:[\w.-]+@sha256:/.test(image)),
    ).toEqual([]);
  });

  it('publishes host ports only inside the project range 28000-28999', () => {
    const ports = [...Object.values(compose.services), ...Object.values(hostOverride.services)].flatMap(
      hostPorts,
    );
    expect(ports.length).toBeGreaterThan(0);
    expect(ports.filter((port) => port < 28000 || port > 28999)).toEqual([]);
  });

  it('does not publish Postgres in the base file (host mode adds it on 127.0.0.1 only)', () => {
    expect(compose.services.database.ports).toBeUndefined();
    expect(hostOverride.services.database.ports).toEqual(['127.0.0.1:28432:5432']);
  });

  it('gives the TLS front the did:web host names as network aliases', () => {
    expect(compose.services['tls-front'].networks.default.aliases).toEqual(
      expect.arrayContaining(['certify.ps02.test', 'verify.ps02.test', 'ref.ps02.test']),
    );
  });

  it('lets the Java services trust the test CA through the Temurin entrypoint', () => {
    for (const name of ['verify-service', 'mimoto-service']) {
      const service = compose.services[name];
      expect(service.environment.USE_SYSTEM_CA_CERTS).toBe('1');
      expect(service.volumes.some((v) => v.endsWith('/stack/ca:/certificates:ro'))).toBe(true);
    }
  });
});

describe('Certify seed data (config/seed)', () => {
  const body = JSON.parse(
    readFileSync(`${STACK_DIR}config/seed/farmer-sd-jwt.credential-configuration.json`, 'utf8'),
  );
  const template = readFileSync(`${STACK_DIR}config/seed/farmer-sd-jwt.template.json`);

  it('carries the readable template, base64 encoded', () => {
    expect(Buffer.from(body.vcTemplate, 'base64').equals(template)).toBe(true);
    expect(() => JSON.parse(template.toString('utf8'))).not.toThrow();
  });

  it('issues vc+sd-jwt under the stack issuer DID', () => {
    expect(body).toMatchObject({
      credentialConfigKeyId: 'FarmerSdJwt',
      credentialFormat: 'vc+sd-jwt',
      didUrl: ISSUER_DID,
    });
  });

  it('has the display fields Mimoto requires for every configuration (gap G4)', () => {
    for (const display of body.metaDataDisplay) {
      expect(display.name).toBeTruthy();
      expect(display.logo?.url).toMatch(/^https:\/\//);
      expect(display.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(display.text_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('issuer DID is the same everywhere', () => {
  it('in the preauth profile and the FarmerCredential row', () => {
    expect(readFileSync(`${STACK_DIR}config/certify-preauth.properties`, 'utf8')).toContain(
      `mosip.certify.data-provider-plugin.did-url=${ISSUER_DID}`,
    );
    expect(readFileSync(`${STACK_DIR}sql/certify_init.sql`, 'utf8')).toContain(
      `'${ISSUER_DID}',  -- did_url`,
    );
  });
});

describe('network-map.host.json', () => {
  const map = loadNetworkMap(NETWORK_MAP_FILE);

  it('maps the advertised Certify name with and without the port to certify-nginx on the host', () => {
    expect(toHostUrl('http://certify-nginx:80/v1/certify/oauth/token', map).url).toBe(
      'http://localhost:28091/v1/certify/oauth/token',
    );
    expect(toHostUrl('http://certify-nginx/.well-known/x', map).url).toBe(
      'http://localhost:28091/.well-known/x',
    );
  });

  it('sends TLS front names to port 28443 with the original name as host header', () => {
    expect(toHostUrl('https://verify.ps02.test/v1/verify/did.json', map)).toEqual({
      url: 'https://localhost:28443/v1/verify/did.json',
      hostHeader: 'verify.ps02.test',
    });
  });

  it('only matches whole host names and leaves unknown URLs alone', () => {
    expect(toHostUrl('http://certify-nginx-2/x', map).url).toBe('http://certify-nginx-2/x');
    expect(toHostUrl('https://example.org/', map)).toEqual({ url: 'https://example.org/' });
  });
});

describe('JSON-LD context cache on the TLS front', () => {
  const contextHosts = ['www.w3.org', 'w3id.org', 'piyush7034.github.io'];

  it('the TLS front answers for the context hosts, and its certificate names them', () => {
    const aliases = compose.services['tls-front'].networks.default.aliases;
    for (const host of contextHosts) expect(aliases).toContain(host);
    const init = readFileSync(`${STACK_DIR}/scripts/stack-init.sh`, 'utf8');
    const names = /TLS_NAMES=\$\{TLS_NAMES:-([^}]*)\}/.exec(init)?.[1].split(' ') ?? [];
    for (const host of contextHosts) expect(names).toContain(host);
  });

  it('every service that fetches contexts trusts the stack CA', () => {
    for (const name of ['certify', 'certify-ac', 'verify-service', 'mimoto-service']) {
      const service = compose.services[name];
      expect(service.environment.USE_SYSTEM_CA_CERTS, name).toBe('1');
      expect(
        service.volumes.some((volume) => String(volume).endsWith('/certificates:ro')),
        name,
      ).toBe(true);
    }
  });

  it('the cache resolves the real hosts through public DNS and serves stale copies on 429', () => {
    const template = readFileSync(`${STACK_DIR}/nginx/tls-front.conf.template`, 'utf8');
    expect(template).toMatch(/server_name www\.w3\.org w3id\.org piyush7034\.github\.io;/);
    expect(template).toMatch(/resolver 1\.1\.1\.1 8\.8\.8\.8/);
    expect(template).toMatch(/proxy_cache_use_stale [^;]*http_429/);
    expect(template).toMatch(/proxy_set_header Accept-Encoding "";/);
  });
});

describe('container entry scripts', () => {
  // Compose mounts these read-only and the images run them directly (Postgres runs every executable file in
  // docker-entrypoint-initdb.d), so git must record them as executable. Windows checkouts do not keep file
  // modes, so the mode in the index is what counts.
  it('are committed with the executable bit', () => {
    const entries = execFileSync('git', ['ls-files', '-s', '--full-name', '--', 'scripts/*.sh'], {
      cwd: STACK_DIR,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .map((line) => ({ mode: line.split(' ')[0], path: line.split('\t')[1] }));
    expect(entries.map((e) => e.path).sort()).toEqual([
      'deploy/inji-stack/scripts/certify-seed.sh',
      'deploy/inji-stack/scripts/mimoto-start.sh',
      'deploy/inji-stack/scripts/postgres-init.sh',
      'deploy/inji-stack/scripts/stack-init.sh',
    ]);
    expect(entries.filter((e) => e.mode !== '100755')).toEqual([]);
  });
});
