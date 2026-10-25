// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The metrics in the Prometheus text exposition format (version 0.0.4), for `GET /metrics`. Every
 * figure is recomputed from stored runs on each scrape, so all series are gauges or summaries over
 * the whole history rather than counters; durations are in seconds as Prometheus conventions ask.
 */
import type { DurationStats, Metrics } from '@inji-playground/protocol';

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

type Labels = Record<string, string>;

/** Escapes a label value: backslash, double quote and line feed (exposition format rules). */
function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function labelText(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
}

class Exposition {
  readonly #lines: string[] = [];

  family(name: string, type: 'gauge' | 'summary', help: string): void {
    this.#lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  }

  sample(name: string, labels: Labels, value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    this.#lines.push(`${name}${labelText(labels)} ${value}`);
  }

  /** A summary from duration statistics in milliseconds: p50, p95, sum and count, in seconds. */
  summary(name: string, labels: Labels, stats: DurationStats): void {
    this.sample(name, { ...labels, quantile: '0.5' }, seconds(stats.p50Ms));
    this.sample(name, { ...labels, quantile: '0.95' }, seconds(stats.p95Ms));
    this.sample(`${name}_sum`, labels, seconds(stats.sumMs));
    this.sample(`${name}_count`, labels, stats.count);
  }

  toString(): string {
    return `${this.#lines.join('\n')}\n`;
  }
}

function seconds(ms: number | null): number | null {
  return ms === null ? null : ms / 1000;
}

export function renderPrometheus(metrics: Metrics): string {
  const out = new Exposition();

  out.family('playground_runs', 'gauge', 'Finished runs in the stored history, by verdict.');
  out.sample('playground_runs', { verdict: 'pass' }, metrics.verdicts.pass);
  out.sample('playground_runs', { verdict: 'fail' }, metrics.verdicts.fail);
  out.sample('playground_runs', { verdict: 'error' }, metrics.verdicts.error);
  out.sample('playground_runs', { verdict: 'not-supported' }, metrics.verdicts.notSupported);

  out.family('playground_success_ratio', 'gauge', 'Passed runs / (pass + fail + error) runs.');
  out.sample('playground_success_ratio', {}, metrics.successRate);

  out.family(
    'playground_step_success_ratio',
    'gauge',
    'Steps that finished ok / steps that ran, per protocol step.',
  );
  for (const step of metrics.steps)
    out.sample('playground_step_success_ratio', { step: step.step }, step.successRate);
  out.family('playground_step_duration_seconds', 'summary', 'Duration of each protocol step that ran.');
  for (const step of metrics.steps)
    out.summary('playground_step_duration_seconds', { step: step.step }, step.duration);

  out.family(
    'playground_pair_success_ratio',
    'gauge',
    'Completed phases / attempted phases, per role pair (issuance: issuer to wallet; presentation: wallet to verifier).',
  );
  for (const pair of metrics.pairs)
    out.sample(
      'playground_pair_success_ratio',
      { phase: pair.phase, from: pair.from, to: pair.to },
      pair.successRate,
    );
  out.family(
    'playground_pair_duration_seconds',
    'summary',
    'Duration of a phase (sum of its steps), per role pair.',
  );
  for (const pair of metrics.pairs)
    out.summary(
      'playground_pair_duration_seconds',
      { phase: pair.phase, from: pair.from, to: pair.to },
      pair.duration,
    );

  out.family(
    'playground_flow_success_ratio',
    'gauge',
    'Passed / attempted runs per issuer, wallet, verifier and format.',
  );
  for (const flow of metrics.flows)
    out.sample(
      'playground_flow_success_ratio',
      { issuer: flow.issuer, wallet: flow.wallet, verifier: flow.verifier, format: flow.format },
      flow.successRate,
    );
  out.family(
    'playground_flow_duration_seconds',
    'summary',
    'Duration of attempted runs (sum of their steps) per issuer, wallet, verifier and format.',
  );
  for (const flow of metrics.flows)
    out.summary(
      'playground_flow_duration_seconds',
      { issuer: flow.issuer, wallet: flow.wallet, verifier: flow.verifier, format: flow.format },
      flow.duration,
    );

  out.family(
    'playground_credential_bytes',
    'gauge',
    'Size of the newest issued credential, per issuer and format.',
  );
  for (const size of metrics.credentialSizes)
    out.sample(
      'playground_credential_bytes',
      { issuer: size.issuer, format: size.format },
      size.latest.bytes,
    );
  out.family(
    'playground_credential_pixelpass_chars',
    'gauge',
    'PixelPass QR text length of the newest issued credential, per issuer and format.',
  );
  for (const size of metrics.credentialSizes)
    out.sample(
      'playground_credential_pixelpass_chars',
      { issuer: size.issuer, format: size.format },
      size.latest.pixelpassChars,
    );
  out.family(
    'playground_credential_fits_qr_v40',
    'gauge',
    '1 when the newest credential fits a version 40 QR code at level L, else 0.',
  );
  for (const size of metrics.credentialSizes)
    out.sample(
      'playground_credential_fits_qr_v40',
      { issuer: size.issuer, format: size.format },
      size.latest.fitsQrV40 ? 1 : 0,
    );

  return out.toString();
}
