/**
 * Filter bar of the matrix: roles, format, OpenID4VP profile, run mode, scenario, and whether to hide
 * combinations that cannot run. Role options come from the matrix answer itself, so a role that is no
 * longer registered but still has stored runs can be chosen.
 */
import {
  CREDENTIAL_FORMATS,
  RunModeSchema,
  VpProfileSchema,
  type MatrixRole,
  type RoleKind,
} from '@inji-playground/protocol';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useScenarios } from '../tamper/api';
import { HAPPY_FALLBACK } from '../tamper/scenarios';
import type { MatrixFilter } from './api';

interface MatrixFiltersProps {
  filter: MatrixFilter;
  onChange: (next: MatrixFilter) => void;
  roles: readonly MatrixRole[];
}

const control = 'rounded-md border border-line-strong bg-surface px-2 py-1.5 text-fg';

export function MatrixFilters({ filter, onChange, roles }: MatrixFiltersProps) {
  const { t } = useTranslation();
  const scenarios = useScenarios();
  const checkboxId = useId();
  const catalogue = scenarios.data && scenarios.data.length > 0 ? scenarios.data : [HAPPY_FALLBACK];

  const update = <K extends keyof MatrixFilter>(key: K, value: MatrixFilter[K] | '') => {
    const next = { ...filter };
    if (value === '' || value === undefined) delete next[key];
    else next[key] = value as MatrixFilter[K];
    onChange({ ...next, scenario: next.scenario ?? HAPPY_FALLBACK.id });
  };
  const roleOptions = (kind: RoleKind) =>
    roles.filter((role) => role.kind === kind).map((role) => ({ value: role.id, label: role.name }));

  return (
    <form
      aria-labelledby="matrix-filters-heading"
      className="rounded-lg border border-line bg-surface p-4 print:hidden"
      onSubmit={(event) => event.preventDefault()}
    >
      <h2 id="matrix-filters-heading" className="mb-3 text-lg font-semibold">
        {t('matrix.filters.heading')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(['issuer', 'wallet', 'verifier'] as const).map((kind) => (
          <Select
            key={kind}
            label={t(`role.kind.${kind}`)}
            value={filter[kind]}
            options={roleOptions(kind)}
            onChange={(value) => update(kind, value)}
          />
        ))}
        <Select
          label={t('history.filters.format')}
          value={filter.credentialFormat}
          options={CREDENTIAL_FORMATS.map((f) => ({ value: f, label: t(`format.${f}`) }))}
          onChange={(value) => update('credentialFormat', value as MatrixFilter['credentialFormat'])}
        />
        <Select
          label={t('runBar.vpProfile')}
          value={filter.vpProfile}
          options={VpProfileSchema.options.map((p) => ({ value: p, label: t(`vpProfile.${p}`) }))}
          onChange={(value) => update('vpProfile', value as MatrixFilter['vpProfile'])}
        />
        <Select
          label={t('history.filters.mode')}
          value={filter.mode}
          options={RunModeSchema.options.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
          onChange={(value) => update('mode', value as MatrixFilter['mode'])}
        />
        <Select
          label={t('runBar.scenario')}
          value={filter.scenario}
          required
          options={catalogue.map((s) => ({ value: s.id, label: s.title }))}
          onChange={(value) => update('scenario', value)}
        />
        <div className="flex items-end gap-2 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            className="size-4"
            checked={filter.hideNotSupported}
            onChange={(event) => onChange({ ...filter, hideNotSupported: event.target.checked })}
          />
          <label htmlFor={checkboxId}>{t('matrix.filters.hideNotSupported')}</label>
        </div>
      </div>
    </form>
  );
}

interface SelectProps {
  label: string;
  value: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  /** No "any" entry: a value must always be chosen. */
  required?: boolean;
}

function Select({ label, value, options, onChange, required = false }: SelectProps) {
  const { t } = useTranslation();
  const id = useId();
  const all = value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <select id={id} className={control} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!required && <option value="">{t('history.filters.any')}</option>}
        {all.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
