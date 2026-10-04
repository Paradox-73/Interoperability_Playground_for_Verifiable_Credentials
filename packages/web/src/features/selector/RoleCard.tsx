/**
 * One implementation in a selector column. The whole card is the label of a native radio button, so it
 * is clickable and keyboard-operable (arrow keys move within the column) without custom key handling.
 * Its accessible name is the role name; everything else on the card is its description.
 */
import type { RoleStatus } from '@inji-playground/protocol';
import { useTranslation } from 'react-i18next';
import { reasonsFor } from '../../api/compatibility';
import { useCompatibility } from '../../api/queries';
import { HealthLabel } from '../../app/HealthLabel';
import { CheckIcon, WarningIcon } from '../../app/icons';
import { usePlaygroundStore } from '../../state/playground';
import { describeIncompatibility } from './describe';
import { candidateCombination, type Combination } from './use-combination';

interface RoleCardProps {
  role: RoleStatus;
  current: Combination;
  selected: boolean;
}

export function RoleCard({ role, current, selected }: RoleCardProps) {
  const { t } = useTranslation();
  const { descriptor, health } = role;
  const selectRole = usePlaygroundStore((state) => state.selectRole);
  const preferred = usePlaygroundStore((state) => state.preferred);

  const { combination, ownProblems } = candidateCombination(current.triple, descriptor, preferred);
  const server = useCompatibility(combination.query);
  const serverReasons = reasonsFor(server.data, descriptor.id);

  const reasons: CardReason[] = [
    ...ownProblems.map((problem) => ({
      key: problem.code,
      text: describeIncompatibility(problem, t),
      gapIds: [],
    })),
    ...serverReasons
      .filter((reason) => reason.severity === 'blocking')
      .map((reason) => ({ key: `server-${reason.code}`, text: reason.message, gapIds: reason.gapIds })),
  ];
  const warnings: CardReason[] = serverReasons
    .filter((reason) => reason.severity === 'warning')
    .map((reason) => ({ key: `warning-${reason.code}`, text: reason.message, gapIds: reason.gapIds }));
  const incompatible = reasons.length > 0;

  const baseId = `role-${descriptor.id}`;
  const { capabilities } = descriptor;

  const frame = selected
    ? 'border-2 border-accent bg-accent-soft'
    : incompatible
      ? 'border border-dashed border-line-strong bg-surface-muted'
      : 'border border-line bg-surface hover:border-line-strong';

  return (
    <label
      htmlFor={`${baseId}-input`}
      data-testid={`role-card-${descriptor.id}`}
      data-incompatible={incompatible || undefined}
      className={`block cursor-pointer rounded-lg p-3 has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${frame}`}
    >
      <span className="flex items-start gap-3">
        <input
          id={`${baseId}-input`}
          type="radio"
          name={`role-${descriptor.kind}`}
          value={descriptor.id}
          checked={selected}
          onChange={() => selectRole(descriptor.kind, descriptor.id)}
          aria-labelledby={`${baseId}-name`}
          aria-describedby={`${baseId}-details`}
          className="mt-1 size-4 shrink-0 accent-accent focus-visible:outline-none"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span id={`${baseId}-name`} className="font-medium">
              {descriptor.name}
            </span>
            {selected && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                <CheckIcon />
                {t('role.selected')}
              </span>
            )}
          </span>

          <span id={`${baseId}-details`} className="mt-1 block space-y-1.5 text-sm">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <EcosystemTag ecosystem={descriptor.ecosystem} />
              <span className="text-fg-muted">{t('role.version', { version: descriptor.version })}</span>
              <HealthLabel health={health} showDetail />
            </span>

            {descriptor.description && <span className="block text-fg-muted">{descriptor.description}</span>}
            <span className="block text-fg-muted">{t(`role.interaction.${descriptor.interaction}`)}</span>

            <ChipRow label={t('role.formats')} values={capabilities.formats.map((f) => t(`format.${f}`))} />
            {capabilities.proofTypes.length > 0 && (
              <ChipRow label={t('role.proofs')} values={capabilities.proofTypes} mono />
            )}

            {incompatible && <ReasonBox title={t('role.incompatible')} reasons={reasons} />}
            {warnings.length > 0 && <ReasonBox title={t('role.limitation')} reasons={warnings} />}

            {descriptor.notes?.map((note) => (
              <span key={note} className="block text-fg-muted">
                {note}
              </span>
            ))}
          </span>
        </span>
      </span>
    </label>
  );
}

interface CardReason {
  key: string;
  text: string;
  gapIds: string[];
}

function ReasonBox({ title, reasons }: { title: string; reasons: CardReason[] }) {
  const { t } = useTranslation();
  return (
    <span className="block rounded-md border border-warn bg-surface p-2">
      <span className="flex items-center gap-1 font-medium text-warn">
        <WarningIcon />
        {title}
      </span>
      {reasons.map((reason) => (
        <span key={reason.key} className="mt-1 block text-fg">
          {reason.text}
          {reason.gapIds.length > 0 && (
            <span className="text-fg-muted"> ({t('role.gaps', { ids: reason.gapIds.join(', ') })})</span>
          )}
        </span>
      ))}
    </span>
  );
}

function EcosystemTag({ ecosystem }: { ecosystem: RoleStatus['descriptor']['ecosystem'] }) {
  const { t } = useTranslation();
  const style = ecosystem === 'inji' ? 'border-accent text-accent' : 'border-line-strong text-fg';
  return (
    <span className={`rounded border px-1.5 py-px text-xs font-semibold uppercase tracking-wide ${style}`}>
      {t(`role.ecosystem.${ecosystem}`)}
    </span>
  );
}

function ChipRow({ label, values, mono = false }: { label: string; values: string[]; mono?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-fg-muted">{label}:</span>
      {values.map((value) => (
        <span
          key={value}
          className={`rounded border border-line bg-surface-muted px-1.5 py-px text-xs text-fg ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </span>
      ))}
    </span>
  );
}
