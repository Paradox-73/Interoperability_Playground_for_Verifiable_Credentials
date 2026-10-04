/**
 * Step timeouts: how long a protocol step may take before the run is stopped, and the timer that
 * enforces it (paused while the run waits for a person).
 */
import type { RoleDescriptor } from '@inji-playground/protocol';

export interface StepTimeouts {
  /** Roles written for the playground; they answer in milliseconds. */
  referenceMs: number;
  /** Inji modules and outside implementations (Certify's first metadata call took 52 s, measured 2026-10-04). */
  injiMs: number;
  /** Steps that need a person: scanning a QR code, or a component open in the browser. */
  personMs: number;
}

export const DEFAULT_STEP_TIMEOUTS: StepTimeouts = { referenceMs: 15_000, injiMs: 90_000, personMs: 600_000 };

/** Timeout of a step run by this role, unless its registration overrides it. */
export function roleStepTimeout(
  descriptor: RoleDescriptor,
  timeouts: StepTimeouts,
  overrideMs?: number,
): number {
  if (overrideMs !== undefined) return overrideMs;
  if (descriptor.interaction !== 'automatic') return timeouts.personMs;
  return descriptor.ecosystem === 'reference' ? timeouts.referenceMs : timeouts.injiMs;
}

/**
 * A one-shot timer that can be paused and resumed; the remaining time carries over. `restart` begins a
 * fresh period (used when a role moves on to its next protocol step).
 */
export class PausableTimer {
  readonly #onExpire: () => void;
  #durationMs: number;
  #remainingMs: number;
  #startedAt = 0;
  #handle: NodeJS.Timeout | undefined;
  #pauses = 0;
  #done = false;

  constructor(durationMs: number, onExpire: () => void) {
    this.#durationMs = durationMs;
    this.#remainingMs = durationMs;
    this.#onExpire = onExpire;
    this.#arm();
  }

  get durationMs(): number {
    return this.#durationMs;
  }

  /** Pauses can nest (two concurrent waits); the timer runs again when the last one resumes. */
  pause(): void {
    if (this.#done) return;
    this.#pauses += 1;
    if (this.#pauses > 1 || !this.#handle) return;
    clearTimeout(this.#handle);
    this.#handle = undefined;
    this.#remainingMs = Math.max(0, this.#remainingMs - (performance.now() - this.#startedAt));
  }

  resume(): void {
    if (this.#done || this.#pauses === 0) return;
    this.#pauses -= 1;
    if (this.#pauses === 0) this.#arm();
  }

  /** Starts a new full period of `durationMs` (by default the current duration). */
  restart(durationMs: number = this.#durationMs): void {
    if (this.#done) return;
    clearTimeout(this.#handle);
    this.#handle = undefined;
    this.#durationMs = durationMs;
    this.#remainingMs = durationMs;
    if (this.#pauses === 0) this.#arm();
  }

  clear(): void {
    this.#done = true;
    clearTimeout(this.#handle);
    this.#handle = undefined;
  }

  #arm(): void {
    this.#startedAt = performance.now();
    this.#handle = setTimeout(() => {
      this.#done = true;
      this.#handle = undefined;
      this.#onExpire();
    }, this.#remainingMs);
  }
}
