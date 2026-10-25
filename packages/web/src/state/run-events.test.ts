// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import type { RunEvent } from '@inji-playground/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetRunEventsStore, useRunEventsStore } from './run-events';

const started = (runId: string, at: string): RunEvent => ({
  type: 'step.started',
  runId,
  step: 'issuer.offer',
  label: 'Issuer prepares a credential offer for the wallet',
  at,
});

describe('run event store', () => {
  beforeEach(resetRunEventsStore);

  it('keeps events per run in arrival order', () => {
    const { append } = useRunEventsStore.getState();
    append(started('a', '2026-10-04T10:00:00.000Z'));
    append(started('b', '2026-10-04T10:00:01.000Z'));
    append(started('a', '2026-10-04T10:00:02.000Z'));
    const { runs } = useRunEventsStore.getState();
    expect(runs.a?.events.map((e) => (e.type === 'step.started' ? e.at : ''))).toEqual([
      '2026-10-04T10:00:00.000Z',
      '2026-10-04T10:00:02.000Z',
    ]);
    expect(runs.b?.events).toHaveLength(1);
  });

  it('drops an event it already has, as resent after a reconnect', () => {
    const { append } = useRunEventsStore.getState();
    expect(append(started('a', '2026-10-04T10:00:00.000Z'))).toBe(true);
    expect(append(started('a', '2026-10-04T10:00:00.000Z'))).toBe(false);
    expect(useRunEventsStore.getState().runs.a?.events).toHaveLength(1);
  });

  it('loads a stored run without duplicates and forgets it again', () => {
    const { load, forget, append } = useRunEventsStore.getState();
    const event = started('a', '2026-10-04T10:00:00.000Z');
    load('a', [event, event]);
    expect(useRunEventsStore.getState().runs.a?.events).toEqual([event]);
    expect(append(event)).toBe(false);
    forget('a');
    expect(useRunEventsStore.getState().runs.a).toBeUndefined();
  });
});
