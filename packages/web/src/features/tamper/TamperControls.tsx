/**
 * Tamper controls of the run bar.
 *
 * Before a run: `ScenarioPicker` lists the happy path and the tamper scenarios that fit the chosen
 * format, and `ScenarioExpectation` says what a correct verifier must answer and why.
 * After a run: `TamperRunResult` puts the expected outcome next to the verifier's actual answer.
 */
import type { CredentialFormat, InteropReport, ScenarioSpec } from '@inji-playground/protocol';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRunEvents } from '../../state/run-events';
import { buildRunView } from '../../state/run-view';
import { OutcomeBadge, StatusBadge, STATUS_STYLE } from '../report/badges';
import { compareOutcome, type ScenarioGroup } from './scenarios';
import { useScenarioChoice } from './use-scenario';

/** The `<optgroup>`s of a scenario select: no tampering, credential tampering, presentation tampering. */
export function ScenarioOptions({ groups }: { groups: readonly ScenarioGroup[] }) {
  const { t } = useTranslation();
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.target} label={t(`tamper.target.${group.target}`)}>
          {group.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

interface ScenarioPickerProps {
  format: CredentialFormat | undefined;
  /** Id of the element that explains the chosen scenario (ScenarioExpectation). */
  describedBy: string;
  className: string;
  selectClassName: string;
}

export function ScenarioPicker({ format, describedBy, className, selectClassName }: ScenarioPickerProps) {
  const { t } = useTranslation();
  const { scenario, groups, choose } = useScenarioChoice(format);
  return (
    <div className={className}>
      <label htmlFor="scenario-picker">{t('runBar.scenario')}</label>
      <select
        id="scenario-picker"
        className={selectClassName}
        value={scenario.id}
        aria-describedby={describedBy}
        onChange={(event) => choose(event.target.value)}
      >
        <ScenarioOptions groups={groups} />
      </select>
    </div>
  );
}

/** What the chosen scenario does and the outcome a correct verifier must report, shown before the run. */
export function ScenarioExpectation({ id, format }: { id: string; format: CredentialFormat | undefined }) {
  const { t } = useTranslation();
  const { scenario, error } = useScenarioChoice(format);
  return (
    <div
      id={id}
      className="mt-3 rounded-md border border-line bg-surface-muted p-3 text-sm"
      data-testid="scenario-expectation"
    >
      <ExpectationText scenario={scenario} />
      {error && <p className="mt-1 text-warn">{t('tamper.catalogueError', { reason: error.message })}</p>}
    </div>
  );
}

export function ExpectationText({ scenario }: { scenario: ScenarioSpec }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2">
        <span className="font-semibold">{scenario.title}</span>
        <span className="inline-flex items-center gap-1">
          {t('tamper.expectedLabel')} <OutcomeBadge outcome={scenario.expected} />
        </span>
      </p>
      <p className="mt-1">{scenario.description}</p>
      {scenario.reference && (
        <p className="mt-1 text-fg-muted">{t('tamper.reference', { reference: scenario.reference })}</p>
      )}
    </>
  );
}

/** Expected next to actual for a finished run, with the sentence that explains the difference. */
export function OutcomeComparisonView({ report }: { report: InteropReport }) {
  const { t } = useTranslation();
  const comparison = compareOutcome(report);
  const { frame } = STATUS_STYLE[comparison.verdict];
  return (
    <div className={`rounded-md border-2 p-3 text-sm ${frame}`} data-testid="outcome-comparison">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">{t('tamper.scenario')}</dt>
        <dd className="font-mono">{report.scenario.id}</dd>
        <dt className="text-fg-muted">{t('tamper.expected')}</dt>
        <dd data-testid="expected-outcome">
          <OutcomeBadge outcome={comparison.expected} />
        </dd>
        <dt className="text-fg-muted">{t('tamper.actual')}</dt>
        <dd data-testid="actual-outcome">
          <OutcomeBadge outcome={comparison.actual} />
        </dd>
        <dt className="text-fg-muted">{t('tamper.verdict')}</dt>
        <dd>
          <StatusBadge status={comparison.verdict} />
        </dd>
      </dl>
      <p className="mt-2">{t(`tamper.explain.${comparison.kind}`)}</p>
    </div>
  );
}

/**
 * The run bar's after-run panel for the run being followed: the expected outcome while it runs, then
 * expected versus actual once the verifier has answered.
 */
export function TamperRunResult({ runId }: { runId: string | undefined }) {
  const { t } = useTranslation();
  const events = useRunEvents(runId);
  const view = useMemo(() => (runId ? buildRunView(runId, events) : undefined), [runId, events]);
  if (!view?.config) return null;
  return (
    <section aria-labelledby="tamper-result-heading" className="mt-3 space-y-2">
      <h3 id="tamper-result-heading" className="font-semibold">
        {t('tamper.resultHeading', { runId: view.runId })}
      </h3>
      {view.report ? (
        <OutcomeComparisonView report={view.report} />
      ) : (
        <p className="text-sm text-fg-muted">{t('tamper.waiting', { scenario: view.config.scenario })}</p>
      )}
    </section>
  );
}
