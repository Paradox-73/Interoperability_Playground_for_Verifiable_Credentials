/**
 * Server configuration, read once from environment variables and validated with zod, so a typo in a
 * variable fails at start-up with a clear message instead of misbehaving later.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StackModeSchema } from '@inji-playground/protocol';
import { z } from 'zod';

/** Repository root: this file sits at packages/server/{src,dist}/config/. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export const ConfigSchema = z.object({
  /** TCP port of the UI, API, WebSocket, proxy and hosted reference roles. */
  port: z.coerce.number().int().min(1).max(65_535).default(28_100),
  /** Interface to listen on. Loopback by default; the container image sets 0.0.0.0. */
  host: z.string().min(1).default('127.0.0.1'),
  /** Directory for everything generated at run time (database, keys, certificates). Never in git. */
  runDir: z.string().min(1).default(`${repoRoot}run`),
  /** Built UI to serve; the UI is not served when the folder does not exist (development uses Vite). */
  webDist: z.string().min(1).default(`${repoRoot}packages/web/dist`),
  /** Whether the Inji stack is expected, and where. */
  stack: StackModeSchema.default('off'),
  /** URL the stack and phones use to reach this server, when it differs from http://localhost:<port>. */
  publicUrl: z.url().optional(),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Interoperability gap register served by `GET /api/gaps`; a missing file means no gaps yet. */
  gapsFile: z.string().min(1).default(`${repoRoot}docs/gaps/gaps.json`),
  /** SQLite database file; `:memory:` keeps nothing after the process ends (tests). Default `<runDir>/playground.db`. */
  dbPath: z.string().min(1).optional(),
  /**
   * Registers the development-only fake roles ("Test role (fake)"), so the UI can be exercised before
   * real roles exist. Off by default; never used in docs or the demo.
   */
  fakeRoles: z
    .enum(['1', 'true', 'yes', 'on', '0', 'false', 'no', 'off'])
    .transform((value) => ['1', 'true', 'yes', 'on'].includes(value))
    .default(false),
  /**
   * Step timeouts. Reference roles answer in milliseconds; Inji roles get 90 s because Certify's first
   * metadata call took 52 s and one Inji Verify LDP verification up to 13 s (measured 2026-10-04);
   * a step that waits for a person gets 10 minutes.
   */
  referenceStepTimeoutMs: z.coerce.number().int().positive().default(15_000),
  injiStepTimeoutMs: z.coerce.number().int().positive().default(90_000),
  personTimeoutMs: z.coerce.number().int().positive().default(600_000),
  /**
   * How long the reverse proxy waits for an Inji service. Above the 55 s the Inji Verify SDK's status
   * poll holds a request open, below the server's 120 s request timeout.
   */
  proxyTimeoutMs: z.coerce.number().int().positive().default(110_000),
  /** Upstream URLs of the proxied Inji services; defaults depend on `stack` (see `recording/targets.ts`). */
  injiCertifyUrl: z.url().optional(),
  injiCertifyAcUrl: z.url().optional(),
  injiVerifyUrl: z.url().optional(),
  injiMimotoUrl: z.url().optional(),
  /**
   * Network map file: how the server reaches URLs the stack advertises inside its compose network. In
   * host mode `deploy/inji-stack/network-map.host.json` is used when this is not set (see `networkMapPath`).
   */
  networkMap: z.string().min(1).optional(),
  /** Credential issuer identifier of certify-ac (its domain URL in deploy/inji-stack/config/certify-ac.properties). */
  injiCertifyAcIssuer: z.string().min(1).default('https://ref.ps02.test/proxy/certify-ac'),
  /** Inji Web's address for a browser; its /redirect page is Mimoto's redirect URI at the test authorization server. */
  injiWebUrl: z.string().min(1).default('http://localhost:28004'),
  /** `response_uri` base Inji Verify gives wallets (the stack's INJI_VERIFY_SUBMISSION_BASE_URL). */
  injiVerifySubmissionBaseUrl: z.string().min(1).default('https://verify.ps02.test/v1/verify'),
  /** Extra CA certificate (PEM file) trusted for outbound HTTPS, for example the stack's test CA. */
  extraCaFile: z.string().min(1).optional(),
  /** DID method of the reference issuer's keys. did:key resolves offline; did:web needs the TLS front for Inji Verify. */
  refIssuerDid: z.enum(['did:key', 'did:jwk', 'did:web']).default('did:key'),
  /**
   * Issuer DIDs the reference verifier accepts besides the reference issuers' own, comma-separated. A DID
   * issuer outside the list is INVALID (`ISSUER_UNTRUSTED`). The default names the two Inji Certify instances
   * of the local stack; add the DIDs of outside issuers you test against.
   */
  trustedIssuers: z
    .string()
    .default('did:web:certify.ps02.test,did:web:certify-ac.ps02.test')
    .transform((value) =>
      value
        .split(',')
        .map((did) => did.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().startsWith('did:', 'each trusted issuer must be a DID'))),
  /**
   * Hosts the reference verifier may fetch did:web documents and status lists from even when they are
   * private or loopback addresses, comma-separated: `name`, `name:port` or `*.name`. They are added to
   * `*.ps02.test` (the local stack) and this server's own host; other hosts on private networks are refused.
   */
  fetchAllowedHosts: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  /**
   * Data In URL of an Obsrv dataset (`https://<obsrv>/v2/data/in/<dataset_id>`). When set, the events of
   * every finished run are posted there (`src/metrics/obsrv.ts`); unset, nothing is sent.
   */
  obsrvUrl: z.url().optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

