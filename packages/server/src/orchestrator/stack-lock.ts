// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Live runs share one local Inji stack: two of them at once would mix their traffic in the proxy and
 * compete for Certify's single pre-authorized-code state. This first-come-first-served lock lets one
 * live run through at a time; reference runs never take it and run in parallel.
 */
export class StackLock {
  #held = false;
  readonly #waiting: Array<{ grant: () => void }> = [];

  /** True while a live run holds the stack. */
  get busy(): boolean {
    return this.#held;
  }

  /** Number of runs waiting for the stack. */
  get queued(): number {
    return this.#waiting.length;
  }

  /**
   * Resolves with a release function once the stack is free. Rejects with the signal's reason if the
   * signal aborts first (a queued run was cancelled); the place in the queue is then given up.
   */
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(signal.reason as Error);
    if (!this.#held) {
      this.#held = true;
      return Promise.resolve(this.#releaser());
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve(this.#releaser());
        },
      };
      const onAbort = (): void => {
        const index = this.#waiting.indexOf(waiter);
        if (index >= 0) this.#waiting.splice(index, 1);
        reject(signal?.reason as Error);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#waiting.push(waiter);
    });
  }

  #releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.#waiting.shift();
      if (next) next.grant();
      else this.#held = false;
    };
  }
}
