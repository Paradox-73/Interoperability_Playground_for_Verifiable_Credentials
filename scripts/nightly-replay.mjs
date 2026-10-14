#!/usr/bin/env node
/**
 * Local replay of a GitHub Actions workflow (default `.github/workflows/interop-nightly.yml`): runs the `run`
 * steps of each job in `needs` order, in bash, with the job and step `env`, the way a runner does
 * (`bash --noprofile --norc -eo pipefail`). It exists because the nightly live job needs Docker for the Inji stack,
 * which a nested runner container (nektos/act) cannot reach on Docker Desktop.
 *
 *   node scripts/nightly-replay.mjs                    every job
 *   node scripts/nightly-replay.mjs --job live         one job (its `needs` are not run)
 *   node scripts/nightly-replay.mjs --env NAME=value   override an env value of every job
 *   node scripts/nightly-replay.mjs --skip-install     skip `npm ci` (keeps the installed node_modules)
 *
 * What it does with the parts of a workflow it cannot run:
 * - `uses: actions/checkout` and `actions/setup-node`: skipped; the replay runs in this checkout with the
 *   installed Node (the version of `.nvmrc` is checked).
 * - `uses: actions/upload-artifact`: the listed paths are copied to run/nightly-replay/artifacts/<name>/.
 * - `if:` supports `always()`, `success()`, `failure()`, `steps.<id>.outcome == '<value>'` and
 *   `env.<NAME> == '<value>'` joined with `||` and `&&`; `continue-on-error: true` makes a failed step's
 *   outcome `failure` without failing the job.
 * - `${{ github.workspace }}` is this checkout. `inputs.*`, `vars.*` and `secrets.*` are empty, as unset ones
 *   are on GitHub, so `${{ vars.X || 'default' }}` gives the default; set a job env value with `--env`.
 * - `$GITHUB_STEP_SUMMARY` is run/nightly-replay/summary-<job>.md.
 * - On Docker Desktop (not Linux) the bridge address 172.17.0.1 does not reach the host, so an env value
 *   naming it is changed to host.docker.internal, and the change is printed.
 *
 * Writes run/nightly-replay/result.json (every step with outcome and seconds) and exits 1 when a job failed.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const options = {
    workflow: '.github/workflows/interop-nightly.yml',
    jobs: [],
    env: {},
    skipInstall: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workflow') options.workflow = argv[++i];
    else if (arg === '--job') options.jobs.push(argv[++i]);
    else if (arg === '--skip-install') options.skipInstall = true;
    else if (arg === '--env') {
      const pair = argv[++i] ?? '';
      const at = pair.indexOf('=');
      if (at <= 0) throw new Error(`--env needs NAME=value, got ${pair}`);
      options.env[pair.slice(0, at)] = pair.slice(at + 1);
    } else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

/** Jobs in an order that runs every job after the jobs it `needs`. */
export function jobOrder(jobs) {
  const order = [];
  const visit = (id, path = []) => {
    if (order.includes(id)) return;
    if (path.includes(id)) throw new Error(`jobs need each other: ${[...path, id].join(' -> ')}`);
    const needs = jobs[id]?.needs;
    for (const need of Array.isArray(needs) ? needs : needs ? [needs] : []) visit(need, [...path, id]);
    order.push(id);
  };
  for (const id of Object.keys(jobs)) visit(id);
  return order;
}

/** Replaces each `${{ ... }}` in a value. Operands joined by `||`: the first non-empty one wins. */
export function expand(value, context) {
  return String(value).replace(/\$\{\{(.*?)\}\}/g, (_match, expression) => {
    for (const operand of expression.split('||').map((part) => part.trim())) {
      let result;
      if (operand === 'github.workspace') result = context.workspace;
      else if (/^'[^']*'$/.test(operand)) result = operand.slice(1, -1);
      else if (/^(inputs|vars|secrets)\.\w+$/.test(operand)) result = '';
      else throw new Error(`unsupported expression in a value: ${expression.trim()}`);
      if (result !== '') return result;
    }
    return '';
  });
}

/**
 * Evaluates a step `if:`. Without one a step runs only while the job has not failed (`success()`).
 * Supported: always(), success(), failure(), steps.<id>.outcome and env.<NAME> == / != '<value>', ||, &&, !.
 */
