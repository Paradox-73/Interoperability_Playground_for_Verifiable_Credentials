/**
 * "Replay with tamper" on the report page: runs the stored configuration again with a chosen scenario
 * (`POST /api/runs` with `replayOf`), then opens the new run.
 */
import type { CredentialFormat } from '@inji-playground/protocol';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { describeError } from '../../api/http';
import { announce } from '../../state/announcer';
import { usePlaygroundStore } from '../../state/playground';
import { useScenarios, useStartRun } from './api';
import { HAPPY_FALLBACK, effectiveScenario, groupScenarios } from './scenarios';
import { ExpectationText, ScenarioOptions } from './TamperControls';

interface ReplayWithTamperProps {
  runId: string;
  format: CredentialFormat;
  /** Scenario of the stored run; the menu starts on the first other scenario. */
  currentScenario: string;
}

export function ReplayWithTamper({ runId, format, currentScenario }: ReplayWithTamperProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const runStarted = usePlaygroundStore((state) => state.runStarted);
  const { data } = useScenarios();
  const startRun = useStartRun();
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const selectId = useId();
  const descriptionId = useId();

  const catalogue = data && data.length > 0 ? data : [HAPPY_FALLBACK];
  const groups = groupScenarios(catalogue, format);
  const firstOther = groups.flatMap((g) => g.scenarios).find((s) => s.id !== currentScenario);
  const scenario = effectiveScenario(catalogue, chosen ?? firstOther?.id ?? currentScenario, format);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    startRun.mutate(
      { replayOf: runId, scenario: scenario.id },
      {
        onSuccess: ({ runId: newRunId }) => {
          runStarted(newRunId);
          announce(t('tamper.replayStarted', { runId: newRunId }));
          void navigate(`/runs/${encodeURIComponent(newRunId)}`);
        },
      },
    );
  };

  return (
    <section aria-labelledby="replay-heading" className="space-y-3 print:hidden">
      <h2 id="replay-heading" className="text-lg font-semibold">
        {t('tamper.replayHeading')}
      </h2>
      <p className="text-sm text-fg-muted">{t('tamper.replayIntro')}</p>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={selectId}>{t('tamper.replayScenario')}</label>
          <select
            id={selectId}
            value={scenario.id}
            aria-describedby={descriptionId}
            onChange={(event) => setChosen(event.target.value)}
            className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-fg"
          >
            <ScenarioOptions groups={groups} />
          </select>
        </div>
        <button
          type="submit"
          disabled={startRun.isPending}
          className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted"
        >
          {startRun.isPending ? t('runBar.starting') : t('tamper.replay')}
        </button>
      </form>
      <div id={descriptionId} className="rounded-md border border-line bg-surface-muted p-3 text-sm">
        <ExpectationText scenario={scenario} />
      </div>
      {startRun.isError && (
        <p role="alert" className="text-sm text-fail">
          {t('runBar.failed', { reason: describeError(startRun.error) })}
        </p>
      )}
    </section>
  );
}
