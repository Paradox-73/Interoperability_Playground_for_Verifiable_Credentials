/**
 * In-process publish/subscribe for run events. The orchestrator publishes each event after it has been
 * stored; the WebSocket route and tests subscribe. Delivery is synchronous and in publish order, so a
 * subscriber sees the events of a run exactly in the order they were stored.
 */
import type { RunEvent } from '@inji-playground/protocol';

export type RunEventListener = (event: RunEvent) => void;

/** Logs a listener that threw; the bus never lets one subscriber break delivery to the others. */
export type ListenerErrorHandler = (error: unknown, event: RunEvent) => void;

export class EventBus {
  readonly #all = new Set<RunEventListener>();
  readonly #byRun = new Map<string, Set<RunEventListener>>();
  readonly #onListenerError: ListenerErrorHandler;

  constructor(onListenerError: ListenerErrorHandler = () => undefined) {
    this.#onListenerError = onListenerError;
  }

  /** Receives the events of every run. Returns the function that unsubscribes. */
  subscribeAll(listener: RunEventListener): () => void {
    this.#all.add(listener);
    return () => this.#all.delete(listener);
  }

  /** Receives the events of one run. Returns the function that unsubscribes. */
  subscribeRun(runId: string, listener: RunEventListener): () => void {
    let listeners = this.#byRun.get(runId);
    if (!listeners) {
      listeners = new Set();
      this.#byRun.set(runId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#byRun.delete(runId);
    };
  }

  publish(event: RunEvent): void {
    // Copy the sets: a listener may unsubscribe (or subscribe another) while it is being called.
    for (const listener of [...(this.#byRun.get(event.runId) ?? []), ...this.#all]) {
      try {
        listener(event);
      } catch (error) {
        this.#onListenerError(error, event);
      }
    }
  }

  /** Number of active subscriptions, for tests and diagnostics. */
  listenerCount(): number {
    let count = this.#all.size;
    for (const listeners of this.#byRun.values()) count += listeners.size;
    return count;
  }
}
