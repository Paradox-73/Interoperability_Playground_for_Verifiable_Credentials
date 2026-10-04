/**
 * Groups the recorded exchanges and artefacts of a run by protocol step, in the order they happened.
 * Pure, so live runs, stored runs and playback (a prefix of the events) all use the same code.
 */
import {
  STEP_INFO,
  type ArtifactKind,
  type CredentialFormat,
  type RecordedExchange,
  type RunConfig,
  type RunEvent,
  type StepId,
} from '@inji-playground/protocol';

export interface ExchangeItem {
  kind: 'exchange';
  id: string;
  exchange: RecordedExchange;
}

export interface ArtifactItem {
  kind: 'artifact';
  /** Artefact events carry no id; this one is stable for a given event list. */
  id: string;
  artifactKind: ArtifactKind;
  format?: CredentialFormat;
  raw: string;
}

export type InspectorItem = ExchangeItem | ArtifactItem;

export interface StepGroup {
  key: string;
  /** Undefined for exchanges the recording could not tag with a step. */
  step?: StepId;
  label: string;
  items: InspectorItem[];
}

export interface InspectorModel {
  config?: RunConfig;
  groups: StepGroup[];
  /** Every item in event order. */
  items: InspectorItem[];
  /** Exchanges only, in recording order: the messages of the sequence diagram. */
  exchanges: RecordedExchange[];
}

export function buildInspectorModel(events: readonly RunEvent[]): InspectorModel {
  const groups: StepGroup[] = [];
  const items: InspectorItem[] = [];
  const exchanges: RecordedExchange[] = [];
  let config: RunConfig | undefined;
  let current: StepGroup | undefined;
  let artifactCount = 0;

  const newGroup = (step: StepId | undefined, label: string): StepGroup => {
    const group: StepGroup = { key: `${step ?? 'untagged'}#${groups.length}`, label, items: [] };
    if (step) group.step = step;
    groups.push(group);
    return group;
  };
  const latestGroupOf = (step: StepId | undefined): StepGroup | undefined => {
    for (let i = groups.length - 1; i >= 0; i -= 1) if (groups[i]!.step === step) return groups[i];
    return undefined;
  };

  for (const event of events) {
    switch (event.type) {
      case 'run.started':
        config = event.config;
        break;
      case 'step.started':
        current = newGroup(event.step, event.label);
        break;
      case 'exchange': {
        const { exchange } = event;
        const step = exchange.step;
        // An exchange belongs to the latest group of its own step; untagged ones to the step in progress.
        const group = step
          ? ((current?.step === step ? current : latestGroupOf(step)) ??
            newGroup(step, STEP_INFO[step].label))
          : (current ?? latestGroupOf(undefined) ?? newGroup(undefined, ''));
        const item: ExchangeItem = { kind: 'exchange', id: exchange.id, exchange };
        group.items.push(item);
        items.push(item);
        exchanges.push(exchange);
        break;
      }
      case 'artifact': {
        artifactCount += 1;
        const group = current ?? groups[groups.length - 1] ?? newGroup(undefined, '');
        const item: ArtifactItem = {
          kind: 'artifact',
          id: `artifact-${artifactCount}-${event.kind}`,
          artifactKind: event.kind,
          raw: event.raw,
          ...(event.format ? { format: event.format } : {}),
        };
        group.items.push(item);
        items.push(item);
        break;
      }
      case 'step.finished':
      case 'person.action-needed':
      case 'run.finished':
        break;
    }
  }

  return {
    ...(config ? { config } : {}),
    groups: groups.filter((group) => group.items.length > 0),
    items,
    exchanges,
  };
}

export function findItem(model: InspectorModel, id: string | undefined): InspectorItem | undefined {
  return id === undefined ? undefined : model.items.find((item) => item.id === id);
}

/** Path and query of a URL for compact labels; the URL itself when it does not parse. */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      return `${parsed.pathname}${parsed.search}`;
    return url;
  } catch {
    return url;
  }
}

/** File name for a downloaded payload: run, sequence number and part, safe on every file system. */
export function downloadName(...parts: Array<string | number>): string {
  return parts
    .map((part) => String(part).replace(/[^A-Za-z0-9._-]+/g, '-'))
    .filter(Boolean)
    .join('_');
}
