// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Run settings and the Run button. The format and protocol lists offer only values every selected role
 * supports; the scenario picker offers the happy path and the tamper and probe scenarios that fit the
 * format, and says what a correct verifier must answer before the run. Run posts the selected
 * configuration to `POST /api/runs` and hands the new run id to the timeline; once the verifier has
 * answered, the expected outcome is shown next to the actual one.
 */
import { useId, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../../api/http';
import { useCompatibility, useCreateRun } from '../../api/queries';
import { announce } from '../../state/announcer';
import { usePlaygroundStore } from '../../state/playground';
import { ScenarioExpectation, ScenarioPicker, TamperRunResult } from '../tamper/TamperControls';
import { useScenarioChoice } from '../tamper/use-scenario';
import type { RunChoice } from '../selector/compatibility';
import { describeIncompatibility } from '../selector/describe';
import { runConfigOf, useCombination } from '../selector/use-combination';

export function RunBar() {
  const { t } = useTranslation();
  const combination = useCombination();
  const setPreference = usePlaygroundStore((state) => state.setPreference);
  const runStarted = usePlaygroundStore((state) => state.runStarted);
  const activeRunId = usePlaygroundStore((state) => state.activeRunId);
  const { scenario } = useScenarioChoice(combination.choice?.format);
  // The server also checks the scenario: a tamper variant needs the reference issuer or wallet.
  const server = useCompatibility(combination.query ? { ...combination.query, scenario: scenario.id } : null);
  const createRun = useCreateRun();
  const statusId = useId();
  const expectationId = useId();

  const { options, choice, complete } = combination;
  const serverReasons = server.data?.reasons ?? [];
  const serverBlocks = server.data !== undefined && !server.data.runnable;
  const serverBlock = serverReasons.filter((r) => r.severity === 'blocking').map((r) => r.message);
  const warnings = serverReasons.filter((r) => r.severity === 'warning').map((r) => r.message);
  const localBlock = combination.problems.map((problem) => describeIncompatibility(problem, t));
  const blockReasons = [...localBlock, ...serverBlock];
  const config = serverBlocks ? undefined : runConfigOf(combination, scenario.id);

  let blockedText: string | undefined;
  if (!complete) blockedText = t('runBar.needRoles');
  else if (blockReasons.length > 0)
    blockedText = t('runBar.incompatible', { reason: blockReasons.join('; ') });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!config) return;
    createRun.mutate(config, {
      onSuccess: ({ runId }) => {
        runStarted(runId);
        announce(t('runBar.started', { runId }));
      },
    });
  };

  // min-w-0 and max-w-full: a select sized to its longest option must not push a phone screen sideways.
  const field = 'flex min-w-0 max-w-full flex-col gap-1 text-sm';
  const select =
    'max-w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-fg disabled:bg-surface-muted disabled:text-fg-muted';

  return (
    <section aria-labelledby="run-bar-heading" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="run-bar-heading" className="mb-3 text-lg font-semibold">
        {t('runBar.heading')}
      </h2>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
        <ChoiceSelect
          label={t('runBar.format')}
          className={field}
          selectClassName={select}
          value={choice?.format}
          values={options.formats}
          optionLabel={(f) => t(`format.${f}`)}
          onChange={(value) => setPreference('format', value)}
          emptyLabel={t('runBar.noFormat')}
        />
        <ChoiceSelect
          label={t('runBar.vciProfile')}
          className={field}
          selectClassName={select}
          value={choice?.vciProfile}
          values={options.vciProfiles}
          optionLabel={(p) => t(`vciProfile.${p}`)}
          onChange={(value) => setPreference('vciProfile', value)}
        />
        <ChoiceSelect
          label={t('runBar.vpProfile')}
          className={field}
          selectClassName={select}
          value={choice?.vpProfile}
          values={options.vpProfiles}
          optionLabel={(p) => t(`vpProfile.${p}`)}
          onChange={(value) => setPreference('vpProfile', value)}
        />
        <ScenarioPicker
          format={choice?.format}
          describedBy={expectationId}
          className={field}
          selectClassName={select}
        />
        <button
          type="submit"
          disabled={!config || createRun.isPending}
          aria-describedby={statusId}
          className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted"
        >
          {createRun.isPending ? t('runBar.starting') : t('runBar.run')}
        </button>
      </form>

      <ScenarioExpectation id={expectationId} format={choice?.format} />

      <div id={statusId} className="mt-3 text-sm">
        {blockedText && <p className="text-fg-muted">{blockedText}</p>}
        {warnings.map((warning) => (
          <p key={warning} className="text-warn">
            {t('runBar.warning', { reason: warning })}
          </p>
        ))}
        {createRun.isError && (
          <p role="alert" className="text-fail">
            {t('runBar.failed', { reason: describeError(createRun.error) })}
          </p>
        )}
      </div>

      <TamperRunResult runId={activeRunId} />
    </section>
  );
}

interface ChoiceSelectProps<T extends RunChoice[keyof RunChoice]> {
  label: string;
  value: T | undefined;
  values: readonly T[];
  optionLabel: (value: T) => string;
  onChange: (value: T) => void;
  emptyLabel?: string;
  className: string;
  selectClassName: string;
}

function ChoiceSelect<T extends RunChoice[keyof RunChoice]>({
  label,
  value,
  values,
  optionLabel,
  onChange,
  emptyLabel,
  className,
  selectClassName,
}: ChoiceSelectProps<T>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={selectClassName}
        value={value ?? ''}
        disabled={values.length === 0}
        onChange={(event) => {
          const next = values.find((v) => v === event.target.value);
          if (next !== undefined) onChange(next);
        }}
      >
        {values.length === 0 && <option value="">{emptyLabel ?? '—'}</option>}
        {values.map((v) => (
          <option key={v} value={v}>
            {optionLabel(v)}
          </option>
        ))}
      </select>
    </div>
  );
}
