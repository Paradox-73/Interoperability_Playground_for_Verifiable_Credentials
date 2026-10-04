/**
 * Received run events, per run, in arrival order. Shared by every component that shows a run, so the
 * timeline, the inspector and the sequence diagram read the same list.
 *
 * Events are immutable facts, so two identical events are the same event: after a reconnect the server
 * resends a run's stored events, and the duplicates are dropped here.
 */
import type { RunEvent } from '@inji-playground/protocol';
import { create } from 'zustand';

interface RunEventLog {
  events: RunEvent[];
  seen: Set<string>;
}

interface RunEventsState {
  runs: Record<string, RunEventLog>;
  /** Adds an event; returns false when it was already there. */
  append: (event: RunEvent) => boolean;
  /** Replaces a run's events, for example with a stored run loaded over REST or for playback. */
  load: (runId: string, events: readonly RunEvent[]) => void;
  forget: (runId: string) => void;
}

function keyOf(event: RunEvent): string {
  return JSON.stringify(event);
}

export const useRunEventsStore = create<RunEventsState>()((set, get) => ({
  runs: {},

  append(event) {
    const log = get().runs[event.runId];
    const key = keyOf(event);
    if (log?.seen.has(key)) return false;
    const seen = new Set(log?.seen);
    seen.add(key);
    set((state) => ({
      runs: { ...state.runs, [event.runId]: { events: [...(log?.events ?? []), event], seen } },
    }));
    return true;
  },

  load(runId, events) {
    const unique = new Map(events.map((event) => [keyOf(event), event] as const));
    set((state) => ({
      runs: { ...state.runs, [runId]: { events: [...unique.values()], seen: new Set(unique.keys()) } },
    }));
  },

  forget(runId) {
    set((state) => {
      const { [runId]: _removed, ...rest } = state.runs;
      return { runs: rest };
    });
  },
}));

const NO_EVENTS: readonly RunEvent[] = [];

/** The events of one run (stable empty array when there are none). */
export function useRunEvents(runId: string | undefined): readonly RunEvent[] {
  return useRunEventsStore((state) => (runId ? state.runs[runId]?.events : undefined) ?? NO_EVENTS);
}

export function resetRunEventsStore(): void {
  useRunEventsStore.setState({ runs: {} });
}
