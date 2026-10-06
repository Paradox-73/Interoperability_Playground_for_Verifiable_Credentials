#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Manages the local Inji stack (Docker Compose project ps02-inji, deploy/inji-stack/compose.yaml).
 *
 *   node deploy/inji-stack/scripts/stack.mjs <command> [options]
 *
 *   init            create the test CA and TLS certificate (runs the one-shot init service)
 *   up              init, start the stack, wait until every service answers on its host port
 *   wait            wait for the running stack (includes the slow first Certify metadata call)
 *   seed            add the SD-JWT credential configuration to Certify (idempotent; up does it too)
 *   smoke           up, issue and verify one credential per format, check every service, always down
 *   status          container state and host probes of every service (--json for machine output)
 *   down            stop and remove the containers and volumes (--keep-volumes keeps the data)
 *   logs [service]  print the compose logs
 *   verify-imports  check that every file in UPSTREAM.md entered git unchanged (prints IMPORTS MATCH)
 *
 * npm scripts: stack:init, stack:up, stack:down, stack:status, stack:smoke.
 * Environment: PLAYGROUND_RUN_DIR (default <repo>/run), PLAYGROUND_STACK_PROFILES (default
 * "holder-web,verify-ui"; "none" for the core only), INJI_*_URL to override host URLs (lib/env.mjs).
 * Starting the stack needs about 2 GiB of Docker memory; on the shared team laptop run it inside
 * `with_lock docker-stack`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { composeArgs, composePs, docker, dockerOrThrow } from './lib/docker.mjs';
import {
  NETWORK_MAP_FILE,
  REPO_ROOT,
  STACK_DIR,
  UPSTREAM_FILE,
  hostUrls,
  selectedProfiles,
  stackRunDir,
  toDockerPath,
} from './lib/env.mjs';
import { loadNetworkMap, waitFor } from './lib/http.mjs';
import { runVerifyImports } from './lib/imports.mjs';
import { probesFor, runProbe } from './lib/services.mjs';
import { runSmokeChecks, smokeVerdict } from './lib/smoke.mjs';

const UP_TIMEOUT_MS = 10 * 60_000;
const log = (line) => console.log(`[stack] ${line}`);
const seconds = (ms) => `${(ms / 1000).toFixed(0)} s`;
const caFile = () => `${stackRunDir()}/ca/ps02-test-ca.crt`;

/** Creates the run-directory folders the bind mounts point at, so Docker never creates them as root. */
function ensureRunDirs() {
  for (const sub of ['ca', 'ca-private', 'tls', 'mimoto', 'smoke', 'logs']) {
    mkdirSync(`${stackRunDir()}/${sub}`, { recursive: true });
  }
}

async function init() {
  ensureRunDirs();
  log(`init: test CA and TLS certificate in ${stackRunDir()}`);
  await dockerOrThrow([...composeArgs(), 'run', '--rm', '--no-deps', 'init']);
}

async function up(profiles) {
  ensureRunDirs();
  log(
    `up: core${profiles.length ? ` + ${profiles.join(', ')}` : ''} (project ps02-inji, run dir ${stackRunDir()})`,
  );
  const started = Date.now();
  // Compose itself waits for the health conditions in depends_on (Postgres, then Certify for certify-seed),
  // so this returns once the core is healthy; wait() then checks every host port.
  await dockerOrThrow([...composeArgs({ profiles }), 'up', '--detach', '--remove-orphans']);
  log(`up: compose finished after ${seconds(Date.now() - started)}`);
  await wait(profiles, started);
  await warmContexts();
}

/**
 * JSON-LD contexts the Inji services load for ldp_vc and ldp_vp, fetched once through the TLS front so its cache
 * holds them before the first run (nginx/tls-front.conf.template). A failure is only reported: the services then
 * fetch the document themselves on first use.
 */
const CONTEXT_URLS = [
  'https://www.w3.org/2018/credentials/v1',
  'https://www.w3.org/ns/credentials/v2',
  'https://www.w3.org/ns/did/v1',
  'https://w3id.org/security/v1',
  'https://w3id.org/security/v2',
  'https://w3id.org/security/suites/ed25519-2020/v1',
  'https://w3id.org/security/suites/jws-2020/v1',
  'https://w3id.org/security/data-integrity/v2',
  'https://piyush7034.github.io/my-files/farmer.json',
];

