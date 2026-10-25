// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import exampleRun from '@inji-playground/protocol/fixtures/example-run.synthetic.json';
import { RunDetailSchema, RunEventSchema, type RunEvent } from '@inji-playground/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  delayBefore,
  initialPlayer,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  playerReducer,
} from '../src/playback/player';
import { api } from './msw/handlers';
import { server } from './msw/server';
import { renderApp } from './render';

vi.mock('mermaid', async () => (await import('./fake-mermaid')).fakeMermaidModule());

/**
 * The synthetic example run of the protocol package stands in for a recorded run until the first
 * recorded reference run is exported to the fixtures.
 */
const RUN_ID = 'example-run-0001';
const EVENTS: RunEvent[] = exampleRun.events.map((event) => RunEventSchema.parse(event));
const EXCHANGE_COUNT = EVENTS.filter((event) => event.type === 'exchange').length;
const finished = EVENTS.at(-1)!;

const DETAIL = RunDetailSchema.parse({
  runId: RUN_ID,
  status: 'finished',
  mode: 'reference',
  config: exampleRun.config,
  createdAt: '2026-10-03T08:30:00.000Z',
  versions: { issuer: '0.1.0', wallet: '0.1.0', verifier: '0.1.0' },
  ...(finished.type === 'run.finished' ? { report: finished.report } : {}),
});

function storedRun(detail: unknown = DETAIL) {
  server.use(
    http.get(api(`/api/runs/${RUN_ID}/events`), () => HttpResponse.json(EVENTS)),
    http.get(api(`/api/runs/${RUN_ID}`), () =>
      detail
        ? HttpResponse.json(detail)
        : HttpResponse.json({ error: 'not-found', message: 'no run' }, { status: 404 }),
    ),
  );
}

const position = () => screen.getByTestId('playback-position');

describe('playback page', () => {
  it('is labelled with the run id and the date it was recorded, and says it is a recording', async () => {
    storedRun();
    renderApp(`/runs/${RUN_ID}/playback`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: `Playback of run ${RUN_ID} recorded on October 3, 2026 at 8:30:00 AM`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/This is a recording, not a live run/)).toBeInTheDocument();
    expect(screen.getByTestId('mode-badge')).toHaveTextContent('Playback');
    expect(document.title).toMatch(`Playback of run ${RUN_ID}`);
  });

  it('falls back to the time of the first event when the run summary is missing', async () => {
    storedRun(null);
    renderApp(`/runs/${RUN_ID}/playback`);
    expect(await screen.findByTestId('playback-heading')).toHaveTextContent('recorded on October 4, 2026');
  });

  it('steps through the recorded events into the timeline, the diagram and the inspector', async () => {
    storedRun();
    const { user } = renderApp(`/runs/${RUN_ID}/playback`);
    await screen.findByTestId('playback-heading');
    expect(position()).toHaveTextContent(`Event 0 of ${EVENTS.length}`);
    expect(screen.getByTestId('sequence-diagram')).toHaveAttribute('data-messages', '0');

    const controls = screen.getByRole('group', { name: 'Playback controls' });
    const step = within(controls).getByRole('button', { name: 'Step forward' });
    // run.started, step.started, exchange: the first arrow appears with the third event.
    await user.click(step);
    await user.click(step);
    expect(screen.getByTestId('sequence-diagram')).toHaveAttribute('data-messages', '0');
    await user.click(step);
    expect(position()).toHaveTextContent(`Event 3 of ${EVENTS.length}`);
    const diagram = screen.getByTestId('sequence-diagram');
    expect(diagram).toHaveAttribute('data-messages', '1');
    await waitFor(() =>
      expect(diagram.querySelectorAll('[role="button"][data-exchange-id]')).toHaveLength(1),
    );
    expect(screen.getByTestId('exchange-detail')).toHaveAttribute('data-exchange-id', `${RUN_ID}-x1`);
    expect(screen.getByRole('list', { name: `Steps of run ${RUN_ID}` })).toHaveTextContent(
      'Issuer prepares a credential offer for the wallet',
    );

    await user.click(within(controls).getByRole('button', { name: 'Go to end' }));
    expect(position()).toHaveTextContent(`Event ${EVENTS.length} of ${EVENTS.length}`);
    expect(screen.getByTestId('sequence-diagram')).toHaveAttribute('data-messages', String(EXCHANGE_COUNT));
    expect(screen.getByTestId('run-result')).toHaveTextContent('Pass');

    await user.click(within(controls).getByRole('button', { name: 'Step back' }));
    expect(position()).toHaveTextContent(`Event ${EVENTS.length - 1} of ${EVENTS.length}`);
    expect(screen.queryByTestId('run-result')).not.toBeInTheDocument();
  });

  it('plays on its own and pauses', async () => {
    storedRun();
    const { user } = renderApp(`/runs/${RUN_ID}/playback`);
    await screen.findByTestId('playback-heading');
    const controls = screen.getByRole('group', { name: 'Playback controls' });
    await user.selectOptions(within(controls).getByLabelText('Speed'), '4');
    await user.click(within(controls).getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(position()).toHaveTextContent(/Event [2-9]\d* of/));
    await user.click(within(controls).getByRole('button', { name: 'Pause' }));
    const paused = position().textContent;
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS));
    expect(position().textContent).toBe(paused);
  });

  it('says so when the run cannot be loaded', async () => {
    server.use(
      http.get(api(`/api/runs/${RUN_ID}/events`), () =>
        HttpResponse.json({ error: 'not-found', message: 'run example-run-0001 not found' }, { status: 404 }),
      ),
      http.get(api(`/api/runs/${RUN_ID}`), () =>
        HttpResponse.json({ error: 'not-found', message: 'x' }, { status: 404 }),
      ),
    );
    renderApp(`/runs/${RUN_ID}/playback`);
    expect(await screen.findByRole('alert')).toHaveTextContent('run example-run-0001 not found');
  });

  it('is reachable from the run page', async () => {
    storedRun();
    const { user, router } = renderApp(`/runs/${RUN_ID}`);
    await user.click(await screen.findByRole('link', { name: 'Play back this run step by step' }));
    expect(router.state.location.pathname).toBe(`/runs/${RUN_ID}/playback`);
  });
});

