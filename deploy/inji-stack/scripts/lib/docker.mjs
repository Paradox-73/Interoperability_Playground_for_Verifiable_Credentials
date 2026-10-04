// SPDX-License-Identifier: MIT
/**
 * Runs `docker compose` for the ps02-inji project. Commands are spawned without a shell, so no argument is
 * ever re-parsed, and Git Bash path conversion does not apply (it only affects commands typed in Bash).
 */
import { spawn } from 'node:child_process';
import { COMPOSE_FILE, COMPOSE_HOST_FILE, COMPOSE_PROJECT, runDir } from './env.mjs';

/**
 * Builds the global `docker compose` arguments.
 * @param {{ profiles?: string[], hostMode?: boolean, allProfiles?: boolean }} options
 *   hostMode adds compose.host.yaml (debug ports); allProfiles selects every profile, which `down` needs so
 *   that profile services are removed too.
 */
export function composeArgs({ profiles = [], hostMode = true, allProfiles = false } = {}) {
  const args = ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE];
  if (hostMode) args.push('-f', COMPOSE_HOST_FILE);
  if (allProfiles) args.push('--profile', '*');
  else for (const profile of profiles) args.push('--profile', profile);
  return args;
}

/** Environment for compose: the absolute run directory, so bind mounts land in the right place. */
export function composeEnv(env = process.env) {
  return { ...env, PLAYGROUND_RUN_DIR: runDir(env) };
}

/**
 * Runs docker with the given arguments.
 * @param {string[]} args
 * @param {{ capture?: boolean, env?: NodeJS.ProcessEnv, input?: import('node:stream').Readable }} options
 *   capture collects stdout (and still shows stderr); otherwise output goes straight to the terminal.
 * @returns {Promise<{ code: number, stdout: string }>}
 */
export function docker(args, { capture = false, env = composeEnv(), input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, {
      env,
      stdio: [input ? 'pipe' : 'ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let stdout = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
    }
    if (input) input.pipe(child.stdin);
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout }));
  });
}

/** Like docker(), but throws when the command fails. */
export async function dockerOrThrow(args, options) {
  const result = await docker(args, options);
  if (result.code !== 0) throw new Error(`docker ${args.join(' ')} exited with ${result.code}`);
  return result;
}

/**
 * Container state of every service of the project, from `docker compose ps --all --format json`
 * (one JSON object per line in compose v2.21+, a JSON array in older versions).
 * @returns {Promise<Array<{ service: string, state: string, health: string, exitCode: number }>>}
 */
export async function composePs(options = {}) {
  const { stdout } = await dockerOrThrow(
    [...composeArgs({ ...options, allProfiles: true }), 'ps', '--all', '--format', 'json'],
    {
      capture: true,
    },
  );
  return parseComposePs(stdout);
}

/** Parses the output of `docker compose ps --format json`; exported for tests. */
export function parseComposePs(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const rows = trimmed.startsWith('[')
    ? JSON.parse(trimmed)
    : trimmed
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  return rows.map((row) => ({
    service: row.Service,
    state: row.State,
    health: row.Health ?? '',
    exitCode: row.ExitCode ?? 0,
  }));
}
