/**
 * Redacted export of a run: configuration, report, events, exchanges and artefacts in one JSON
 * document that can be attached to an issue or shared with another team (see `redact.ts` for what is
 * removed and why).
 */
import type { RunDetail, RunExport } from '@inji-playground/protocol';
import type { RunStore } from '../store/run-store.js';
import { Redactor } from './redact.js';

export function buildRunExport(store: RunStore, run: RunDetail, now: Date = new Date()): RunExport {
  const redactor = new Redactor();
  const runCopy: RunDetail = run.pendingAction
    ? { ...run, pendingAction: redactor.json(run.pendingAction) as RunDetail['pendingAction'] }
    : run;
  const events = store.listEvents(run.runId).map((event) => redactor.event(event));
  const exchanges = store.listExchanges(run.runId).map((exchange) => redactor.exchange(exchange));
  const artifacts = store
    .listArtifacts(run.runId)
    .map((artifact) =>
      artifact.kind === 'offer' ? { ...artifact, raw: redactor.text(artifact.raw) } : artifact,
    );
  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    redacted: true,
    redactions: redactor.count,
    run: runCopy,
    events,
    exchanges,
    artifacts,
  };
}