describe('player reducer', () => {
  it('steps, seeks and stops at both ends', () => {
    let state = initialPlayer(3);
    state = playerReducer(state, { type: 'back' });
    expect(state.position).toBe(0);
    state = playerReducer(state, { type: 'end' });
    expect(state.position).toBe(3);
    state = playerReducer(state, { type: 'step' });
    expect(state.position).toBe(3);
    state = playerReducer(state, { type: 'seek', position: 7 });
    expect(state.position).toBe(3);
    state = playerReducer(state, { type: 'seek', position: 1 });
    expect(state.position).toBe(1);
  });

  it('plays to the end, then stops; play at the end starts again', () => {
    let state = playerReducer(initialPlayer(2), { type: 'play' });
    state = playerReducer(state, { type: 'tick' });
    expect(state).toMatchObject({ position: 1, playing: true });
    state = playerReducer(state, { type: 'tick' });
    expect(state).toMatchObject({ position: 2, playing: false });
    state = playerReducer(state, { type: 'play' });
    expect(state).toMatchObject({ position: 0, playing: true });
    expect(playerReducer(initialPlayer(0), { type: 'play' }).playing).toBe(false);
  });

  it('waits the recorded gap between events, kept readable and divided by the speed', () => {
    const at = (iso: string): RunEvent => ({
      type: 'run.started',
      runId: 'r',
      config: EVENTS[0]!.type === 'run.started' ? EVENTS[0]!.config : (undefined as never),
      at: iso,
    });
    const events = [
      at('2026-10-04T10:00:00.000Z'),
      at('2026-10-04T10:00:00.010Z'),
      at('2026-10-04T10:00:01.000Z'),
      at('2026-10-04T10:05:00.000Z'),
    ];
    expect(delayBefore(events, 1, 1)).toBe(MIN_DELAY_MS);
    expect(delayBefore(events, 2, 1)).toBe(990);
    expect(delayBefore(events, 2, 2)).toBe(495);
    expect(delayBefore(events, 3, 1)).toBe(MAX_DELAY_MS);
    expect(delayBefore(events, 0, 1)).toBe(MIN_DELAY_MS * 2);
  });
});
