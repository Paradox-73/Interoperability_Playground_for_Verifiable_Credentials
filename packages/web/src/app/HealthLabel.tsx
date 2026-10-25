// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import type { Health, HealthStatus } from '@inji-playground/protocol';
import { useTranslation } from 'react-i18next';
import { CheckIcon, ClockIcon, CrossIcon, WarningIcon } from './icons';

/** Text colour and icon per health status; the status word is always shown as well. */
const STYLE: Record<HealthStatus, { className: string; Icon: typeof CheckIcon }> = {
  up: { className: 'text-ok', Icon: CheckIcon },
  degraded: { className: 'text-warn', Icon: WarningIcon },
  down: { className: 'text-fail', Icon: CrossIcon },
  unknown: { className: 'text-fg-muted', Icon: ClockIcon },
};

/** Icon + status word (+ latency), for role cards and the stack strip. */
export function HealthLabel({ health, showDetail = false }: { health: Health; showDetail?: boolean }) {
  const { t } = useTranslation();
  const { className, Icon } = STYLE[health.status];
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon />
      <span>
        {t(`health.${health.status}`)}
        {health.latencyMs !== undefined && (
          <span className="text-fg-muted">
            {' '}
            · {t('health.latency', { ms: Math.round(health.latencyMs) })}
          </span>
        )}
        {showDetail && health.detail && health.status !== 'up' && (
          <span className="text-fg-muted"> · {health.detail}</span>
        )}
      </span>
    </span>
  );
}
