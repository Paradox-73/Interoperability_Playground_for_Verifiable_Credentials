// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import exampleRun from '@inji-playground/protocol/fixtures/example-run.synthetic.json';
import { RunEventSchema, type RunEvent } from '@inji-playground/protocol';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunExplorer } from '../src/inspector/RunExplorer';
import { buildSequenceDiagram, escapeMermaidText, participantOf } from '../src/sequence/diagram';
import { stubReducedMotion } from './fake-mermaid';
import { EVENTS, EXCHANGES, RUN_ID } from './fixtures/decodable-run';

vi.mock('mermaid', async () => (await import('./fake-mermaid')).fakeMermaidModule());

// jsdom has no matchMedia; tests that stub it get the original (absent) one back.
const originalMatchMedia: unknown = Reflect.get(window, 'matchMedia');
afterEach(() => {
  Reflect.set(window, 'matchMedia', originalMatchMedia);
});

const TEXT = { title: 'Run r1: a to b to c', description: 'Seven recorded HTTP messages.' };
const SYNTHETIC_EVENTS: RunEvent[] = exampleRun.events.map((event) => RunEventSchema.parse(event));

describe('buildSequenceDiagram', () => {
  it('draws exactly one message per recorded exchange, in recording order', () => {
    const diagram = buildSequenceDiagram(EVENTS, TEXT);
    expect(diagram.messages.map((m) => m.exchangeId)).toEqual(EXCHANGES.map((x) => x.id));
    const arrows = diagram.source.split('\n').filter((line) => /->>|-x/.test(line));
    expect(arrows).toHaveLength(EXCHANGES.length);
    expect(arrows[0]).toBe('  Playground->>Issuer: 1. POST /ref/issuer/offers → 201');
    expect(arrows[2]).toBe('  Wallet->>Issuer: 3. POST /ref/issuer/credential → 200');
  });

  it('carries accTitle and accDescr for screen readers', () => {
    const { source } = buildSequenceDiagram(EVENTS, TEXT);
    expect(source).toContain('accTitle: Run r1: a to b to c');
    expect(source).toContain('accDescr: Seven recorded HTTP messages.');
    expect(source.startsWith('sequenceDiagram\n')).toBe(true);
  });

  it('also works on the synthetic example run (placeholder payloads)', () => {
    const diagram = buildSequenceDiagram(SYNTHETIC_EVENTS, TEXT);
    expect(diagram.messages).toHaveLength(SYNTHETIC_EVENTS.filter((e) => e.type === 'exchange').length);
  });

  it('draws a failed exchange as a cross arrow and an empty run as lifelines only', () => {
    const failed = { ...EXCHANGES[0]!, response: { status: 400, headers: {}, body: '{}' } };
    const diagram = buildSequenceDiagram([{ type: 'exchange', runId: RUN_ID, exchange: failed }], TEXT);
    expect(diagram.source).toContain('Playground-xIssuer: 1. POST /ref/issuer/offers → 400');
    expect(buildSequenceDiagram([], TEXT).messages).toEqual([]);
  });

  it('places person actions as notes on the Person lifeline, in order', () => {
    const person = RunEventSchema.parse({
      type: 'person.action-needed',
      runId: RUN_ID,
      action: {
        id: 'a1',
        kind: 'scan-offer',
        title: 'Scan the offer with your wallet',
        instructions: ['Open the wallet app', 'Scan the QR code'],
        qrText: 'openid-credential-offer://?x',
        timeoutMs: 60_000,
      },
    });
    const diagram = buildSequenceDiagram([EVENTS[0]!, person, ...EVENTS.slice(1)], TEXT);
    expect(diagram.participants).toContain('Person');
    const lines = diagram.source.split('\n');
    expect(lines.findIndex((l) => l.includes('Note over Person'))).toBeLessThan(
      lines.findIndex((l) => l.includes('->>')),
    );
  });

  it('maps role ids to participants by run configuration, then by name', () => {
    const config = {
      ...exampleRun.config,
      issuer: 'my-issuer',
      vciProfile: 'draft13',
      vpProfile: 'inji-draft',
    } as never;
    expect(participantOf('my-issuer', config)).toBe('Issuer');
    expect(participantOf('mimoto')).toBe('Wallet');
    expect(participantOf('inji-verify')).toBe('Verifier');
    expect(participantOf('inji-certify')).toBe('Issuer');
    expect(participantOf('something-else')).toBe('Playground');
  });

  it('escapes characters Mermaid reads as syntax', () => {
    expect(escapeMermaidText('a;b#c<d>\n')).toBe('a#59;b#35;c#lt;d#gt;');
  });
});