export function evaluateIf(expression, state) {
  if (expression === undefined || expression === null || expression === '') return !state.jobFailed;
  const source = String(expression)
    .replace(/^\$\{\{|\}\}$/g, '')
    .trim();
  const tokens = source.match(
    /always\(\)|success\(\)|failure\(\)|steps\.[\w-]+\.outcome|env\.\w+|'[^']*'|==|!=|\|\||&&|!|\(|\)/g,
  );
  const joined = (tokens ?? []).join('');
  if (joined.replace(/\s/g, '') !== source.replace(/\s/g, '')) {
    throw new Error(`unsupported if: expression: ${source}`);
  }
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const primary = () => {
    const token = next();
    if (token === '(') {
      const value = or();
      next();
      return value;
    }
    if (token === '!') return !truthy(primary());
    if (token === 'always()') return true;
    if (token === 'success()') return !state.jobFailed;
    if (token === 'failure()') return state.jobFailed;
    if (token.startsWith("'")) return token.slice(1, -1);
    if (token.startsWith('steps.')) return state.outcomes[token.split('.')[1]] ?? '';
    if (token.startsWith('env.')) return state.env?.[token.slice(4)] ?? '';
    throw new Error(`unexpected ${token} in ${source}`);
  };
  const truthy = (value) => value !== false && value !== '' && value !== undefined;
  const comparison = () => {
    let left = primary();
    while (peek() === '==' || peek() === '!=') {
      const op = next();
      const right = primary();
      left = op === '==' ? left === right : left !== right;
    }
    return left;
  };
  const and = () => {
    let left = comparison();
    while (peek() === '&&') {
      next();
      const right = comparison();
      left = truthy(left) && truthy(right);
    }
    return left;
  };
  const or = () => {
    let left = and();
    while (peek() === '||') {
      next();
      const right = and();
      left = truthy(left) || truthy(right);
    }
    return left;
  };
  return truthy(or());
}

/** Env of a job, with 172.17.0.1 (the Linux Docker bridge) changed to host.docker.internal off Linux. */
export function jobEnv(job, context, overrides, platform = process.platform, log = console.log) {
  const env = {};
  for (const [name, value] of Object.entries(job.env ?? {})) env[name] = expand(value, context);
  if (platform !== 'linux') {
    for (const [name, value] of Object.entries(env)) {
      if (value.includes('172.17.0.1')) {
        env[name] = value.replaceAll('172.17.0.1', 'host.docker.internal');
        log(
          `[replay] ${name}: ${value} -> ${env[name]} (Docker Desktop has no 172.17.0.1 bridge to the host)`,
        );
      }
    }
  }
  return { ...env, ...overrides };
}

function bash() {
  if (process.platform !== 'win32') return 'bash';
  const git = 'C:\\Program Files\\Git\\bin\\bash.exe';
  return existsSync(git) ? git : 'bash';
}

