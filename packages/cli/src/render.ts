/**
 * Written forms of a matrix result: `matrix.md` (dated, with every role version, one row per cell and a
 * link to each cell's redacted run file) and JUnit XML for CI test reports.
 */
import type { CellResult, MatrixResult } from './matrix.js';
import { formatSeconds } from './matrix.js';

/** Relative path of a cell's redacted run file inside the output directory. */
export function runFileOf(cell: Pick<CellResult, 'case'>): string {
  return `runs/${cell.case.id}.json`;
}

/** Escapes a value for a Markdown table cell. */
function md(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

const VERDICT_WORD: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  error: 'Error',
  'not-supported': 'Not supported',
};

export function renderMarkdown(result: MatrixResult): string {
  const date = result.startedAt.slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Compatibility matrix: ${result.spec.name}`, '');
  const time = (iso: string) => iso.slice(11, 19);
  lines.push(
    `Run on ${date}, ${time(result.startedAt)} to ${time(result.finishedAt)} UTC (${formatSeconds(result.durationMs / 1000)}), from \`${result.spec.source}\` in ${result.spec.mode} mode, against playground server ${result.server.version}${result.server.reference ? ' started in-process with the reference roles' : ` at ${result.server.url}`}.`,
  );
  if (result.spec.description) lines.push('', result.spec.description);
  const { totals } = result;
  lines.push(
    '',
    `**${totals.matched} of ${totals.cells} cells gave the verdict their spec expects**` +
      (totals.mismatched > 0 ? ` (${totals.mismatched} did not).` : '.') +
      ` Verdicts: ${totals.pass} pass, ${totals.fail} fail, ${totals.error} error, ${totals.notSupported} not supported.`,
    '',
    '## Versions',
    '',
    '| Role | Name | Ecosystem | Version |',
    '| ---- | ---- | --------- | ------- |',
  );
  for (const [id, role] of Object.entries(result.roles).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| \`${id}\` | ${md(role.name)} | ${role.ecosystem} | ${md(role.version)} |`);
  }
  lines.push(
    '',
    '## Cells',
    '',
    '| Case | Issuer → wallet → verifier | Format | Profiles | Scenario | Expected | Actual | Verdict | Matches spec | Run |',
    '| ---- | -------------------------- | ------ | -------- | -------- | -------- | ------ | ------- | ------------ | --- |',
  );
  for (const cell of result.cells) {
    const { case: entry } = cell;
    const verdict = cell.verdict ? (VERDICT_WORD[cell.verdict] ?? cell.verdict) : 'No run';
    const expectedVerdict =
      entry.verdict === 'pass' ? '' : ` (spec: ${VERDICT_WORD[entry.verdict] ?? entry.verdict})`;
    const run = cell.runId ? `[\`${cell.runId}\`](${runFileOf(cell)})` : '-';
    lines.push(
      `| ${entry.id} | \`${entry.issuer}\` → \`${entry.wallet}\` → \`${entry.verifier}\` | ${entry.format} | ${entry.vciProfile} / ${entry.vpProfile} | ${entry.scenario} | ${cell.expected} | ${cell.outcome ?? '-'} | ${verdict}${expectedVerdict} | ${cell.matches ? 'yes' : '**no**'} | ${run} |`,
    );
  }
  lines.push(
    '',
    `The redacted record of each run (configuration, events, every HTTP exchange) is written to \`runs/<case id>.json\` next to this file. ${
      result.spec.mode === 'live'
        ? 'Live runs are kept in git with this file, so every link above opens the recorded exchanges; the nightly workflow also publishes them as a build artifact.'
        : 'Those files are not kept in git (about 5 MB per run of the reference matrix); the nightly workflow publishes them as a build artifact.'
    }`,
  );
  const notes = result.cells.filter((cell) => cell.error && (!cell.matches || cell.verdict !== 'pass'));
  if (notes.length > 0) {
    lines.push('', '## Errors and reasons', '');
    for (const cell of notes) {
      const error = cell.error!;
      lines.push(
        `- ${cell.case.id}: \`${error.code}\`${error.step ? ` at ${error.step}` : ''}: ${md(error.message)}`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

export interface IndexEntry {
  /** Folder of the spec's matrix, relative to the index (for example `live-core`). */
  dir: string;
  result: MatrixResult;
}

/**
 * One page for several matrices (the live specs run in separate stack sessions, each into its own folder):
 * a summary per spec, the versions every spec met, and every cell linked to its spec page and run file.
 */
export function renderIndex(title: string, entries: readonly IndexEntry[]): string {
  const lines: string[] = [`# ${title}`, ''];
  const sorted = [...entries].sort((a, b) => a.dir.localeCompare(b.dir));
  const dates = [...new Set(sorted.map((entry) => entry.result.startedAt.slice(0, 10)))].sort();
  lines.push(
    `Combined from ${sorted.length} spec${sorted.length === 1 ? '' : 's'}, run on ${dates.join(', ')}. Each spec ran in its own session against the Inji stack; its page has the full detail.`,
    '',
    '| Spec | Run on (UTC) | Cells | As specified | Pass | Fail | Error | Not supported | Duration |',
    '| ---- | ------------ | ----- | ------------ | ---- | ---- | ----- | ------------- | -------- |',
  );
  for (const { dir, result } of sorted) {
    const { totals } = result;
    lines.push(
      `| [${md(result.spec.name)}](${dir}/matrix.md) | ${result.startedAt.slice(0, 16).replace('T', ' ')} | ${totals.cells} | ${totals.matched}${totals.mismatched > 0 ? ` (**${totals.mismatched} differ**)` : ''} | ${totals.pass} | ${totals.fail} | ${totals.error} | ${totals.notSupported} | ${formatSeconds(result.durationMs / 1000)} |`,
    );
  }
  const roles = new Map<string, { name: string; version: string; ecosystem: string; specs: string[] }>();
  for (const { result } of sorted) {
    for (const [id, role] of Object.entries(result.roles)) {
      const key = `${id}\u0000${role.version}`;
      const known = roles.get(key);
      if (known) known.specs.push(result.spec.name);
      else roles.set(key, { ...role, specs: [result.spec.name] });
    }
  }
  lines.push(
    '',
    '## Versions',
    '',
    '| Role | Name | Ecosystem | Version | Specs |',
    '| ---- | ---- | --------- | ------- | ----- |',
  );
  for (const [key, role] of [...roles].sort(([a], [b]) => a.localeCompare(b))) {
    const id = key.split('\u0000')[0]!;
    lines.push(
      `| \`${id}\` | ${md(role.name)} | ${role.ecosystem} | ${md(role.version)} | ${role.specs.join(', ')} |`,
    );
  }
  lines.push(
    '',
    '## Cells',
    '',
    '| Spec | Case | Issuer → wallet → verifier | Format | Scenario | Expected | Actual | Verdict | Matches spec | Run |',
    '| ---- | ---- | -------------------------- | ------ | -------- | -------- | ------ | ------- | ------------ | --- |',
  );
  for (const { dir, result } of sorted) {
    for (const cell of result.cells) {
      const { case: entry } = cell;
      const verdict = cell.verdict ? (VERDICT_WORD[cell.verdict] ?? cell.verdict) : 'No run';
      const expectedVerdict =
        entry.verdict === 'pass' ? '' : ` (spec: ${VERDICT_WORD[entry.verdict] ?? entry.verdict})`;
      const run = cell.runId ? `[\`${cell.runId}\`](${dir}/${runFileOf(cell)})` : '-';
      lines.push(
        `| ${md(result.spec.name)} | ${entry.id} | \`${entry.issuer}\` → \`${entry.wallet}\` → \`${entry.verifier}\` | ${entry.format} | ${entry.scenario} | ${cell.expected} | ${cell.outcome ?? '-'} | ${verdict}${expectedVerdict} | ${cell.matches ? 'yes' : '**no**'} | ${run} |`,
      );
    }
  }
  lines.push(
    '',
    'Run files (`<spec>/runs/<case id>.json`) hold the redacted record of each run: configuration, events and every HTTP exchange. They are kept in git with the matrices; the nightly workflow also publishes them as a build artifact. Why a cell fails is under "Errors and reasons" on its spec page; the gaps are in [docs/gaps/gaps.json](../../gaps/gaps.json).',
    '',
  );
  return lines.join('\n');
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One test case per cell; a cell whose verdict differs from the spec is a failure. */
export function renderJunit(result: MatrixResult): string {
  const { totals } = result;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="inji-playground matrix" tests="${totals.cells}" failures="${totals.mismatched}" time="${(result.durationMs / 1000).toFixed(3)}">`,
    `  <testsuite name="${xml(result.spec.name)}" tests="${totals.cells}" failures="${totals.mismatched}" timestamp="${result.startedAt}" time="${(result.durationMs / 1000).toFixed(3)}">`,
  ];
  for (const cell of result.cells) {
    const { case: entry } = cell;
    const name = `${entry.id} ${entry.issuer} -> ${entry.wallet} -> ${entry.verifier} ${entry.format} ${entry.vpProfile} ${entry.scenario}`;
    const open = `    <testcase classname="${xml(result.spec.name)}" name="${xml(name)}" time="${(cell.durationMs / 1000).toFixed(3)}"`;
    if (cell.matches) {
      lines.push(`${open}/>`);
      continue;
    }
    const message = `expected verdict ${entry.verdict} (outcome ${cell.expected}), got ${cell.verdict ?? 'no run'} (outcome ${cell.outcome ?? '-'})`;
    const detail = cell.error ? `${cell.error.code}: ${cell.error.message}` : message;
    lines.push(
      `${open}>`,
      `      <failure message="${xml(message)}">${xml(detail)}</failure>`,
      '    </testcase>',
    );
  }
  lines.push('  </testsuite>', '</testsuites>', '');
  return lines.join('\n');
}
