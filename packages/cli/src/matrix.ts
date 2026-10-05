/**
 * Runs the cells of a spec one after the other against a playground server and compares each verdict
 * and outcome with what the spec expects. Cells run in spec order: `vp-replay` cells rely on an earlier
 * happy cell with the same verifier, format and profile.
 */
import type { Outcome, RunExport, ScenarioSpec, Verdict } from '@inji-playground/protocol';
import type { PlaygroundClient } from './client.js';
import type { LoadedSpec, MatrixCase } from './spec.js';

/** Live specs must finish within this budget, stack start included (STATUS.md, WP-15). */
export const LIVE_BUDGET_SECONDS = 20 * 60;
/** Seconds per cell assumed before anything was measured. */
export const DEFAULT_CELL_SECONDS = { reference: 2, live: 60 } as const;

export interface CellResult {
  case: MatrixCase;
  /** Outcome the spec expects (the case's, else the scenario's). */
  expected: Outcome;
  runId?: string;
  outcome?: Outcome;
  verdict?: Verdict;
  /** The verdict and the outcome are what the spec says. */
  matches: boolean;
  durationMs: number;
  error?: { step?: string; code: string; message: string };
  credentialProof?: string;
  /** Versions of the three roles as the run's report recorded them. */
  versions?: { issuer: string; wallet: string; verifier: string };
}

export interface MatrixResult {
  spec: { name: string; source: string; mode: LoadedSpec['mode']; description?: string };
  server: { url: string; version: string; reference: boolean };
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Version of every role a cell used, by role id. */
  roles: Record<string, { name: string; version: string; ecosystem: string }>;
  totals: {
    cells: number;
    matched: number;
    mismatched: number;
    pass: number;
    fail: number;
    error: number;
    notSupported: number;
  };
  cells: CellResult[];
}

export interface Estimate {
  cells: number;
  secondsPerCell: number;
  totalSeconds: number;
  /** Where the per-cell time came from. */
  basis: 'measured' | 'spec' | 'default';
}

/**
 * Duration estimate: cells x the last measured mean cell time (a previous matrix.json for the same
 * mode), else the spec's `cellSeconds`, else the default for the mode.
 */
export function estimateDuration(
  spec: LoadedSpec,
  previous?: Pick<MatrixResult, 'cells' | 'spec'>,
): Estimate {
  const measured =
    previous && previous.spec.mode === spec.mode && previous.cells.length > 0
      ? previous.cells.reduce((sum, cell) => sum + cell.durationMs, 0) / previous.cells.length / 1000
      : undefined;
  const [secondsPerCell, basis]: [number, Estimate['basis']] =
    measured !== undefined
      ? [measured, 'measured']
      : spec.cellSeconds !== undefined
        ? [spec.cellSeconds, 'spec']
        : [DEFAULT_CELL_SECONDS[spec.mode], 'default'];
  return {
    cells: spec.cases.length,
    secondsPerCell,
    totalSeconds: spec.cases.length * secondsPerCell,
    basis,
  };
}

/** A reason to refuse the spec before running it, or `undefined`. */
export function budgetProblem(spec: LoadedSpec, estimate: Estimate, force: boolean): string | undefined {
  if (spec.mode !== 'live' || force || estimate.totalSeconds <= LIVE_BUDGET_SECONDS) return undefined;
  return `the live spec "${spec.name}" is estimated at ${formatSeconds(estimate.totalSeconds)} (${estimate.cells} cells x ${estimate.secondsPerCell.toFixed(1)} s), over the ${LIVE_BUDGET_SECONDS / 60}-minute budget; split it, or pass --force`;
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

export interface RunMatrixOptions {
  /** Per-cell wait; default 2 minutes for reference specs, 10 minutes for live ones. */
  cellTimeoutMs?: number;
  /** Called after each cell, for progress output. */
  onCell?: (result: CellResult, index: number, total: number) => void;
  /** Receives each cell's redacted export (to write it next to the matrix). */
  onExport?: (result: CellResult, exported: RunExport) => Promise<void> | void;
  now?: () => Date;
  server: { reference: boolean };
}

export async function runMatrix(
  spec: LoadedSpec,
  client: PlaygroundClient,
  options: RunMatrixOptions,
): Promise<MatrixResult> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const version = await client.version();
  const [roles, scenarios] = await Promise.all([client.roles(), client.scenarios()]);
  const scenarioById = new Map<string, ScenarioSpec>(scenarios.map((scenario) => [scenario.id, scenario]));
  const cellTimeoutMs = options.cellTimeoutMs ?? (spec.mode === 'live' ? 600_000 : 120_000);

  const cells: CellResult[] = [];
  for (const [index, entry] of spec.cases.entries()) {
    const expected = entry.expected ?? scenarioById.get(entry.scenario)?.expected ?? 'VALID';
    const cellStart = Date.now();
    let result: CellResult;
    try {
      const runId = await client.startRun({
        issuer: entry.issuer,
        wallet: entry.wallet,
        verifier: entry.verifier,
        format: entry.format,
        vciProfile: entry.vciProfile,
        vpProfile: entry.vpProfile,
        scenario: entry.scenario,
      });
      const run = await client.waitForRun(runId, cellTimeoutMs);
      const report = run.report!;
      result = {
        case: entry,
        expected,
        runId,
        outcome: report.outcome,
        verdict: report.verdict,
        // A pass means the outcome was the expected one, so the outcome is compared only then.
        matches:
          report.verdict === entry.verdict && (entry.verdict !== 'pass' || report.outcome === expected),
        durationMs: Date.now() - cellStart,
        ...(report.error ? { error: report.error } : {}),
        credentialProof: report.credentialProof,
        versions: {
          issuer: report.issuer.version,
          wallet: report.wallet.version,
          verifier: report.verifier.version,
        },
      };
      if (options.onExport) await options.onExport(result, await client.exportRun(runId));
    } catch (error) {
      result = {
        case: entry,
        expected,
        matches: false,
        durationMs: Date.now() - cellStart,
        error: { code: 'cli.cell-failed', message: error instanceof Error ? error.message : String(error) },
      };
    }
    cells.push(result);
    options.onCell?.(result, index, spec.cases.length);
  }

  const used = new Set(spec.cases.flatMap((entry) => [entry.issuer, entry.wallet, entry.verifier]));
  const roleVersions: MatrixResult['roles'] = {};
  for (const role of roles) {
    if (!used.has(role.descriptor.id)) continue;
    roleVersions[role.descriptor.id] = {
      name: role.descriptor.name,
      version: role.descriptor.version,
      ecosystem: role.descriptor.ecosystem,
    };
  }
  const count = (verdict: Verdict) => cells.filter((cell) => cell.verdict === verdict).length;
  const finished = now();
  return {
    spec: {
      name: spec.name,
      source: spec.source,
      mode: spec.mode,
      ...(spec.description ? { description: spec.description } : {}),
    },
    server: { url: client.baseUrl, version, reference: options.server.reference },
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    roles: roleVersions,
    totals: {
      cells: cells.length,
      matched: cells.filter((cell) => cell.matches).length,
      mismatched: cells.filter((cell) => !cell.matches).length,
      pass: count('pass'),
      fail: count('fail'),
      error: count('error'),
      notSupported: count('not-supported'),
    },
    cells,
  };
}

/** Process exit code for a finished matrix: 0 when every cell matched its spec, else 1. */
export function exitCodeFor(result: Pick<MatrixResult, 'totals'>): number {
  return result.totals.mismatched === 0 ? 0 : 1;
}