function runStep(step, env, context) {
  const started = Date.now();
  const result = spawnSync(bash(), ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
    cwd: context.workspace,
    env: {
      ...process.env,
      ...env,
      GITHUB_WORKSPACE: context.workspace,
      GITHUB_STEP_SUMMARY: context.summary,
      CI: 'true',
    },
    stdio: 'inherit',
  });
  return { ok: result.status === 0, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

function uploadArtifact(step, context) {
  const name = step.with?.name ?? 'artifact';
  const target = join(context.outDir, 'artifacts', name);
  const paths = String(step.with?.path ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let copied = 0;
  for (const path of paths) {
    const source = join(context.workspace, path);
    if (path.includes('*')) {
      // Globs of this workflow name files in one folder (run/server.log style); copy that folder's matches.
      const folder = dirname(source);
      const pattern = new RegExp(`^${path.split('/').pop().replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
      if (!existsSync(folder)) continue;
      for (const entry of readdirSafe(folder)) {
        if (pattern.test(entry)) {
          cpSync(join(folder, entry), join(target, dirname(path), entry), { recursive: true });
          copied += 1;
        }
      }
    } else if (existsSync(source)) {
      cpSync(source, join(target, path), { recursive: true });
      copied += 1;
    }
  }
  return copied;
}

function readdirSafe(folder) {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

/** Process ids listening on a TCP port (Windows only: background jobs outlive their bash parent there). */
function listeners(port) {
  if (process.platform !== 'win32') return [];
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess`,
    ],
    { encoding: 'utf8' },
  );
  return (result.stdout ?? '')
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const workflow = parse(readFileSync(join(root, options.workflow), 'utf8'));
  const outDir = join(root, 'run', 'nightly-replay');
  mkdirSync(outDir, { recursive: true });
  const nvmrc = existsSync(join(root, '.nvmrc'))
    ? readFileSync(join(root, '.nvmrc'), 'utf8').trim()
    : undefined;
  if (nvmrc && process.versions.node.split('.')[0] !== nvmrc.split('.')[0]) {
    console.log(`[replay] note: .nvmrc asks for Node ${nvmrc}, this is ${process.versions.node}`);
  }
  const order = jobOrder(workflow.jobs).filter(
    (id) => options.jobs.length === 0 || options.jobs.includes(id),
  );
  const report = {
    workflow: options.workflow,
    startedAt: new Date().toISOString(),
    node: process.versions.node,
    jobs: [],
  };
  let failed = false;
  for (const id of order) {
    const job = workflow.jobs[id];
    const context = { workspace: root, outDir, summary: join(outDir, `summary-${id}.md`) };
    writeFileSync(context.summary, '');
    const env = jobEnv(job, context, options.env);
    const state = { jobFailed: false, outcomes: {}, env };
    const steps = [];
    const before = new Set(listeners(28100));
    console.log(`\n[replay] job ${id} (${job.name ?? id})`);
    for (const [index, step] of (job.steps ?? []).entries()) {
      const label = step.name ?? step.uses ?? step.run?.split('\n')[0] ?? `step ${index + 1}`;
      if (!evaluateIf(step.if, state)) {
        steps.push({ step: label, outcome: 'skipped' });
        if (step.id) state.outcomes[step.id] = 'skipped';
        console.log(`[replay] - ${label}: skipped (if: ${step.if ?? 'success()'})`);
        continue;
      }
      if (step.uses) {
        if (step.uses.startsWith('actions/upload-artifact')) {
          const copied = uploadArtifact(step, context);
          steps.push({
            step: label,
            outcome: 'success',
            note: `${copied} path(s) copied to run/nightly-replay/artifacts`,
          });
        } else {
          steps.push({
            step: label,
            outcome: 'skipped',
            note: 'runs in this checkout with the installed Node',
          });
        }
        console.log(`[replay] - ${label}: ${steps.at(-1).note}`);
        continue;
      }
      if (options.skipInstall && /^npm ci\s*$/.test(step.run.trim())) {
        steps.push({ step: label, outcome: 'skipped', note: '--skip-install' });
        console.log(`[replay] - ${label}: skipped (--skip-install)`);
        continue;
      }
      console.log(`[replay] > ${label}`);
      const stepEnv = {};
      for (const [name, value] of Object.entries(step.env ?? {})) stepEnv[name] = expand(value, context);
      const { ok, seconds } = runStep(step, { ...env, ...stepEnv, ...options.env }, context);
      const outcome = ok ? 'success' : 'failure';
      if (step.id) state.outcomes[step.id] = outcome;
      if (!ok && !step['continue-on-error']) state.jobFailed = true;
      steps.push({
        step: label,
        outcome,
        seconds,
        ...(step['continue-on-error'] ? { continueOnError: true } : {}),
      });
      console.log(`[replay] < ${label}: ${outcome} in ${seconds} s`);
    }
    // On Windows `kill` of a bash job does not stop the node process npm started; stop what the job left.
    for (const pid of listeners(28100).filter((pid) => !before.has(pid))) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      console.log(`[replay] stopped process ${pid}, left listening on 28100 by job ${id}`);
    }
    report.jobs.push({ job: id, outcome: state.jobFailed ? 'failure' : 'success', steps });
    console.log(`[replay] job ${id}: ${state.jobFailed ? 'FAILED' : 'succeeded'}`);
    if (state.jobFailed) failed = true;
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `\n[replay] wrote run/nightly-replay/result.json: ${failed ? 'a job failed' : 'every job succeeded'}`,
  );
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`[replay] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
