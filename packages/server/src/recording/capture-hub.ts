// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Ties exchanges seen by the reverse proxy and the inbound recorder to a run, and lets roles watch them.
 *
 * Outbound exchanges belong to the run whose role made the call. A request that reaches the
 * playground from outside (a phone, Mimoto, the browser SDK) carries no run, so it is attributed:
 * 1. by the attribution headers the playground's own outbound client adds (`x-playground-run`, ...),
 *    when the call came from a role of this server through its own proxy or reference roles;
 * 2. otherwise by a claim: a role that hands a URL to an outside party (an offer to a phone, a
 *    request object to Inji Verify's wallet) claims the target for its run. The newest active claim
 *    on the target wins, so with several reference runs in parallel an outside request goes to the
 *    run that most recently claimed that target. Live runs on the Inji stack are serialised, so they
 *    never compete for a claim.
 * Exchanges that match no run are not stored (they belong to no report) and are counted instead.
 */
import type { RecordedExchange, RunConfig } from '@inji-playground/protocol';
import type { EventBus } from '../events/bus.js';
import type { ExchangeDraft, ExchangeRecorder } from './http-client.js';

/** Headers the outbound client adds when it calls the playground's own capture points. */
export const ATTRIBUTION_HEADERS = {
  run: 'x-playground-run',
  step: 'x-playground-step',
  from: 'x-playground-from',
} as const;

const ATTRIBUTION_NAMES = new Set<string>(Object.values(ATTRIBUTION_HEADERS));

/** True for the attribution headers, which are never recorded or forwarded. */
export function isAttributionHeader(name: string): boolean {
  return ATTRIBUTION_NAMES.has(name.toLowerCase());
}

/** Capture targets: the hosted reference roles and the proxied Inji services. */
export type CaptureTarget = string;

interface Claim {
  runId: string;
  target: CaptureTarget;
  at: number;
}

export type ExchangeListener = (exchange: RecordedExchange) => void;

export interface CaptureHubOptions {
  /** The recorder of an active run (the orchestrator's), or `undefined` once it has finished. */
  recorderFor(runId: string): ExchangeRecorder | undefined;
  /** Bus of run events: claims and run configurations are dropped when a run finishes. */
  bus?: EventBus;
}

export class CaptureHub {
  readonly #options: CaptureHubOptions;
  readonly #claims: Claim[] = [];
  readonly #configs = new Map<string, RunConfig>();
  readonly #listeners = new Map<string, Set<ExchangeListener>>();
  #sequence = 0;
  /** Exchanges that reached a capture point while no run claimed their target. */
  unattributed = 0;

  constructor(options: CaptureHubOptions) {
    this.#options = options;
    options.bus?.subscribeAll((event) => {
      if (event.type === 'run.started') this.#configs.set(event.runId, event.config);
      if (event.type === 'run.finished') this.#forget(event.runId);
    });
  }

  /**
   * Claims `target` for `runId`: outside requests to it are recorded in that run until the run ends
   * or the returned function is called.
   */
  claim(runId: string, target: CaptureTarget): () => void {
    // A monotonic counter, not the clock: two claims in the same millisecond still order correctly.
    const claim: Claim = { runId, target, at: ++this.#sequence };
    this.#claims.push(claim);
    return () => {
      const index = this.#claims.indexOf(claim);
      if (index >= 0) this.#claims.splice(index, 1);
    };
  }

  /** The run an exchange belongs to: the explicit run id when it is active, else the newest claim. */
  resolveRun(target: CaptureTarget, explicitRunId?: string): string | undefined {
    if (explicitRunId && this.#options.recorderFor(explicitRunId)) return explicitRunId;
    let best: Claim | undefined;
    for (const claim of this.#claims) {
      if (claim.target !== target || !this.#options.recorderFor(claim.runId)) continue;
      if (!best || claim.at > best.at) best = claim;
    }
    return best?.runId;
  }

  /** Configuration of an active run, for naming the outside party (its wallet) on the diagram. */
  configOf(runId: string): RunConfig | undefined {
    return this.#configs.get(runId);
  }

  /** Stores an exchange in its run and tells the run's watchers; `undefined` when the run has ended. */
  record(runId: string, draft: ExchangeDraft): RecordedExchange | undefined {
    const recorder = this.#options.recorderFor(runId);
    if (!recorder) {
      this.unattributed += 1;
      return undefined;
    }
    const exchange = recorder.record(draft);
    for (const listener of this.#listeners.get(runId) ?? []) listener(exchange);
    return exchange;
  }

  /** Calls `listener` for every proxy or inbound exchange of `runId`; returns the unsubscribe function. */
  watch(runId: string, listener: ExchangeListener): () => void {
    let set = this.#listeners.get(runId);
    if (!set) {
      set = new Set();
      this.#listeners.set(runId, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  /**
   * Resolves with the first proxy or inbound exchange of `runId` (already recorded or still to come)
   * that satisfies `predicate`; rejects when `signal` aborts.
   */
  waitFor(
    runId: string,
    predicate: (exchange: RecordedExchange) => boolean,
    signal: AbortSignal,
  ): Promise<RecordedExchange> {
    const earlier = this.#options
      .recorderFor(runId)
      ?.list()
      .find((exchange) => exchange.capture !== 'outbound' && predicate(exchange));
    if (earlier) return Promise.resolve(earlier);
    if (signal.aborted) return Promise.reject(signal.reason as Error);
    return new Promise((resolve, reject) => {
      const stop = this.watch(runId, (exchange) => {
        if (!predicate(exchange)) return;
        cleanup();
        resolve(exchange);
      });
      const onAbort = (): void => {
        cleanup();
        reject(signal.reason as Error);
      };
      const cleanup = (): void => {
        stop();
        signal.removeEventListener('abort', onAbort);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  #forget(runId: string): void {
    for (let index = this.#claims.length - 1; index >= 0; index -= 1) {
      if (this.#claims[index]?.runId === runId) this.#claims.splice(index, 1);
    }
    this.#configs.delete(runId);
    this.#listeners.delete(runId);
  }
}