async function warmContexts() {
  const fetches = CONTEXT_URLS.map(
    (url) => `curl -sk -o /dev/null -w '%{http_code}' --retry 3 --retry-all-errors --max-time 30 '${url}'`,
  );
  const script = fetches.map((command, index) => `echo "${CONTEXT_URLS[index]} $(${command})"`).join('; ');
  try {
    const result = await dockerOrThrow([...composeArgs(), 'exec', '-T', 'tls-front', 'sh', '-c', script], {
      capture: true,
    });
    const lines = String(result?.stdout ?? '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const failed = lines.filter((line) => !line.endsWith(' 200'));
    log(`ready: JSON-LD context cache (${lines.length - failed.length} of ${CONTEXT_URLS.length} documents)`);
    for (const line of failed) log(`warning: context not cached: ${line}`);
  } catch (error) {
    log(
      `warning: JSON-LD context cache not warmed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function wait(profiles, started = Date.now()) {
  const urls = hostUrls();
  for (const probe of probesFor(urls, profiles)) {
    const ms = await waitFor(
      probe.label,
      async () => {
        const result = await runProbe(probe, { caFile: caFile() });
        return result.status === 200;
      },
      { timeoutMs: UP_TIMEOUT_MS, intervalMs: 5_000 },
    );
    log(`ready: ${probe.label} (${seconds(Date.now() - started)} since start, waited ${seconds(ms)})`);
  }
}

async function seed() {
  log('seed: certify-seed service (adds missing credential configurations)');
  await dockerOrThrow([...composeArgs(), 'run', '--rm', '--no-deps', 'certify-seed']);
}

async function status(json) {
  const profiles = selectedProfiles();
  const containers = await composePs();
  const probes = [];
  for (const probe of probesFor(hostUrls(), profiles)) {
    const result = await runProbe({ ...probe, timeoutMs: 10_000 }, { caFile: caFile() });
    probes.push({
      service: probe.service,
      label: probe.label,
      url: probe.url,
      status: result.status,
      ms: result.ms,
    });
  }
  if (json) {
    console.log(JSON.stringify({ project: 'ps02-inji', containers, probes }, null, 2));
    return;
  }
  if (containers.length === 0) log('status: no containers (stack is down)');
  for (const c of containers) {
    log(
      `container ${c.service.padEnd(15)} ${c.state}${c.health ? ` (${c.health})` : ''}${c.state === 'exited' ? ` exit ${c.exitCode}` : ''}`,
    );
  }
  for (const p of probes) log(`probe     ${p.service.padEnd(15)} ${p.status || 'no answer'}  ${p.url}`);
}

async function down({ keepVolumes = false } = {}) {
  log(`down: removing containers${keepVolumes ? '' : ' and volumes'}`);
  const args = [...composeArgs({ allProfiles: true }), 'down', '--remove-orphans'];
  if (!keepVolumes) args.push('--volumes');
  await dockerOrThrow(args);
}

async function saveLogs(tag) {
  const file = `${stackRunDir()}/logs/${tag}.log`;
  const { stdout } = await docker(
    [...composeArgs({ allProfiles: true }), 'logs', '--no-color', '--timestamps'],
    {
      capture: true,
    },
  );
  writeFileSync(file, stdout);
  return file;
}

async function smoke({ keepRunning = false } = {}) {
  const profiles = selectedProfiles();
  const tag = `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const started = Date.now();
  let verdict = { pass: false, line: 'SMOKE FAIL (stack did not start)', failed: [] };
  try {
    await init();
    await up(profiles);
    const readyMs = Date.now() - started;
    const result = await runSmokeChecks({
      urls: hostUrls(),
      profiles,
      caFile: caFile(),
      networkMap: loadNetworkMap(NETWORK_MAP_FILE),
      log: (line) => log(`check ${line}`),
    });
    verdict = smokeVerdict(result.checks);
    const reportFile = `${stackRunDir()}/smoke/${tag}.json`;
    writeFileSync(
      reportFile,
      JSON.stringify(
        {
          date: new Date().toISOString(),
          verdict: verdict.line,
          readyMs,
          totalMs: Date.now() - started,
          profiles,
          ...result,
        },
        null,
        2,
      ),
    );
    log(`report: ${reportFile}`);
  } catch (error) {
    log(`error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (!verdict.pass || process.env.PLAYGROUND_STACK_SAVE_LOGS === '1') {
      log(`logs: ${await saveLogs(tag)}`);
    }
    if (keepRunning) log('smoke: --keep-running, leaving the stack up (npm run stack:down to stop it)');
    else await down();
  }
  console.log(verdict.line);
  if (verdict.failed.length > 0 && verdict.pass) {
    for (const check of verdict.failed) console.log(`  known gap: ${check.label}: ${check.detail}`);
  }
  log(`smoke: ${seconds(Date.now() - started)} in total`);
  return verdict.pass;
}

function verifyImports() {
  return runVerifyImports({
    repoRoot: REPO_ROOT,
    stackPrefix: toDockerPath(relative(REPO_ROOT, STACK_DIR)).replace(/\/$/, ''),
    upstreamFile: UPSTREAM_FILE,
    upstreamDir: process.env.PS02_UPSTREAM_DIR,
  });
}

const USAGE = 'usage: stack.mjs <init|up|wait|seed|smoke|status|down|logs|verify-imports> [options]';

async function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => rest.includes(name);
  switch (command) {
    case 'init':
      await init();
      return true;
    case 'up':
      await up(selectedProfiles());
      log('stack is up; stop it with npm run stack:down');
      return true;
    case 'wait':
      await wait(selectedProfiles());
      return true;
    case 'seed':
      await seed();
      return true;
    case 'smoke':
      return smoke({ keepRunning: flag('--keep-running') });
    case 'status':
      await status(flag('--json'));
      return true;
    case 'down':
      await down({ keepVolumes: flag('--keep-volumes') });
      return true;
    case 'logs': {
      const services = rest.filter((a) => !a.startsWith('-'));
      return (
        (await docker([...composeArgs({ allProfiles: true }), 'logs', '--no-color', ...services])).code === 0
      );
    }
    case 'verify-imports':
      return verifyImports();
    default:
      console.error(USAGE);
      return false;
  }
}

main(process.argv.slice(2)).then(
  (ok) => process.exit(ok ? 0 : 1),
  (error) => {
    console.error(`[stack] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
