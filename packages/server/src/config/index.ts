/**
 * Server configuration, read once from environment variables and validated with zod, so a typo in a
 * variable fails at start-up with a clear message instead of misbehaving later.
 */
import { existsSync } from 'node:fs';
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
});
export type Config = z.infer<typeof ConfigSchema>;

/** Maps environment variable names to configuration keys. */
const ENV_KEYS = {
  PLAYGROUND_PORT: 'port',
  PLAYGROUND_HOST: 'host',
  PLAYGROUND_RUN_DIR: 'runDir',
  PLAYGROUND_WEB_DIST: 'webDist',
  PLAYGROUND_STACK: 'stack',
  PLAYGROUND_PUBLIC_URL: 'publicUrl',
  PLAYGROUND_LOG_LEVEL: 'logLevel',
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
