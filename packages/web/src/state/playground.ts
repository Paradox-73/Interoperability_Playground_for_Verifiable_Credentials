// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * What the person has chosen on the playground page: the three roles, the run-bar preferences and the
 * run being watched. Derived values (shared formats, the effective run settings, incompatibilities) are
 * computed from this plus the role list in `features/selector/use-combination.ts`, never stored twice.
 */
import type { RoleId, RoleKind } from '@inji-playground/protocol';
import { create } from 'zustand';
import type { RunChoice } from '../features/selector/compatibility';
import type { DefaultBasis, DefaultSelection } from '../features/selector/default-selection';

/** `default`: preselected by the playground; `person`: changed by the person, so never overridden. */
export type SelectionSource = 'none' | 'default' | 'person';

export interface PlaygroundState {
  selection: Partial<Record<RoleKind, RoleId>>;
  selectionSource: SelectionSource;
  defaultBasis?: DefaultBasis;
  /** Run-bar values the person picked; used whenever the selected roles support them. */
  preferred: Partial<RunChoice>;
  /** The run the timeline follows. */
  activeRunId?: string;
  /** Runs started from this tab, newest first. */
  startedRuns: string[];
  /** Set by the playback view, so the mode badge says "Playback". */
  playback: boolean;

  selectRole: (kind: RoleKind, id: RoleId) => void;
  /** Applies a preselection, unless the person has already chosen roles. */
  applyDefault: (choice: DefaultSelection) => void;
  setPreference: <K extends keyof RunChoice>(key: K, value: RunChoice[K]) => void;
  runStarted: (runId: string) => void;
  setPlayback: (on: boolean) => void;
}

const initialState = {
  selection: {},
  selectionSource: 'none' as SelectionSource,
  preferred: {},
  startedRuns: [],
  playback: false,
};

export const usePlaygroundStore = create<PlaygroundState>()((set) => ({
  ...initialState,

  selectRole: (kind, id) =>
    set((state) => ({ selection: { ...state.selection, [kind]: id }, selectionSource: 'person' })),

  applyDefault: ({ selection, basis }) =>
    set((state) =>
      state.selectionSource === 'person'
        ? state
        : { selection, selectionSource: 'default', defaultBasis: basis },
    ),

  setPreference: (key, value) => set((state) => ({ preferred: { ...state.preferred, [key]: value } })),

  runStarted: (runId) =>
    set((state) => ({
      activeRunId: runId,
      startedRuns: [runId, ...state.startedRuns.filter((id) => id !== runId)],
    })),

  setPlayback: (on) => set({ playback: on }),
}));

export function resetPlaygroundStore(): void {
  usePlaygroundStore.setState({ ...initialState, defaultBasis: undefined, activeRunId: undefined });
}