describe('SequenceDiagram in the run explorer', () => {
  async function renderExplorer(events: readonly RunEvent[] = EVENTS) {
    const user = userEvent.setup();
    const view = render(<RunExplorer runId={RUN_ID} events={events} />);
    const figure = screen.getByTestId('sequence-diagram');
    const count = events.filter((event) => event.type === 'exchange').length;
    await waitFor(() =>
      expect(figure.querySelectorAll('[role="button"][data-exchange-id]')).toHaveLength(count),
    );
    return { user, figure, ...view };
  }

  it('renders one focusable message per exchange and keeps accTitle / accDescr in the SVG', async () => {
    const { figure } = await renderExplorer();
    const svg = figure.querySelector('svg')!;
    expect(svg.querySelector('title')?.textContent).toBe(
      `Run ${RUN_ID}: ref-issuer to ref-wallet to ref-verifier`,
    );
    expect(svg.querySelector('desc')?.textContent).toMatch(/^7 recorded HTTP messages/);
    const messages = [...figure.querySelectorAll<SVGElement>('[role="button"][data-exchange-id]')];
    expect(messages.map((m) => m.getAttribute('data-exchange-id'))).toEqual(EXCHANGES.map((x) => x.id));
    for (const message of messages) expect(message.getAttribute('tabindex')).toBe('0');
    expect(messages[2]!.getAttribute('aria-label')).toBe(
      'Wallet to Issuer: 3. POST /ref/issuer/credential → 200. Open in the inspector.',
    );
  });

  it('clicking a diagram message selects that exchange in the inspector and moves focus to it', async () => {
    const { user, figure } = await renderExplorer();
    const credentialMessage = figure.querySelector<SVGElement>(
      `[role="button"][data-exchange-id="${RUN_ID}-x3"]`,
    )!;
    await user.click(credentialMessage);
    const detail = await screen.findByTestId('exchange-detail');
    expect(detail).toHaveAttribute('data-exchange-id', `${RUN_ID}-x3`);
    const heading = within(detail).getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Message 3: POST /ref/issuer/credential');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(credentialMessage).toHaveAttribute('aria-current', 'true');
    expect(credentialMessage.classList.contains('seq-selected')).toBe(true);
  });

  it('a clicked arrow line selects its exchange too, and Enter on a focused label does the same', async () => {
    const { user, figure } = await renderExplorer();
    const line = figure.querySelector<SVGElement>(`line[data-exchange-id="${RUN_ID}-x6"]`)!;
    await user.click(line);
    expect(await screen.findByTestId('exchange-detail')).toHaveAttribute('data-exchange-id', `${RUN_ID}-x6`);

    const label = figure.querySelector<SVGElement>(`[role="button"][data-exchange-id="${RUN_ID}-x5"]`)!;
    label.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByTestId('exchange-detail')).toHaveAttribute('data-exchange-id', `${RUN_ID}-x5`),
    );
  });

  it('selecting in the inspector marks the arrow in the diagram', async () => {
    const { user, figure } = await renderExplorer();
    const nav = screen.getByRole('navigation', { name: /recorded messages/i });
    await user.click(within(nav).getByRole('button', { name: /^2\. POST \/ref\/issuer\/token/ }));
    const message = figure.querySelector(`[role="button"][data-exchange-id="${RUN_ID}-x2"]`)!;
    await waitFor(() => expect(message).toHaveAttribute('aria-current', 'true'));
  });

  it('highlights the newest arrow and animates it when motion is allowed', async () => {
    stubReducedMotion(false);
    const { figure } = await renderExplorer();
    expect(figure).toHaveAttribute('data-motion', 'full');
    const newest = figure.querySelectorAll('.seq-newest');
    expect([...newest].every((node) => node.getAttribute('data-exchange-id') === `${RUN_ID}-x7`)).toBe(true);
    expect(newest.length).toBe(2);
    expect(figure.querySelectorAll('.seq-animate')).toHaveLength(2);
  });

  it('reduced motion disables the animation but keeps the newest-arrow mark', async () => {
    stubReducedMotion(true);
    const { figure } = await renderExplorer();
    expect(figure).toHaveAttribute('data-motion', 'reduced');
    expect(figure.querySelectorAll('.seq-animate')).toHaveLength(0);
    expect(figure.querySelectorAll('.seq-newest').length).toBe(2);
    expect(figure).toHaveTextContent('Animation is off because the system asks for reduced motion.');
  });

  it('adds an arrow when a new exchange is recorded during a live run', async () => {
    const { figure, rerender } = await renderExplorer(EVENTS.slice(0, 3));
    expect(figure).toHaveAttribute('data-messages', '1');
    rerender(<RunExplorer runId={RUN_ID} events={EVENTS} />);
    await waitFor(() => expect(figure.querySelectorAll('[role="button"][data-exchange-id]')).toHaveLength(7));
    expect(figure.querySelector('.seq-newest')).toHaveAttribute('data-exchange-id', `${RUN_ID}-x7`);
  }, 30_000);
});
