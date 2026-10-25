// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The sequence diagram and the protocol inspector of one run, sharing one selection: choosing an arrow
 * in the diagram opens that exchange in the inspector and moves focus to it; choosing a message in the
 * inspector marks its arrow. Until the person chooses, the inspector follows the newest message.
 *
 * It takes the events as a prop, so the same component shows a live run, a stored run and a playback
 * position (a prefix of the stored events).
 */
import type { RunEvent } from '@inji-playground/protocol';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SequenceDiagram } from '../sequence/SequenceDiagram';
import { Inspector } from './Inspector';
import { buildInspectorModel, findItem } from './model';

interface RunExplorerProps {
  runId: string;
  events: readonly RunEvent[];
}

export function RunExplorer({ runId, events }: RunExplorerProps) {
  const { t } = useTranslation();
  const model = useMemo(() => buildInspectorModel(events), [events]);
  const [chosenId, setChosenId] = useState<string>();
  const detailHeading = useRef<HTMLHeadingElement>(null);

  // A chosen item that is not (or no longer, after stepping back in playback) in the run falls back to
  // following the newest item.
  const chosen = findItem(model, chosenId);
  const selected = chosen ?? model.items[model.items.length - 1];
  const following = chosen === undefined;

  const selectFromDiagram = (id: string) => {
    setChosenId(id);
    // Keyboard and screen-reader users land on the payload they asked for.
    requestAnimationFrame(() => detailHeading.current?.focus());
  };

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section aria-labelledby="sequence-heading" className="min-w-0 space-y-3">
        <h2 id="sequence-heading" className="text-lg font-semibold">
          {t('sequence.heading')}
        </h2>
        <SequenceDiagram
          runId={runId}
          events={events}
          onSelect={selectFromDiagram}
          {...(selected?.kind === 'exchange' ? { selectedId: selected.id } : {})}
        />
      </section>
      <section aria-labelledby="inspector-heading" className="min-w-0 space-y-3">
        <h2 id="inspector-heading" className="text-lg font-semibold">
          {t('inspector.heading')}
        </h2>
        <Inspector
          ref={detailHeading}
          runId={runId}
          model={model}
          following={following}
          onSelect={setChosenId}
          {...(selected ? { selected } : {})}
        />
      </section>
    </div>
  );
}
