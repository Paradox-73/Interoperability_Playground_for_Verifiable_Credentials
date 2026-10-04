/**
 * The compatibility matrix as a dated Markdown document, for `docs/interop-report/` and for pasting
 * into an issue. Results are words ("PASS", "NOT SUPPORTED"), never colour or symbols alone.
 */
import type { Matrix, MatrixCell, MatrixCellStatus } from '@inji-playground/protocol';
import { cell } from '../reports/report.js';

const STATUS_TEXT: Record<MatrixCellStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  error: 'ERROR',
  'not-supported': 'NOT SUPPORTED',
  untested: 'NOT RUN YET',
};

function detail(matrixCell: MatrixCell): string {
  const parts: string[] = [];
  const error = matrixCell.latestRun?.error;
  if (error) parts.push(`\`${error.code}\` at ${error.step}: ${error.message}`);
  for (const reason of matrixCell.reasons) parts.push(`${reason.severity}: ${reason.message}`);
  if (matrixCell.gapIds.length > 0) parts.push(`gaps: ${matrixCell.gapIds.join(', ')}`);
  return parts.join('; ');
}

export function renderMatrixMarkdown(matrix: Matrix): string {
  const lines: string[] = [];
  const { totals } = matrix;
  lines.push('# Compatibility matrix');
  lines.push('');
  lines.push(
    `Generated ${matrix.generatedAt} by the Inji Interoperability Playground ${matrix.playgroundVersion} from the newest finished run of each cell.`,
  );
  lines.push('');
  lines.push(
    `${totals.cells} cells: ${totals.pass} pass, ${totals.fail} fail, ${totals.error} error, ${totals.untested} not run yet, ${totals.notSupported} not supported.`,
  );
  lines.push('');
  lines.push('## Implementations and versions');
  lines.push('');
  lines.push('| Role | Id | Name | Version | Ecosystem |');
  lines.push('|---|---|---|---|---|');
  for (const role of matrix.roles) {
    const name = role.registered ? role.name : `${role.name} (not registered now)`;
    lines.push(
      `| ${role.kind} | \`${role.id}\` | ${cell(name)} | ${cell(role.version)} | ${role.ecosystem} |`,
    );
  }

  const results = matrix.cells.filter((entry) => entry.status !== 'not-supported' || entry.source === 'run');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  if (results.length === 0) {
    lines.push('No combination has been run or can run yet.');
  } else {
    lines.push(
      '| Issuer | Wallet | Verifier | Format | VP profile | Scenario | Result | Outcome | Proof type | Runs (pass/fail/error) | Latest run | Detail |',
    );
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const entry of results) {
      const { key, counts, latestRun } = entry;
      const runLink = latestRun
        ? `[${latestRun.runId}](/runs/${encodeURIComponent(latestRun.runId)}) ${latestRun.createdAt}`
        : '';
      lines.push(
        `| \`${key.issuer}\` | \`${key.wallet}\` | \`${key.verifier}\` | \`${key.format}\` | ${key.vpProfile} | ${key.scenario} | ${STATUS_TEXT[entry.status]} | ${latestRun?.outcome ?? ''} | ${cell(latestRun?.credentialProof ?? '')} | ${counts.runs} (${counts.pass}/${counts.fail}/${counts.error}) | ${runLink} | ${cell(detail(entry))} |`,
      );
    }
  }

  const unsupported = matrix.cells.filter(
    (entry) => entry.status === 'not-supported' && entry.source === 'compatibility',
  );
  if (unsupported.length > 0) {
    lines.push('');
    lines.push('## Not supported');
    lines.push('');
    lines.push(
      'Combinations the compatibility check rules out from the declared capabilities of the roles; they are not attempted.',
    );
    lines.push('');
    lines.push('| Issuer | Wallet | Verifier | Format | VP profile | Why |');
    lines.push('|---|---|---|---|---|---|');
    for (const entry of unsupported) {
      const { key } = entry;
      const why = entry.reasons
        .filter((reason) => reason.severity === 'blocking')
        .map((reason) => reason.message)
        .join(' ');
      lines.push(
        `| \`${key.issuer}\` | \`${key.wallet}\` | \`${key.verifier}\` | \`${key.format}\` | ${key.vpProfile} | ${cell(why || 'unknown role or scenario')} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}
