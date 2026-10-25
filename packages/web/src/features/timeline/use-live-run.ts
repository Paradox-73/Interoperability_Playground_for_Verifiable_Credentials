// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Follows one run over the WebSocket: stores its events, announces finished steps to screen readers,
 * and returns the timeline view. Several components may follow the same run; the event store drops
 * duplicates, so each step is announced once.
 */
import { STEP_INFO, type RunEvent } from '@inji-playground/protocol';
import type { TFunction } from 'i18next';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRunSocket } from '../../api/socket-context';
import { announce } from '../../state/announcer';
import { useRunEvents, useRunEventsStore } from '../../state/run-events';
import { buildRunView, type RunView } from '../../state/run-view';

/** Label the server gave a step when it started, falling back to the built-in one. */
function stepLabel(events: readonly RunEvent[], step: keyof typeof STEP_INFO): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type === 'step.started' && event.step === step) return event.label;
  }
  return STEP_INFO[step].label;
}

/** The sentence a screen reader hears for an event, or undefined for events that are not announced. */
export function announcementFor(
  event: RunEvent,
  earlier: readonly RunEvent[],
  t: TFunction,
): string | undefined {
  switch (event.type) {
    case 'step.finished': {
      const label = stepLabel(earlier, event.step);
      if (event.status === 'ok') return t('announce.stepOk', { label });
      if (event.status === 'skipped') return t('announce.stepSkipped', { label });
      return t('announce.stepFailed', { label, message: event.error?.message ?? '' });
    }
    case 'person.action-needed':
      return t('announce.personNeeded', { title: event.action.title });
    case 'run.finished':
      return t('announce.runFinished', {
        verdict: t(`verdict.${event.report.verdict}`),
        outcome: t(`outcome.${event.report.outcome}`),
      });
    case 'run.started':
    case 'step.started':
    case 'exchange':
    case 'artifact':
      return undefined;
  }
}

export function useLiveRun(runId: string | undefined): RunView | undefined {
  const socket = useRunSocket();
  const { t } = useTranslation();
  const events = useRunEvents(runId);

  useEffect(() => {
    if (!runId) return;
    return socket.subscribe(runId, (event) => {
      const store = useRunEventsStore.getState();
      const earlier = store.runs[runId]?.events ?? [];
      if (!store.append(event)) return;
      const message = announcementFor(event, earlier, t);
      if (message) announce(message);
    });
  }, [runId, socket, t]);

  return useMemo(() => (runId ? buildRunView(runId, events) : undefined), [runId, events]);
}
