#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run demo`: the demo path in one command. Checks Docker, ports and memory, starts the bundle
 * (`npm run up`: the Inji stack plus the playground on http://localhost:28100), runs the cells of
 * packages/cli/specs/demo.yaml against it, prints a table and `DEMO PASS` or `DEMO FAIL`.
 *
 *   npm run demo                      check, start, run; leave the bundle up for the person presenting
 *   npm run demo -- --ci              the same without a person: the bundle is removed at the end
 *   npm run demo -- --ci --keep-up    for CI steps that use the bundle afterwards (npm run e2e:live)
 *   npm run demo -- --preflight       only the checks (before a recording)
 *   npm run demo -- --no-build        start with the playground image that is already built
 *
 * The cell results (matrix.json, matrix.md, a redacted run file per cell) go to $PLAYGROUND_RUN_DIR/demo/.
 * Exit code 0 when every cell gives the verdict its spec expects.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { docker } from '../deploy/inji-stack/scripts/lib/docker.mjs';
import { REPO_ROOT, runDir } from '../deploy/inji-stack/scripts/lib/env.mjs';

const args = new Set(process.argv.slice(2));
const ci = args.has('--ci');
const keepUp = args.has('--keep-up') || !ci;
const PLAYGROUND_URL = 'http://localhost:28100';
/** Host ports the bundle publishes (deploy/compose.yaml and deploy/inji-stack/compose.yaml). */
const BUNDLE_PORTS = [28100, 28091, 28443, 28080, 28093, 28099, 28004, 28030];
/** The bundle used 2.6-2.9 GiB in steady state (docker stats, 2026-10-14); below this it may not start. */
const MIN_MEMORY_GIB = 3.5;
/** A Docker VM set to 6 GB reports about 5.8 GiB; on a 4 GB VM Mimoto never became ready (2026-10-13). */
const RECOMMENDED_MEMORY_GIB = 5.5;
const MIN_COMPOSE = [2, 24];

const log = (line) => console.log(`[demo] ${line}`);

/** Something answers on the port (Docker Desktop on Windows lets another process bind it all the same). */
function portAnswers(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

function portBindable(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
}

async function portFree(port) {
  return !(await portAnswers(port)) && (await portBindable(port));
}

async function capture(dockerArgs) {
  try {
    const { code, stdout } = await docker(dockerArgs, { capture: true });
    return code === 0 ? stdout.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Problems that stop a demo; warnings are printed but do not. */
async function preflight() {
  const problems = [];
  const server = await capture(['version', '--format', '{{.Server.Version}}']);
  if (!server) {
    problems.push('Docker does not answer: start Docker Desktop (or the Docker service) first');
    return problems;
  }
  log(`Docker ${server}`);
  const compose = await capture(['compose', 'version', '--short']);
  const [major = 0, minor = 0] = (compose ?? '').replace(/^v/, '').split('.').map(Number);
  if (major < MIN_COMPOSE[0] || (major === MIN_COMPOSE[0] && minor < MIN_COMPOSE[1]))
    problems.push(`Docker Compose ${compose ?? 'missing'}: ${MIN_COMPOSE.join('.')} or newer is needed`);
  else log(`Docker Compose ${compose}`);
  const memory = Number(await capture(['info', '--format', '{{.MemTotal}}']));
  if (Number.isFinite(memory) && memory > 0) {
    const gib = memory / 1024 ** 3;
    if (gib < MIN_MEMORY_GIB)
      problems.push(
        `Docker has ${gib.toFixed(1)} GiB of memory; give it 6 to 8 GB (the bundle uses about 2.9 GiB)`,
      );
    else if (gib < RECOMMENDED_MEMORY_GIB)
      log(`warning: Docker memory ${gib.toFixed(1)} GiB; with less than 6 GB Mimoto may never become ready`);
    else log(`Docker memory ${gib.toFixed(1)} GiB`);
  }
  const bundle = await capture(['compose', '-p', 'ps02-bundle', 'ps', '-q']);
  const stack = await capture(['compose', '-p', 'ps02-inji', 'ps', '-q']);
  if (stack)
    problems.push('the development stack (ps02-inji) is running on the same ports: npm run stack:down');
  if (bundle) {
    log('the bundle is already running; it is reused');
  } else {
    const taken = [];
    for (const port of BUNDLE_PORTS) if (!(await portFree(port))) taken.push(port);
    if (taken.length > 0 && !stack)
      problems.push(`ports in use: ${taken.join(', ')} (a playground server on 28100? stop it first)`);
    else if (taken.length === 0) log(`ports free: ${BUNDLE_PORTS.join(', ')}`);
  }
  return problems;
}

function node(script, scriptArgs, env = {}) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_NO_WARNINGS: '1', ...env },
  });
  return result.status ?? 1;
}

function cli(cliArgs) {
  const result = spawnSync(
    process.execPath,
    ['--conditions=source', '--import', 'tsx', 'packages/cli/src/main.ts', ...cliArgs],
    { cwd: REPO_ROOT, stdio: 'inherit', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  return result.status ?? 1;
}

function printTable(matrixFile) {
  const result = JSON.parse(readFileSync(matrixFile, 'utf8'));
  const rows = result.cells.map((cell) => [
    cell.case.id,
    `${cell.case.issuer} -> ${cell.case.wallet} -> ${cell.case.verifier}`,
    cell.case.format,
    cell.case.scenario,
    cell.expected,
    cell.outcome ?? '-',
    cell.verdict ?? 'no run',
    cell.matches ? 'yes' : 'NO',
  ]);
  const header = [
    'Case',
    'Issuer -> wallet -> verifier',
    'Format',
    'Scenario',
    'Expected',
    'Actual',
    'Verdict',
    'As specified',
  ];
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column].length)),
  );
  const line = (row) => row.map((value, column) => value.padEnd(widths[column])).join('  ');
  console.log('');
  console.log(line(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
  console.log('');
  return result;
}

async function main() {
  const started = Date.now();
  const problems = await preflight();
  for (const problem of problems) console.error(`[demo] preflight: ${problem}`);
  if (problems.length > 0) {
    console.error('DEMO FAIL (preflight)');
    return 1;
  }
  log('preflight passed');
  if (args.has('--preflight')) return 0;

  const upArgs = ['up', ...(args.has('--no-build') ? ['--no-build'] : [])];
  if (node('scripts/bundle.mjs', upArgs) !== 0) {
    console.error('DEMO FAIL (the bundle did not start; see the [bundle] lines above)');
    if (ci && !args.has('--keep-up')) node('scripts/bundle.mjs', ['down']);
    return 1;
  }
  log(`bundle up after ${Math.round((Date.now() - started) / 1000)} s`);

  const out = join(runDir(), 'demo');
  const status = cli(['matrix', '--spec', 'demo', '--server', PLAYGROUND_URL, '--out', out]);
  let passed = false;
  try {
    const result = printTable(join(out, 'matrix.json'));
    passed = status === 0 && result.totals.mismatched === 0;
    log(
      `${result.totals.matched} of ${result.totals.cells} cells as specified; details in ${join(out, 'matrix.md')}`,
    );
  } catch (error) {
    console.error(`[demo] no matrix result: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(passed ? 'DEMO PASS' : 'DEMO FAIL');
  log(`took ${Math.round((Date.now() - started) / 1000)} s`);

  if (keepUp) log(`the bundle stays up: open ${PLAYGROUND_URL}; stop it with npm run down`);
  else node('scripts/bundle.mjs', ['down']);
  return passed ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[demo] ${error instanceof Error ? error.message : String(error)}`);
    console.error('DEMO FAIL');
    process.exit(1);
  },
);
