// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Animated, interactive sequence diagram of a run. Mermaid draws the SVG from `buildSequenceDiagram`;
 * this component then makes every arrow label a focusable button that opens its exchange in the
 * inspector, marks the newest arrow and the selected one, and animates the newest arrow unless the
 * person asked for reduced motion.
 */
import type { RunEvent } from '@inji-playground/protocol';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { buildSequenceDiagram, type DiagramMessage, type Participant } from './diagram';
import { loadMermaid, type DiagramTheme } from './mermaid-loader';
import './sequence.css';
import { usePrefersReducedMotion } from './use-reduced-motion';

interface SequenceDiagramProps {
  runId: string;
  events: readonly RunEvent[];
  selectedId?: string;
  onSelect: (exchangeId: string) => void;
}

/** The latest drawing Mermaid finished, for the diagram source it was made from. */
type RenderState =
  | { status: 'idle' }
  | { status: 'ready'; svg: string; source: string }
  | { status: 'error'; source: string; message: string };

function currentTheme(): DiagramTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
}

/** Mermaid theme following `<html data-theme>`, which the theme switch sets. */
function useDiagramTheme(): DiagramTheme {
  const [theme, setTheme] = useState<DiagramTheme>(currentTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const MESSAGE_SELECTOR = '[data-exchange-id]';

export function SequenceDiagram({ runId, events, selectedId, onSelect }: SequenceDiagramProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const theme = useDiagramTheme();
  const baseId = useId().replace(/[^A-Za-z0-9]/g, '');
  const renderCount = useRef(0);
  const canvas = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RenderState>({ status: 'idle' });

  const config = events.find((event) => event.type === 'run.started')?.config;
  const diagram = useMemo(() => {
    const roleName = (participant: Participant, id: string) =>
      `${t(`sequence.participant.${participant}`)} (${id})`;
    return buildSequenceDiagram(events, {
      title: config
        ? t('sequence.title', {
            runId,
            issuer: config.issuer,
            wallet: config.wallet,
            verifier: config.verifier,
          })
        : t('sequence.titleNoConfig', { runId }),
      description: t('sequence.description', {
        count: events.filter((event) => event.type === 'exchange').length,
      }),
      participantNames: config
        ? {
            Issuer: roleName('Issuer', config.issuer),
            Wallet: roleName('Wallet', config.wallet),
            Verifier: roleName('Verifier', config.verifier),
            Playground: t('sequence.participant.Playground'),
            Person: t('sequence.participant.Person'),
          }
        : {},
    });
  }, [events, config, runId, t]);

  const messages = diagram.messages;
  const newestId = messages[messages.length - 1]?.exchangeId;

  // Draw (again) whenever the diagram text or the theme changes. A newer drawing wins over a slower one.
  // State is only set when Mermaid answers; "loading" is derived below from which source was drawn.
  useEffect(() => {
    if (messages.length === 0) return;
    let cancelled = false;
    renderCount.current += 1;
    const id = `seq-${baseId}-${renderCount.current}`;
    const source = diagram.source;
    loadMermaid(theme)
      .then((mermaid) => mermaid.render(id, source))
      .then(({ svg }) => {
        if (!cancelled) setState({ status: 'ready', svg, source });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            status: 'error',
            source,
            message: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [diagram.source, messages.length, theme, baseId]);

  const drawnCurrent = state.status !== 'idle' && state.source === diagram.source;
  const loading = messages.length > 0 && !drawnCurrent;
  const failure = state.status === 'error' && drawnCurrent ? state.message : undefined;

  // Put the SVG in the page and turn each arrow label into a button. Runs only when a new SVG arrives,
  // so the newest-arrow animation plays once per new arrow. While the next drawing is made, the previous
  // one stays visible.
  const svg = state.status === 'ready' ? state.svg : undefined;
  useEffect(() => {
    const element = canvas.current;
    if (!element || svg === undefined) return;
    const focusedId = document.activeElement?.getAttribute('data-exchange-id');
    element.innerHTML = svg;
    decorate(element, messages, (message) =>
      t('sequence.messageLabel', {
        label: message.label,
        from: t(`sequence.participant.${message.from}`),
        to: t(`sequence.participant.${message.to}`),
      }),
    );
    // Re-rendering replaced the element that had focus; give focus back to the same message.
    if (focusedId)
      element.querySelector<SVGElement>(`[data-exchange-id="${CSS.escape(focusedId)}"]`)?.focus();
    // `messages` changes together with `svg`; `t` only when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg]);

  // Selection and newest marks change without redrawing.
  useEffect(() => {
    const element = canvas.current;
    if (!element || svg === undefined) return;
    for (const node of element.querySelectorAll<SVGElement>('[data-exchange-id]')) {
      const id = node.getAttribute('data-exchange-id');
      node.classList.toggle('seq-selected', id === selectedId);
      node.classList.toggle('seq-newest', id === newestId);
      node.classList.toggle('seq-animate', id === newestId && !reducedMotion);
      if (node.getAttribute('role') === 'button') {
        if (id === selectedId) node.setAttribute('aria-current', 'true');
        else node.removeAttribute('aria-current');
      }
    }
  }, [svg, selectedId, newestId, reducedMotion]);

  const activate = (target: EventTarget | null) => {
    const node = (target as Element | null)?.closest?.(MESSAGE_SELECTOR);
    const id = node?.getAttribute('data-exchange-id');
    if (id) onSelect(id);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => activate(event.target);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target as Element).closest?.(MESSAGE_SELECTOR)) return;
    event.preventDefault();
    activate(event.target);
  };

  return (
    <figure
      className="space-y-2"
      data-testid="sequence-diagram"
      data-motion={reducedMotion ? 'reduced' : 'full'}
      data-messages={messages.length}
    >
      {messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm text-fg-muted">
          {t('sequence.empty')}
        </p>
      ) : (
        <>
          {loading && (
            <p role="status" className="text-sm text-fg-muted">
              {t('sequence.loading')}
            </p>
          )}
          {failure !== undefined ? (
            <FallbackList messages={messages} selectedId={selectedId} onSelect={onSelect} error={failure} />
          ) : (
            // Clicks and keys are handled here for every arrow (event delegation); the arrows themselves
            // are focusable buttons inside the SVG.
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              ref={canvas}
              className="seq-canvas overflow-x-auto rounded-lg border border-line bg-surface p-2"
              onClick={onClick}
              onKeyDown={onKeyDown}
            />
          )}
          <figcaption className="text-xs text-fg-muted">
            {t('sequence.hint')}
            {reducedMotion && <> {t('sequence.motionReduced')}</>}
          </figcaption>
        </>
      )}
    </figure>
  );
}

/**
 * Mermaid writes one `.messageText` and one `.messageLine0` / `.messageLine1` per message, in message
 * order (notes use other classes). Labels become buttons; lines get the same id so a click on the arrow
 * itself also selects the exchange.
 */
function decorate(
  root: Element,
  messages: readonly DiagramMessage[],
  label: (message: DiagramMessage) => string,
) {
  const texts = root.querySelectorAll<SVGElement>('.messageText');
  const lines = root.querySelectorAll<SVGElement>('.messageLine0, .messageLine1');
  messages.forEach((message, index) => {
    const text = texts[index];
    if (text) {
      text.setAttribute('data-exchange-id', message.exchangeId);
      text.setAttribute('tabindex', '0');
      text.setAttribute('role', 'button');
      text.setAttribute('aria-label', label(message));
      text.classList.add('seq-message');
      if (message.failed) text.classList.add('seq-failed');
    }
    const line = lines[index];
    if (line && texts.length === lines.length) {
      line.setAttribute('data-exchange-id', message.exchangeId);
      line.classList.add('seq-line');
    }
  });
}

function FallbackList({
  messages,
  selectedId,
  onSelect,
  error,
}: {
  messages: readonly DiagramMessage[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  error: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-sm text-warn">{t('sequence.failed', { message: error })}</p>
      <ol className="space-y-0.5 font-mono text-xs">
        {messages.map((message) => (
          <li key={message.exchangeId}>
            <button
              type="button"
              className="rounded px-1 text-left hover:bg-surface-muted"
              aria-current={message.exchangeId === selectedId ? 'true' : undefined}
              onClick={() => onSelect(message.exchangeId)}
            >
              {t(`sequence.participant.${message.from}`)} → {t(`sequence.participant.${message.to}`)}:{' '}
              {message.label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
