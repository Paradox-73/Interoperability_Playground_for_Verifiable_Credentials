// SPDX-License-Identifier: MIT
/**
 * Locations and settings shared by the stack scripts: repository paths, the run directory, the compose
 * project, host URLs of every service and the profiles to start.
 */
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** deploy/inji-stack/ (this file is deploy/inji-stack/scripts/lib/env.mjs). */
export const STACK_DIR = fileURLToPath(new URL('../../', import.meta.url));
/** Repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export const COMPOSE_PROJECT = 'ps02-inji';
export const COMPOSE_FILE = resolve(STACK_DIR, 'compose.yaml');
/** Debug ports for host mode (Certify 28090, Postgres 28432 on 127.0.0.1). */
export const COMPOSE_HOST_FILE = resolve(STACK_DIR, 'compose.host.yaml');
export const NETWORK_MAP_FILE = resolve(STACK_DIR, 'network-map.host.json');
export const UPSTREAM_FILE = resolve(STACK_DIR, 'UPSTREAM.md');

/** Opt-in compose profiles; services without a profile (the core) always start. */
export const ALL_PROFILES = Object.freeze(['holder-web', 'verify-ui']);

/** Normalises a path for Docker on Windows: absolute, forward slashes (E:/x/y, which compose accepts). */
export function toDockerPath(path) {
  return path.replace(/\\/g, '/');
}

/**
 * The playground run directory (PLAYGROUND_RUN_DIR, default <repo>/run), always absolute. Compose resolves
 * relative bind-mount paths against the compose file's folder, so a relative value would point elsewhere.
 */
export function runDir(env = process.env) {
  const value = env.PLAYGROUND_RUN_DIR?.trim();
  const dir = value ? (isAbsolute(value) ? value : resolve(process.cwd(), value)) : resolve(REPO_ROOT, 'run');
  return toDockerPath(dir);
}

/** Folder for everything the stack generates: certificates, Mimoto key store, smoke reports, logs. */
export function stackRunDir(env = process.env) {
  return `${runDir(env)}/stack`;
}

/**
 * Profiles to start: PLAYGROUND_STACK_PROFILES (comma separated; "none" for the core only), else all.
 * Unknown names are rejected so a typo does not silently skip a role.
 */
export function selectedProfiles(env = process.env) {
  const raw = env.PLAYGROUND_STACK_PROFILES?.trim();
  if (!raw) return [...ALL_PROFILES];
  if (raw === 'none') return [];
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = names.filter((n) => !ALL_PROFILES.includes(n));
  if (unknown.length > 0) {
    throw new Error(`unknown profile(s) in PLAYGROUND_STACK_PROFILES: ${unknown.join(', ')}`);
  }
  return names;
}

/**
 * Host URLs of the stack services (ports of WINNING_PLAN section 4.2). Overridable one by one, for example to
 * point the smoke test at another machine.
 */
export function hostUrls(env = process.env) {
  return {
    certifyNginx: env.INJI_CERTIFY_URL ?? 'http://localhost:28091',
    certifyAc: env.INJI_CERTIFY_AC_URL ?? 'http://localhost:28093',
    tlsFront: env.INJI_TLS_FRONT_URL ?? 'https://localhost:28443',
    verifyService: env.INJI_VERIFY_URL ?? 'http://localhost:28080',
    mimoto: env.INJI_MIMOTO_URL ?? 'http://localhost:28099',
    injiWeb: env.INJI_WEB_URL ?? 'http://localhost:28004',
    verifyUi: env.INJI_VERIFY_UI_URL ?? 'http://localhost:28030',
  };
}
