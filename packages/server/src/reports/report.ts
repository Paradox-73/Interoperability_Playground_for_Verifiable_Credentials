/**
 * The interoperability report of one run (problem statement task 7) as a JSON document and as
 * Markdown. Both are built from the stored report and the recorded exchanges, so a report can be
 * produced again at any time and always matches what the run recorded.
 */
import {
  STEP_INFO,
  type InteropReport,
  type RecordedExchange,
  type ReportExchangeRef,
  type ReportStep,
  type RunDetail,
  type RunReportDocument,
  type StepId,
} from '@inji-playground/protocol';
import { Redactor } from './redact.js';

/** Paths of a run's resources; the UI path is the run page with the exchange selected. */
export function runLinks(runId: string): RunReportDocument['links'] {
  const id = encodeURIComponent(runId);
  return {
    run: `/api/runs/${id}`,
    exchanges: `/api/runs/${id}/exchanges`,
    markdown: `/api/runs/${id}/report.md`,
    export: `/api/runs/${id}/export`,
    ui: `/runs/${id}`,
  };
}

function exchangeRef(runId: string, exchange: RecordedExchange): ReportExchangeRef {
  const links = runLinks(runId);
  const exchangeId = encodeURIComponent(exchange.id);
  return {
    id: exchange.id,
    seq: exchange.seq,
    method: exchange.request.method,
    // The URL may carry a code or token in its query; reports are meant to be shared.
    url: new Redactor().url(exchange.request.url),
    ...(exchange.response ? { status: exchange.response.status } : {}),
    ...(exchange.error ? { error: exchange.error } : {}),
    apiLink: `${links.exchanges}#${exchangeId}`,
    uiLink: `${links.ui}?exchange=${exchangeId}`,
  };
}

function stepLabel(step: StepId): string {
  return STEP_INFO[step].label;
}

/**
 * Builds the report document of a finished run. `exchanges` are the run's recorded exchanges; the one
 * the error names is summarised with a link into the inspector. When the error names no exchange,
 * the last exchange of the failing step that got an error status (or no response) is used, so a
 * reader still lands on the evidence.
 */
