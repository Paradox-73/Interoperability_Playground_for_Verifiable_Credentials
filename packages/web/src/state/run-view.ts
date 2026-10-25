// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Turns the ordered event stream of one run into what the timeline shows: one row per step, with its
 * status and duration, plus the run's configuration and final report.
 *
 * Pure functions only, so the same code serves live runs (WebSocket), stored runs and playback.
 */
import {
  STEP_INFO,
  type InteropReport,
  type PersonAction,
  type RunConfig,
  type RunEvent,
  type SpecReference,
  type StepError,
  type StepId,
} from '@inji-playground/protocol';

export type RowStatus = 'running' | 'waiting' | 'ok' | 'failed' | 'skipped';

export interface TimelineRow {
  /** Unique within the run: a step can occur more than once (for example a retried token request). */
  key: string;
  step: StepId;
  /** Plain-language description sent by the server with `step.started`. */
  label: string;
  /** The protocol's own name for the step, shown after the label. */
  protocolTerm: string;
  spec?: SpecReference;
  status: RowStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: StepError;
  /** The person action this step is waiting for, if any. */
  personAction?: PersonAction;
}

export interface RunView {
  runId: string;
  config?: RunConfig;
  startedAt?: string;
  rows: TimelineRow[];
  /** Number of HTTP exchanges recorded so far. */
  exchangeCount: number;
  report?: InteropReport;
  finished: boolean;
}

export function emptyRunView(runId: string): RunView {
  return { runId, rows: [], exchangeCount: 0, finished: false };
}

function elapsedMs(from: string, to: string): number | undefined {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

/** Index of the most recent row of `step` that has not finished yet, or -1. */
function openRowIndex(rows: readonly TimelineRow[], step: StepId): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (row.step === step && (row.status === 'running' || row.status === 'waiting')) return i;
  }
  return -1;
}

function replaceRow(rows: readonly TimelineRow[], index: number, row: TimelineRow): TimelineRow[] {
  const next = rows.slice();
  next[index] = row;
  return next;
}

/** Applies one event; returns the same object when the event changes nothing the timeline shows. */
export function applyRunEvent(view: RunView, event: RunEvent): RunView {
  if (event.runId !== view.runId) return view;

  switch (event.type) {
    case 'run.started':
      return { ...view, config: event.config, startedAt: event.at };

    case 'step.started': {
      const info = STEP_INFO[event.step];
      const row: TimelineRow = {
        key: `${event.step}#${view.rows.length}`,
        step: event.step,
        label: event.label,
        protocolTerm: info.protocolTerm,
        status: 'running',
        startedAt: event.at,
        ...(info.spec ? { spec: info.spec } : {}),
      };
      return { ...view, rows: [...view.rows, row] };
    }

    case 'step.finished': {
      const index = openRowIndex(view.rows, event.step);
      const finishedAt = event.at;
      if (index === -1) {
        // A finish without a start (for example a step the orchestrator skipped outright).
        const info = STEP_INFO[event.step];
        const row: TimelineRow = {
          key: `${event.step}#${view.rows.length}`,
          step: event.step,
          label: info.label,
          protocolTerm: info.protocolTerm,
          status: event.status,
          startedAt: finishedAt,
          finishedAt,
          ...(info.spec ? { spec: info.spec } : {}),
          ...(event.error ? { error: event.error } : {}),
        };
        return { ...view, rows: [...view.rows, row] };
      }
      const open = view.rows[index]!;
      const durationMs = elapsedMs(open.startedAt, finishedAt);
      const row: TimelineRow = {
        ...open,
        status: event.status,
        finishedAt,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(event.error ? { error: event.error } : {}),
      };
      return { ...view, rows: replaceRow(view.rows, index, row) };
    }

    case 'exchange':
      return { ...view, exchangeCount: view.exchangeCount + 1 };

    case 'person.action-needed': {
      // The orchestrator opens a `person.action` step first; mark it as waiting for the person.
      const index = openRowIndex(view.rows, 'person.action');
      if (index === -1) return view;
      const row = { ...view.rows[index]!, status: 'waiting' as const, personAction: event.action };
      return { ...view, rows: replaceRow(view.rows, index, row) };
    }

    case 'run.finished':
      return { ...view, report: event.report, finished: true };

    case 'artifact':
      // Artefacts belong to the inspector, not to the timeline.
      return view;
  }
}

export function buildRunView(runId: string, events: readonly RunEvent[]): RunView {
  return events.reduce(applyRunEvent, emptyRunView(runId));
}

/** "850 ms", "1.2 s", "2 min 5 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes} min ${seconds} s`;
}
