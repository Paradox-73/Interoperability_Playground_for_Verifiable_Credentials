// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Playback of a stored run (`/runs/:id/playback`): its recorded events are fed one by one into the same
 * timeline, sequence diagram and inspector that show live runs, with play, pause, step and speed
 * controls. The page says plainly that it is a recording and when it was recorded, and the mode badge
 * in the top bar switches to "Playback".
 */
import type { RunEvent } from '@inji-playground/protocol';
import { useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { describeError } from '../api/http';
import { useDocumentTitle } from '../app/use-document-title';
import { RunTimeline } from '../features/timeline/Timeline';
import { RunExplorer } from '../inspector/RunExplorer';
import { usePlaygroundStore } from '../state/playground';
import { buildRunView } from '../state/run-view';
import { SPEEDS, type PlayerAction, type PlayerState } from './player';
import { recordedAt, useRunDetail, useStoredRunEvents } from './queries';
import { usePlayer } from './use-player';

export function PlaybackPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const setPlayback = usePlaygroundStore((state) => state.setPlayback);
  const eventsQuery = useStoredRunEvents(id);
  const detailQuery = useRunDetail(id);
  useDocumentTitle(t('playback.title', { runId: id }));

  useEffect(() => {
    setPlayback(true);
    return () => setPlayback(false);
  }, [setPlayback]);

  return (
    <div className="space-y-6">
      <Link to={`/runs/${encodeURIComponent(id)}`} className="text-sm text-accent underline">
        {t('playback.back', { runId: id })}
      </Link>
      {eventsQuery.isPending ? (
        <>
          <h1 className="text-xl font-semibold">{t('playback.title', { runId: id })}</h1>
          <p role="status" className="text-sm text-fg-muted">
            {t('playback.loading', { runId: id })}
          </p>
        </>
      ) : eventsQuery.isError ? (
        <>
          <h1 className="text-xl font-semibold">{t('playback.title', { runId: id })}</h1>
          <p role="alert" className="rounded-md border border-fail p-3 text-sm text-fail">
            {t('playback.error', { runId: id, message: describeError(eventsQuery.error) })}
          </p>
        </>
      ) : (
        <Player
          runId={id}
          events={eventsQuery.data}
          recorded={recordedAt(detailQuery.data, eventsQuery.data)}
        />
      )}
    </div>
  );
}

function formatDate(iso: string | undefined, language: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

function Player({
  runId,
  events,
  recorded,
}: {
  runId: string;
  events: RunEvent[];
  recorded: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const [state, dispatch] = usePlayer(events);
  const visible = useMemo(() => events.slice(0, state.position), [events, state.position]);
  const view = useMemo(() => buildRunView(runId, visible), [runId, visible]);
  const date = formatDate(recorded, i18n.language);

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold" data-testid="playback-heading">
          {date ? t('playback.heading', { runId, date }) : t('playback.headingNoDate', { runId })}
        </h1>
        <p className="rounded-md border border-warn p-3 text-sm text-warn">{t('playback.notice')}</p>
      </header>
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
          {t('playback.empty', { runId })}
        </p>
      ) : (
        <>
          <Controls state={state} dispatch={dispatch} />
          <section aria-labelledby="playback-timeline-heading" className="space-y-3">
            <h2 id="playback-timeline-heading" className="text-lg font-semibold">
              {t('timeline.heading')}
            </h2>
            <RunTimeline view={view} />
          </section>
          <RunExplorer runId={runId} events={visible} />
        </>
      )}
    </>
  );
}

function Controls({ state, dispatch }: { state: PlayerState; dispatch: (action: PlayerAction) => void }) {
  const { t } = useTranslation();
  const speedId = useId();
  const positionId = useId();
  const atStart = state.position === 0;
  const atEnd = state.position >= state.total;
  const button =
    'rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-fg hover:bg-surface-muted disabled:opacity-50';
  return (
    <div
      role="group"
      aria-label={t('playback.controls')}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3"
    >
      <button
        type="button"
        className={button}
        onClick={() => dispatch({ type: 'restart' })}
        disabled={atStart}
      >
        {t('playback.restart')}
      </button>
      <button type="button" className={button} onClick={() => dispatch({ type: 'back' })} disabled={atStart}>
        {t('playback.back1')}
      </button>
      {state.playing ? (
        <button
          type="button"
          className={`${button} font-semibold`}
          onClick={() => dispatch({ type: 'pause' })}
        >
          {t('playback.pause')}
        </button>
      ) : (
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
          onClick={() => dispatch({ type: 'play' })}
        >
          {atEnd ? t('playback.replay') : t('playback.play')}
        </button>
      )}
      <button type="button" className={button} onClick={() => dispatch({ type: 'step' })} disabled={atEnd}>
        {t('playback.step')}
      </button>
      <button type="button" className={button} onClick={() => dispatch({ type: 'end' })} disabled={atEnd}>
        {t('playback.end')}
      </button>
      <label htmlFor={speedId} className="ml-2 text-sm">
        {t('playback.speed')}
      </label>
      <select
        id={speedId}
        value={state.speed}
        onChange={(event) => {
          const speed = SPEEDS.find((value) => String(value) === event.target.value);
          if (speed) dispatch({ type: 'speed', speed });
        }}
        className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-fg"
      >
        {SPEEDS.map((speed) => (
          <option key={speed} value={speed}>
            {t('playback.speedValue', { speed })}
          </option>
        ))}
      </select>
      <label htmlFor={positionId} className="sr-only">
        {t('playback.positionLabel')}
      </label>
      <input
        id={positionId}
        type="range"
        min={0}
        max={state.total}
        value={state.position}
        aria-valuetext={t('playback.position', { position: state.position, total: state.total })}
        onChange={(event) => dispatch({ type: 'seek', position: Number(event.target.value) })}
        className="min-w-32 flex-1 accent-accent"
      />
      <p role="status" className="font-mono text-sm tabular-nums" data-testid="playback-position">
        {t('playback.position', { position: state.position, total: state.total })}
      </p>
    </div>
  );
}
