#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * `npm run test:report`: runs the test suites and writes the dated test report, docs/test-report/README.md
 * (with the numbers in docs/test-report/results.json), and THIRD_PARTY_LICENSES.md.
 *
 *   npm run test:report                    unit and integration tests of every package (no Docker), licences
 *   npm run test:report -- --e2e           also the Playwright browser tests in reference mode
 *   npm run test:report -- --live          also: start the Inji stack (timed), measure its memory, run the
 *                                          live tests, stop the stack
 *   npm run test:report -- --all           all of the above
 *
 * Each section keeps the date it was measured on: a section that is not run this time keeps its numbers
 * from results.json. Matrix results come from docs/interop-report/ as the matrix commands wrote them.
 * Exit code 1 when a suite fails or a shipped licence is not OSI-approved.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { release, type as osType } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLicenses, countByLicense, renderThirdPartyLicenses } from './lib/licenses.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const all = args.has('--all');
const withE2e = all || args.has('--e2e');
const withLive = all || args.has('--live');
const reportDir = join(root, 'docs', 'test-report');
const resultsFile = join(reportDir, 'results.json');
const work = join(process.env.PLAYGROUND_RUN_DIR ?? join(root, 'run'), 'test-report');

const log = (line) => console.log(`[test-report] ${line}`);
const now = () => new Date().toISOString();

function run(command, commandArgs, { env = {}, capture = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, NODE_NO_WARNINGS: '1', ...env },
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

const vitestCli = join(root, 'node_modules', 'vitest', 'vitest.mjs');

/** Vitest JSON results grouped by workspace (packages/<name>/ or deploy/). */
function vitestSummary(file, started) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const groups = new Map();
  for (const result of json.testResults ?? []) {
    const path = relative(root, result.name).replace(/\\/g, '/');
    const group = path.startsWith('packages/') ? path.split('/')[1] : path.split('/')[0];
    const entry = groups.get(group) ?? {
      files: 0,
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    };
    entry.files += 1;
    for (const assertion of result.assertionResults ?? []) {
      entry.tests += 1;
      if (assertion.status === 'passed') entry.passed += 1;
      else if (assertion.status === 'failed') entry.failed += 1;
      else entry.skipped += 1;
    }
    entry.durationMs += Math.max(0, (result.endTime ?? 0) - (result.startTime ?? 0));
    groups.set(group, entry);
  }
  const packages = Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)));
  const totals = Object.values(packages).reduce(
    (sum, entry) => ({
      files: sum.files + entry.files,
      tests: sum.tests + entry.tests,
      passed: sum.passed + entry.passed,
      failed: sum.failed + entry.failed,
      skipped: sum.skipped + entry.skipped,
    }),
    { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0 },
  );
  return {
    measuredAt: started,
    wallSeconds: Math.round((Date.now() - Date.parse(started)) / 1000),
    packages,
    totals,
  };
}