/** Network map for this configuration: the configured file, else the host map in host mode, else none. */
export function networkMapPath(config: Pick<Config, 'networkMap' | 'stack'>): string | undefined {
  if (config.networkMap) return config.networkMap;
  return config.stack === 'host' ? `${repoRoot}deploy/inji-stack/network-map.host.json` : undefined;
}

/**
 * Extra CA for outbound HTTPS: the configured file, else in host mode the stack's test CA when
 * `npm run stack:init` created it (the TLS front serves did:web documents with it, gap G2).
 */
export function extraCaPath(config: Pick<Config, 'extraCaFile' | 'stack' | 'runDir'>): string | undefined {
  if (config.extraCaFile) return config.extraCaFile;
  const stackCa = join(config.runDir, 'stack', 'ca', 'ps02-test-ca.crt');
  return config.stack !== 'off' && existsSync(stackCa) ? stackCa : undefined;
}

/** Path of the SQLite database for this configuration. */
export function databasePath(config: Pick<Config, 'dbPath' | 'runDir'>): string {
  return config.dbPath ?? join(config.runDir, 'playground.db');
}

/** Maps environment variable names to configuration keys. */
const ENV_KEYS = {
  PLAYGROUND_PORT: 'port',
  PLAYGROUND_HOST: 'host',
  PLAYGROUND_RUN_DIR: 'runDir',
  PLAYGROUND_WEB_DIST: 'webDist',
  PLAYGROUND_STACK: 'stack',
  PLAYGROUND_PUBLIC_URL: 'publicUrl',
  PLAYGROUND_LOG_LEVEL: 'logLevel',
  PLAYGROUND_DB: 'dbPath',
  PLAYGROUND_GAPS_FILE: 'gapsFile',
  PLAYGROUND_FAKE_ROLES: 'fakeRoles',
  PLAYGROUND_TIMEOUT_REFERENCE_MS: 'referenceStepTimeoutMs',
  PLAYGROUND_TIMEOUT_INJI_MS: 'injiStepTimeoutMs',
  PLAYGROUND_TIMEOUT_PERSON_MS: 'personTimeoutMs',
  PLAYGROUND_PROXY_TIMEOUT_MS: 'proxyTimeoutMs',
  PLAYGROUND_NETWORK_MAP: 'networkMap',
  PLAYGROUND_EXTRA_CA: 'extraCaFile',
  PLAYGROUND_REF_ISSUER_DID: 'refIssuerDid',
  PLAYGROUND_TRUSTED_ISSUERS: 'trustedIssuers',
  PLAYGROUND_FETCH_ALLOWED_HOSTS: 'fetchAllowedHosts',
  PLAYGROUND_OBSRV_URL: 'obsrvUrl',
  INJI_CERTIFY_URL: 'injiCertifyUrl',
  INJI_CERTIFY_AC_URL: 'injiCertifyAcUrl',
  INJI_VERIFY_URL: 'injiVerifyUrl',
  INJI_MIMOTO_URL: 'injiMimotoUrl',
  INJI_VERIFY_SUBMISSION_BASE_URL: 'injiVerifySubmissionBaseUrl',
  INJI_CERTIFY_AC_ISSUER: 'injiCertifyAcIssuer',
  INJI_WEB_URL: 'injiWebUrl',
} as const satisfies Record<string, keyof Config>;

/**
 * Reads the configuration from `env` (default `process.env`). Empty variables count as unset.
 * Throws an error naming every invalid variable.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw: Partial<Record<keyof Config, string>> = {};
  for (const [name, key] of Object.entries(ENV_KEYS)) {
    const value = env[name];
    if (value !== undefined && value !== '') raw[key] = value;
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const keyToEnv = new Map(Object.entries(ENV_KEYS).map(([name, key]) => [key as string, name]));
    const problems = parsed.error.issues.map((issue) => {
      const key = String(issue.path[0] ?? '');
      return `${keyToEnv.get(key) ?? key}: ${issue.message}`;
    });
    throw new Error(`invalid configuration\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}

/** True when a built UI exists at the configured path. */
export function hasWebDist(config: Pick<Config, 'webDist'>): boolean {
  return existsSync(`${config.webDist}/index.html`);
}
