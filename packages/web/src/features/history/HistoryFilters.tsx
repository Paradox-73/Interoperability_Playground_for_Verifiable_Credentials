// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Filter bar of the history dashboard. Every control writes to the page address (see `filters.ts`),
 * and the page reads its queries from there, so the address is the single source of the filter.
 */
import {
  CREDENTIAL_FORMATS,
  OutcomeSchema,
  RunModeSchema,
  VerdictSchema,
  type RoleKind,
} from '@inji-playground/protocol';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoles } from '../../api/queries';
import { useScenarios } from '../tamper/api';
import type { HistoryFilter, HistoryFilterKey } from './filters';

interface HistoryFiltersProps {
  filter: HistoryFilter;
  onChange: (key: HistoryFilterKey, value: string | undefined) => void;
  onClear: () => void;
}

const control = 'rounded-md border border-line-strong bg-surface px-2 py-1.5 text-fg';

export function HistoryFilters({ filter, onChange, onClear }: HistoryFiltersProps) {
  const { t } = useTranslation();
  const roles = useRoles();
  const scenarios = useScenarios();

  const roleOptions = (kind: RoleKind) =>
    (roles.data ?? [])
      .filter((role) => role.descriptor.kind === kind)
      .map((role) => ({ value: role.descriptor.id, label: role.descriptor.name }));

  const set = (key: HistoryFilterKey) => (value: string) => onChange(key, value || undefined);

  return (
    <form
      aria-labelledby="history-filters-heading"
      className="rounded-lg border border-line bg-surface p-4 print:hidden"
      onSubmit={(event) => event.preventDefault()}
    >
      <h2 id="history-filters-heading" className="mb-3 text-lg font-semibold">
        {t('history.filters.heading')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {(['issuer', 'wallet', 'verifier'] as const).map((kind) => (
          <FilterSelect
            key={kind}
            label={t(`role.kind.${kind}`)}
            value={filter[kind]}
            onChange={set(kind)}
            options={roleOptions(kind)}
          />
        ))}
        <FilterSelect
          label={t('history.filters.format')}
          value={filter.format}
          onChange={set('format')}
          options={CREDENTIAL_FORMATS.map((f) => ({ value: f, label: t(`format.${f}`) }))}
        />
        <FilterSelect
          label={t('history.filters.scenario')}
          value={filter.scenario}
          onChange={set('scenario')}
          options={(scenarios.data ?? []).map((s) => ({ value: s.id, label: s.title }))}
        />
        <FilterSelect
          label={t('history.filters.outcome')}
          value={filter.outcome}
          onChange={set('outcome')}
          options={OutcomeSchema.options.map((o) => ({ value: o, label: t(`outcome.${o}`) }))}
        />
        <FilterSelect
          label={t('history.filters.verdict')}
          value={filter.verdict}
          onChange={set('verdict')}
          options={VerdictSchema.options.map((v) => ({ value: v, label: t(`verdict.${v}`) }))}
        />
        <FilterSelect
          label={t('history.filters.mode')}
          value={filter.mode}
          onChange={set('mode')}
          options={RunModeSchema.options.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
        />
        <FilterField label={t('history.filters.version')}>
          {(id) => (
            <input
              id={id}
              type="search"
              className={control}
              value={filter.version ?? ''}
              placeholder={t('history.filters.versionPlaceholder')}
              onChange={(event) => set('version')(event.target.value)}
            />
          )}
        </FilterField>
        <FilterField label={t('history.filters.from')}>
          {(id) => (
            <input
              id={id}
              type="date"
              className={control}
              value={filter.fromDate ?? ''}
              onChange={(event) => set('fromDate')(event.target.value)}
            />
          )}
        </FilterField>
        <FilterField label={t('history.filters.to')}>
          {(id) => (
            <input
              id={id}
              type="date"
              className={control}
              value={filter.toDate ?? ''}
              onChange={(event) => set('toDate')(event.target.value)}
            />
          )}
        </FilterField>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
          >
            {t('history.filters.clear')}
          </button>
        </div>
      </div>
    </form>
  );
}

function FilterField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const { t } = useTranslation();
  // A filter value that is not offered any more (for example a role no longer registered) stays visible.
  const all =
    value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  return (
    <FilterField label={label}>
      {(id) => (
        <select id={id} className={control} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('history.filters.any')}</option>
          {all.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FilterField>
  );
}