function runVitest(project, name) {
  const output = join(work, `${name}.json`);
  rmSync(output, { force: true });
  const started = now();
  const projectArgs = project === 'live' ? ['--project', 'live'] : ['--project', '!live'];
  log(`vitest ${projectArgs.join(' ')}`);
  const { status } = run(process.execPath, [
    vitestCli,
    'run',
    ...projectArgs,
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${output}`,
  ]);
  if (!existsSync(output)) throw new Error(`vitest wrote no results (exit ${status})`);
  return { status, summary: vitestSummary(output, started) };
}

function runPlaywright() {
  const output = join(work, 'playwright.json');
  rmSync(output, { force: true });
  const started = now();
  log('npm run e2e (Playwright, reference mode)');
  const { status } = run(process.execPath, [join(root, 'scripts', 'e2e.mjs'), '--reporter=list,json'], {
    env: { PLAYWRIGHT_JSON_OUTPUT_NAME: output },
  });
  if (!existsSync(output)) throw new Error(`Playwright wrote no results (exit ${status})`);
  const stats = JSON.parse(readFileSync(output, 'utf8')).stats ?? {};
  return {
    status,
    summary: {
      measuredAt: started,
      tests: (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0) + (stats.skipped ?? 0),
      passed: stats.expected ?? 0,
      failed: stats.unexpected ?? 0,
      flaky: stats.flaky ?? 0,
      skipped: stats.skipped ?? 0,
      durationSeconds: Math.round((stats.duration ?? 0) / 1000),
    },
  };
}

/** Memory of the stack's containers from `docker stats`, in MiB. */
function stackMemory() {
  const { status, stdout } = run('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.MemUsage}}'], {
    capture: true,
  });
  if (status !== 0) return undefined;
  const units = { B: 1 / 1024 ** 2, KiB: 1 / 1024, MiB: 1, GiB: 1024, kB: 1 / 1024, MB: 1, GB: 1024 };
  const containers = {};
  for (const line of stdout.split('\n')) {
    const [name, usage] = line.split('\t');
    if (!name?.startsWith('ps02-inji-') || !usage) continue;
    const match = /^([\d.]+)\s*([A-Za-z]+)/.exec(usage.trim());
    if (!match) continue;
    containers[name.replace(/^ps02-inji-/, '').replace(/-1$/, '')] = Math.round(
      Number(match[1]) * (units[match[2]] ?? 1),
    );
  }
  const totalMiB = Object.values(containers).reduce((sum, value) => sum + value, 0);
  return { containers, totalMiB };
}

function runLive() {
  const started = now();
  log('npm run stack:up (timed)');
  const upStart = Date.now();
  const up = run(process.execPath, [join(root, 'deploy', 'inji-stack', 'scripts', 'stack.mjs'), 'up']);
  const stack = {
    measuredAt: started,
    startSeconds: Math.round((Date.now() - upStart) / 1000),
    upStatus: up.status,
  };
  if (up.status !== 0) {
    run(process.execPath, [join(root, 'deploy', 'inji-stack', 'scripts', 'stack.mjs'), 'down']);
    return { status: up.status, stack };
  }
  try {
    const tests = runVitest('live', 'live');
    stack.memory = stackMemory();
    stack.memoryMeasuredAfter = 'the live tests';
    return { status: tests.status, stack, live: tests.summary };
  } finally {
    log('npm run stack:down');
    run(process.execPath, [join(root, 'deploy', 'inji-stack', 'scripts', 'stack.mjs'), 'down']);
  }
}

/** Matrix results as the matrix commands wrote them (reference, and every live spec folder). */
function matrices() {
  const found = [];
  const read = (file, label) => {
    if (!existsSync(file)) return;
    const result = JSON.parse(readFileSync(file, 'utf8'));
    found.push({
      label,
      page: relative(reportDir, file.replace(/\.json$/, '.md')).replace(/\\/g, '/'),
      spec: result.spec.name,
      date: result.startedAt,
      totals: result.totals,
    });
  };
  read(join(root, 'docs', 'interop-report', 'reference', 'matrix.json'), 'reference (no Docker)');
  const live = join(root, 'docs', 'interop-report', 'live');
  if (existsSync(live)) {
    for (const entry of readdirSync(live, { withFileTypes: true }).filter((item) => item.isDirectory()))
      read(join(live, entry.name, 'matrix.json'), 'live (Inji stack)');
  }
  return found;
}

function commitOf() {
  const { stdout } = run('git', ['rev-parse', '--short', 'HEAD'], { capture: true });
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], {
    capture: true,
  }).stdout.trim();
  return `${stdout.trim()}${dirty ? ' (with uncommitted changes)' : ''}`;
}

// Calendar dates in the time zone of the machine that ran the commands (the header names it), so a run late
// in the evening in India is dated the day the team ran it, not the UTC day.
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '-');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const md = (text) => String(text).replace(/\|/g, '\\|');

function render(results) {
  const lines = [
    '# Test report',
    '',
    `Generated on ${day(results.generatedAt)} by \`npm run test:report\` at commit \`${results.commit}\` (${results.environment}, dates in ${timeZone}). Every number below was measured by the command named next to it, on the date given; nothing is estimated.`,
    '',
    '## Summary',
    '',
    '| Suite | Measured on | Tests | Passed | Failed | Skipped |',
    '| ----- | ----------- | ----- | ------ | ------ | ------- |',
  ];
  const unit = results.unit;
  if (unit)
    lines.push(
      `| Unit and integration (\`npm test\`) | ${day(unit.measuredAt)} | ${unit.totals.tests} | ${unit.totals.passed} | ${unit.totals.failed} | ${unit.totals.skipped} |`,
    );
  const e2e = results.e2e;
  lines.push(
    e2e
      ? `| Browser, reference mode (\`npm run e2e\`) | ${day(e2e.measuredAt)} | ${e2e.tests} | ${e2e.passed} | ${e2e.failed} | ${e2e.skipped} |`
      : '| Browser, reference mode (`npm run e2e`) | not measured yet | - | - | - | - |',
  );
  const live = results.live;
  lines.push(
    live
      ? `| Live against the Inji stack (\`npm run test:live\`) | ${day(live.measuredAt)} | ${live.totals.tests} | ${live.totals.passed} | ${live.totals.failed} | ${live.totals.skipped} |`
      : '| Live against the Inji stack (`npm run test:live`) | not measured yet | - | - | - | - |',
  );
  if (unit) {
    lines.push(
      '',
      `## Unit and integration tests per package`,
      '',
      `\`npm test\` on ${day(unit.measuredAt)}: ${unit.totals.files} files in ${unit.wallSeconds} s.`,
      '',
      '| Package | Files | Tests | Passed | Failed | Skipped |',
      '| ------- | ----- | ----- | ------ | ------ | ------- |',
      ...Object.entries(unit.packages).map(
        ([name, entry]) =>
          `| ${name} | ${entry.files} | ${entry.tests} | ${entry.passed} | ${entry.failed} | ${entry.skipped} |`,
      ),
    );
  }
  if (live) {
    lines.push(
      '',
      '## Live tests',
      '',
      `\`npm run test:live\` on ${day(live.measuredAt)} against a stack started for it, in ${live.wallSeconds} s.`,
      '',
      '| Group | Files | Tests | Passed | Failed |',
      '| ----- | ----- | ----- | ------ | ------ |',
      ...Object.entries(live.packages).map(
        ([name, entry]) =>
          `| ${name} | ${entry.files} | ${entry.tests} | ${entry.passed} | ${entry.failed} |`,
      ),
    );
  }
  if (e2e) {
    lines.push(
      '',
      '## Browser tests',
      '',
      `\`npm run e2e\` on ${day(e2e.measuredAt)} (Chromium, server in reference mode): ${e2e.passed} of ${e2e.tests} passed${e2e.flaky ? `, ${e2e.flaky} flaky` : ''} in ${e2e.durationSeconds} s. They include axe accessibility checks (WCAG 2.1 A and AA) on every page they open.`,
    );
  }
  const found = results.matrices ?? [];
  lines.push('', '## Compatibility matrices', '');
  if (found.length === 0)
    lines.push('No matrix has been written yet (`npm run matrix:reference`, `npm run matrix:live`).');
  else {
    lines.push(
      '| Matrix | Spec | Run on | Cells | As specified | Pass | Fail | Error | Not supported |',
      '| ------ | ---- | ------ | ----- | ------------ | ---- | ---- | ----- | ------------- |',
      ...found.map(
        (entry) =>
          `| ${entry.label} | [${md(entry.spec)}](${entry.page}) | ${day(entry.date)} | ${entry.totals.cells} | ${entry.totals.matched} | ${entry.totals.pass} | ${entry.totals.fail} | ${entry.totals.error} | ${entry.totals.notSupported} |`,
      ),
      '',
      'A live cell whose spec expects `fail` is blocked by a gap in an Inji module; the spec names the gap and [docs/gaps/gaps.json](../gaps/gaps.json) describes it.',
    );
  }
  const stack = results.stack;
  lines.push('', '## Inji stack: start time and memory', '');
  if (!stack) lines.push('Not measured yet (`npm run test:report -- --live`).');
  else {
    lines.push(
      `Measured on ${day(stack.measuredAt)}: \`npm run stack:up\` with every profile took ${stack.startSeconds} s until every service answered (images already pulled).`,
    );
    if (stack.memory) {
      lines.push(
        '',
        `Memory after ${stack.memoryMeasuredAfter} (\`docker stats\`): ${(stack.memory.totalMiB / 1024).toFixed(2)} GiB in total.`,
        '',
        '| Container | MiB |',
        '| --------- | --- |',
        ...Object.entries(stack.memory.containers)
          .sort(([, a], [, b]) => b - a)
          .map(([name, mib]) => `| ${name} | ${mib} |`),
      );
    }
  }
  const licenses = results.licenses;
  lines.push(
    '',
    '## Licence audit',
    '',
    `Checked on ${day(licenses.measuredAt)} (\`scripts/lib/licenses.mjs\`; the full list is in [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md)). ${licenses.failures.length === 0 ? 'Every shipped licence is OSI-approved.' : `**${licenses.failures.length} shipped licences are not OSI-approved.**`}`,
    '',
    `- npm packages in the playground image: ${licenses.production}, under ${licenses.byLicense.map(([license, count]) => `${license} (${count})`).join(', ')}.`,
    `- Container images of the Inji stack: ${licenses.images.map((entry) => `${entry.image.split(':')[0]} (${entry.license})`).join(', ')}.`,
    `- Development-only packages (not distributed): ${licenses.developmentOnly}${licenses.developmentOnlyNotOsi.length ? `; not OSI-approved among them: ${licenses.developmentOnlyNotOsi.join(', ')} (data files used by build tools)` : ''}.`,
  );
  if (licenses.failures.length)
    lines.push('', ...licenses.failures.map((failure) => `- Not OSI-approved: ${failure}`));
  lines.push('');
  return lines.join('\n');
}

function main() {
  // Read before anything is written: the report's own files would otherwise mark the tree as changed.
  const commit = commitOf();
  mkdirSync(work, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  const previous = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
  const results = { ...previous };
  let failed = false;

  const unit = runVitest('unit', 'unit');
  results.unit = unit.summary;
  failed ||= unit.status !== 0 || unit.summary.totals.failed > 0;

  if (withE2e) {
    const e2e = runPlaywright();
    results.e2e = e2e.summary;
    failed ||= e2e.status !== 0 || e2e.summary.failed > 0;
  }
  if (withLive) {
    const live = runLive();
    results.stack = live.stack;
    if (live.live) results.live = live.live;
    failed ||= live.status !== 0;
  }

  log('licence audit');
  const audit = auditLicenses(root);
  results.licenses = {
    measuredAt: now(),
    production: audit.production.length,
    byLicense: countByLicense(audit.production),
    images: audit.images.map(({ image, license }) => ({ image, license })),
    developmentOnly: audit.developmentOnly.length,
    developmentOnlyNotOsi: audit.developmentOnly
      .filter((entry) => !entry.osi)
      .map((entry) => `${entry.name} (${entry.license})`),
    failures: audit.failures,
  };
  failed ||= audit.failures.length > 0;
  writeFileSync(
    join(root, 'THIRD_PARTY_LICENSES.md'),
    renderThirdPartyLicenses(audit, day(results.licenses.measuredAt)),
  );

  results.matrices = matrices();
  results.generatedAt = now();
  results.commit = commit;
  results.environment = `${osType()} ${release()}, Node ${process.versions.node}`;
  writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(reportDir, 'README.md'), render(results));
  log(
    `wrote ${relative(root, join(reportDir, 'README.md'))}, ${relative(root, resultsFile)} and THIRD_PARTY_LICENSES.md`,
  );
  log(failed ? 'FAILED: see the sections above' : 'every suite passed');
  return failed ? 1 : 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`[test-report] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
