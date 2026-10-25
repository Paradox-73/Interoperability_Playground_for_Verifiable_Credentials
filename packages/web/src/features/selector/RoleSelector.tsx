// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The three-column Issuer -> Wallet -> Verifier selector (PS02 task 2). Cards come from `GET /api/roles`.
 * On first load it preselects healthy Inji modules, else reference roles (default-selection.ts), until
 * the person picks a role themselves.
 */
import { RoleKindSchema, type RoleKind, type RoleStatus } from '@inji-playground/protocol';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../../api/http';
import { useRoles } from '../../api/queries';
import { ArrowRightIcon } from '../../app/icons';
import { usePlaygroundStore } from '../../state/playground';
import { pickDefaultSelection } from './default-selection';
import { RoleCard } from './RoleCard';
import { useCombination, type Combination } from './use-combination';

const KINDS = RoleKindSchema.options;

export function RoleSelector() {
  const { t } = useTranslation();
  const roles = useRoles();
  const combination = useCombination();
  const selection = usePlaygroundStore((state) => state.selection);
  const selectionSource = usePlaygroundStore((state) => state.selectionSource);
  const defaultBasis = usePlaygroundStore((state) => state.defaultBasis);
  const activeRunId = usePlaygroundStore((state) => state.activeRunId);
  const applyDefault = usePlaygroundStore((state) => state.applyDefault);

  // Preselect while the person has not chosen and no run is being watched. Health refreshes can move
  // the default (for example from reference roles to Inji once the stack is up).
  useEffect(() => {
    if (!roles.data || selectionSource === 'person' || activeRunId) return;
    const choice = pickDefaultSelection(roles.data);
    if (!choice) return;
    const same = KINDS.every((kind) => selection[kind] === choice.selection[kind]);
    if (!same) applyDefault(choice);
  }, [roles.data, selectionSource, activeRunId, selection, applyDefault]);

  return (
    <section aria-labelledby="selector-heading" className="space-y-3">
      <div>
        <h2 id="selector-heading" className="text-lg font-semibold">
          {t('selector.heading')}
        </h2>
        <p className="text-sm text-fg-muted">{t('selector.intro')}</p>
        {selectionSource === 'default' && defaultBasis && (
          <p className="text-sm text-fg-muted">
            {defaultBasis === 'inji' ? t('selector.defaultInji') : t('selector.defaultReference')}
          </p>
        )}
      </div>

      {roles.isPending && <p className="text-sm text-fg-muted">{t('selector.loading')}</p>}
      {roles.isError && (
        <p role="alert" className="text-sm text-fail">
          {t('selector.error', { reason: describeError(roles.error) })}
        </p>
      )}

      {roles.data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {KINDS.map((kind, index) => (
            <ColumnWithArrow
              key={kind}
              kind={kind}
              index={index}
              roles={roles.data}
              combination={combination}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ColumnWithArrow(props: {
  kind: RoleKind;
  index: number;
  roles: RoleStatus[];
  combination: Combination;
}) {
  return (
    <>
      {props.index > 0 && (
        <div className="hidden items-center text-fg-muted lg:flex">
          <ArrowRightIcon className="size-6" />
        </div>
      )}
      <RoleColumn {...props} />
    </>
  );
}

function RoleColumn({
  kind,
  index,
  roles,
  combination,
}: {
  kind: RoleKind;
  index: number;
  roles: RoleStatus[];
  combination: Combination;
}) {
  const { t } = useTranslation();
  const selectedId = usePlaygroundStore((state) => state.selection[kind]);
  const inColumn = roles.filter((role) => role.descriptor.kind === kind);
  const headingId = `column-${kind}`;

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2" data-testid={`column-${kind}`}>
      <div>
        <h3 id={headingId} className="font-semibold">
          {index + 1}. {t(`role.kind.${kind}`)}
        </h3>
        <p className="text-sm text-fg-muted">{t(`selector.column.${kind}`)}</p>
      </div>
      {inColumn.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {t('selector.emptyColumn', { kind: t(`role.kind.${kind}`).toLowerCase() })}
        </p>
      ) : (
        <div role="radiogroup" aria-labelledby={headingId} className="space-y-2">
          {inColumn.map((role) => (
            <RoleCard
              key={role.descriptor.id}
              role={role}
              current={combination}
              selected={role.descriptor.id === selectedId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