export function buildReportDocument(
  run: RunDetail & { report: InteropReport },
  exchanges: readonly RecordedExchange[],
  playgroundVersion: string,
  now: Date = new Date(),
): RunReportDocument {
  const { report } = run;
  const steps: ReportStep[] = report.steps.map((summary) => {
    const info = STEP_INFO[summary.step];
    return {
      step: summary.step,
      label: info.label,
      protocolTerm: info.protocolTerm,
      status: summary.status,
      durationMs: summary.durationMs,
      ...(summary.startedAt ? { startedAt: summary.startedAt } : {}),
      ...(info.spec ? { spec: info.spec } : {}),
    };
  });

  let error: RunReportDocument['error'];
  if (report.error) {
    const exchange = findErrorExchange(report.error, exchanges);
    error = {
      ...report.error,
      ...(exchange && !report.error.exchangeId ? { exchangeId: exchange.id } : {}),
      stepLabel: stepLabel(report.error.step),
      ...(exchange ? { exchange: exchangeRef(report.runId, exchange) } : {}),
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    report,
    run: {
      status: run.status,
      ...(run.startedAt ? { startedAt: run.startedAt } : {}),
      ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
      totalStepMs: round(report.steps.reduce((sum, step) => sum + step.durationMs, 0)),
    },
    versions: {
      issuer: report.issuer.version,
      wallet: report.wallet.version,
      verifier: report.verifier.version,
      playground: playgroundVersion,
    },
    steps,
    ...(error ? { error } : {}),
    ...(report.credentialSize ? { credentialSize: report.credentialSize } : {}),
    links: runLinks(report.runId),
  };
}

function findErrorExchange(
  error: NonNullable<InteropReport['error']>,
  exchanges: readonly RecordedExchange[],
): RecordedExchange | undefined {
  if (error.exchangeId) return exchanges.find((exchange) => exchange.id === error.exchangeId);
  const ofStep = exchanges.filter((exchange) => exchange.step === error.step);
  return [...ofStep]
    .reverse()
    .find((exchange) => exchange.error !== undefined || (exchange.response?.status ?? 0) >= 400);
}

// -----------------------------------------------------------------------------------------------------
// Markdown

const VERDICT_TEXT: Record<InteropReport['verdict'], string> = {
  pass: 'PASS',
  fail: 'FAIL',
  error: 'ERROR (nothing learned about interoperability)',
  'not-supported': 'NOT SUPPORTED',
};

/** Escapes text for a Markdown table cell: pipes split cells and newlines end the row. */
export function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function role(ref: InteropReport['issuer']): string {
  return `${ref.name} (\`${ref.id}\`, ${ref.version}, ${ref.ecosystem})`;
}

/**
 * Renders the report as Markdown: the task 7 fields first (issuer, wallet, verifier, format, proof
 * type, outcome, error detail), then versions, steps with timings, credential size and links.
 */
export function renderReportMarkdown(doc: RunReportDocument): string {
  const { report } = doc;
  const lines: string[] = [];
  lines.push(`# Interoperability report: run ${report.runId}`);
  lines.push('');
  lines.push(
    `Generated ${doc.generatedAt} by the Inji Interoperability Playground ${doc.versions.playground}. Run created ${report.createdAt} (${report.mode} mode).`,
  );
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  const rows: Array<[string, string]> = [
    ['Issuer', role(report.issuer)],
    ['Wallet', role(report.wallet)],
    ['Verifier', role(report.verifier)],
    ['Format', `\`${report.format}\``],
    ['Proof type', report.credentialProof],
    ['Holder proof', report.holderProof ?? 'none recorded'],
    ['Outcome', `${report.outcome} (expected ${report.scenario.expected})`],
    ['Verdict', VERDICT_TEXT[report.verdict]],
    ['Error detail', doc.error ? `\`${doc.error.code}\` at ${doc.error.step}: ${doc.error.message}` : 'none'],
    ['Scenario', `\`${report.scenario.id}\``],
    ['Protocols', `OpenID4VCI ${report.vciProfile}, OpenID4VP ${report.vpProfile}`],
  ];
  if (report.issuerDid) rows.push(['Issuer DID', `\`${report.issuerDid}\``]);
  if (report.replayOf) rows.push(['Replay of', `\`${report.replayOf}\``]);
  for (const [field, value] of rows) lines.push(`| ${field} | ${cell(value)} |`);

  if (doc.error) {
    lines.push('');
    lines.push('## Error detail');
    lines.push('');
    lines.push(`- Step: ${doc.error.stepLabel} (\`${doc.error.step}\`)`);
    lines.push(`- Code: \`${doc.error.code}\``);
    lines.push(`- Message: ${doc.error.message}`);
    const exchange = doc.error.exchange;
    if (exchange) {
      const answer =
        exchange.status !== undefined ? `HTTP ${exchange.status}` : (exchange.error ?? 'no response');
      lines.push(`- Exchange #${exchange.seq}: \`${exchange.method} ${exchange.url}\` -> ${answer}`);
      lines.push(
        `- Inspect: [${exchange.uiLink}](${exchange.uiLink}), raw: [${exchange.apiLink}](${exchange.apiLink})`,
      );
    }
  }

  lines.push('');
  lines.push('## Versions');
  lines.push('');
  lines.push('| Component | Version |');
  lines.push('|---|---|');
  lines.push(`| ${cell(report.issuer.name)} | ${cell(doc.versions.issuer)} |`);
  lines.push(`| ${cell(report.wallet.name)} | ${cell(doc.versions.wallet)} |`);
  lines.push(`| ${cell(report.verifier.name)} | ${cell(doc.versions.verifier)} |`);
  lines.push(`| Inji Interoperability Playground | ${cell(doc.versions.playground)} |`);

  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| # | Step | Protocol term | Status | Duration (ms) |');
  lines.push('|---|---|---|---|---|');
  doc.steps.forEach((step, index) => {
    lines.push(
      `| ${index + 1} | ${cell(step.label)} | ${cell(step.protocolTerm)} | ${step.status} | ${round(step.durationMs)} |`,
    );
  });
  lines.push(`|  | Total |  |  | ${doc.run.totalStepMs} |`);

  if (doc.credentialSize) {
    const size = doc.credentialSize;
    lines.push('');
    lines.push('## Credential size');
    lines.push('');
    lines.push(`- Credential as issued: ${size.bytes} bytes`);
    lines.push(
      `- PixelPass QR text: ${size.pixelpassChars} characters; ${size.fitsQrV40 ? 'fits' : 'does not fit'} a version 40 QR code (4,296 alphanumeric characters at level L)`,
    );
  }

  lines.push('');
  lines.push('## Links');
  lines.push('');
  lines.push(`- Run page: [${doc.links.ui}](${doc.links.ui})`);
  lines.push(
    `- JSON: [${doc.links.run}](${doc.links.run}), exchanges: [${doc.links.exchanges}](${doc.links.exchanges})`,
  );
  lines.push(`- Redacted export: [${doc.links.export}](${doc.links.export})`);
  lines.push('');
  return lines.join('\n');
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
