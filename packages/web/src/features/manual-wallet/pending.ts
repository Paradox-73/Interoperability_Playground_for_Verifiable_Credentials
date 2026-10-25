// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The person action a run is waiting for right now, read from its timeline: the newest row that is still
 * waiting for a person. A finished run waits for nobody.
 */
import type { PersonAction } from '@inji-playground/protocol';
import type { RunView } from '../../state/run-view';

export interface PendingAction {
  action: PersonAction;
  /** When the person step started (ISO time). */
  startedAt: string;
}

export function pendingPersonAction(view: RunView): PendingAction | undefined {
  if (view.finished) return undefined;
  for (let index = view.rows.length - 1; index >= 0; index -= 1) {
    const row = view.rows[index]!;
    if (row.status === 'waiting' && row.personAction)
      return { action: row.personAction, startedAt: row.startedAt };
  }
  return undefined;
}
