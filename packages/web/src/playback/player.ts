// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Playback state of a stored run: how many of its events are shown, whether it is playing, and at what
 * speed. A pure reducer, so stepping rules are tested without timers or a browser.
 */
import type { RunEvent } from '@inji-playground/protocol';

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export interface PlayerState {
  /** Number of events in the recording. */
  total: number;
  /** Number of events shown: 0 is before the first event, `total` is the end. */
  position: number;
  playing: boolean;
  speed: Speed;
}

export type PlayerAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'back' }
  | { type: 'restart' }
  | { type: 'end' }
  | { type: 'seek'; position: number }
  | { type: 'speed'; speed: Speed }
  /** The timer fired while playing. */
  | { type: 'tick' }
  | { type: 'load'; total: number };

export function initialPlayer(total: number): PlayerState {
  return { total, position: 0, playing: false, speed: 1 };
}

const clamp = (value: number, total: number) => Math.min(Math.max(Math.round(value), 0), total);

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'load':
      return initialPlayer(action.total);
    case 'play':
      // Play at the end starts over, as media players do.
      return {
        ...state,
        playing: state.total > 0,
        position: state.position >= state.total ? 0 : state.position,
      };
    case 'pause':
      return { ...state, playing: false };
    case 'step':
      return { ...state, playing: false, position: clamp(state.position + 1, state.total) };
    case 'back':
      return { ...state, playing: false, position: clamp(state.position - 1, state.total) };
    case 'restart':
      return { ...state, playing: false, position: 0 };
    case 'end':
      return { ...state, playing: false, position: state.total };
    case 'seek':
      return { ...state, position: clamp(action.position, state.total) };
    case 'speed':
      return { ...state, speed: action.speed };
    case 'tick': {
      if (!state.playing) return state;
      const position = clamp(state.position + 1, state.total);
      return { ...state, position, playing: position < state.total };
    }
  }
}

/** Time the event was recorded, when it says so. */
export function eventTime(event: RunEvent): number | undefined {
  const at =
    event.type === 'exchange'
      ? event.exchange.startedAt
      : event.type === 'run.finished'
        ? undefined
        : 'at' in event
          ? event.at
          : undefined;
  const ms = at === undefined ? Number.NaN : Date.parse(at);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Shortest and longest pause between two events at speed 1. */
export const MIN_DELAY_MS = 350;
export const MAX_DELAY_MS = 2000;

/**
 * Pause before showing `events[position]`: the recorded gap to the previous event, kept between
 * MIN_DELAY_MS and MAX_DELAY_MS so fast runs are still readable and a long wait for a person does not
 * stall playback, then divided by the speed.
 */
export function delayBefore(events: readonly RunEvent[], position: number, speed: Speed): number {
  const next = events[position];
  const previous = position > 0 ? events[position - 1] : undefined;
  const gap =
    next && previous ? (eventTime(next) ?? Number.NaN) - (eventTime(previous) ?? Number.NaN) : Number.NaN;
  const base = Number.isFinite(gap) ? Math.min(Math.max(gap, MIN_DELAY_MS), MAX_DELAY_MS) : MIN_DELAY_MS * 2;
  return Math.round(base / speed);
}
