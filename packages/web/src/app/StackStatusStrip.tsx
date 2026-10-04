/**
 * One chip per service: the playground server, each Inji container from `GET /api/stack/status`, and
 * the live-update WebSocket. Each chip is name + status word + icon, never colour alone.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/http';
import { useServerHealth, useStackStatus } from '../api/queries';
import { useSocketStatus } from '../api/socket-context';
import { HealthLabel } from './HealthLabel';
import { CheckIcon, ClockIcon, CrossIcon, SpinnerIcon } from './icons';

function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5">
      {children}
    </li>
  );
}

function ServerChip() {
  const { t } = useTranslation();
  const health = useServerHealth();
  if (health.isPending) {
    return (
      <Chip>
        <ClockIcon className="size-4 text-fg-muted" />
        {t('stack.serverChecking')}
      </Chip>
    );
  }
  if (health.isError) {
    return (
      <Chip>
        <CrossIcon className="size-4 text-fail" />
        <span className="text-fail">{t('stack.serverDown', { reason: describeError(health.error) })}</span>
      </Chip>
    );
  }
  return (
    <Chip>
      <CheckIcon className="size-4 text-ok" />
      {t('stack.serverUp', { version: health.data.version })}
    </Chip>
  );
}

function StackChips() {
  const { t } = useTranslation();
  const stack = useStackStatus();
  if (stack.isPending) return <Chip>{t('stack.checking')}</Chip>;
  if (stack.isError) return <Chip>{t('stack.unavailable', { reason: describeError(stack.error) })}</Chip>;
  if (stack.data.mode === 'off') return <Chip>{t('stack.off')}</Chip>;
  if (stack.data.services.length === 0) return <Chip>{t('stack.empty')}</Chip>;
  return (
    <>
      {stack.data.services.map((service) => (
        <Chip key={service.name}>
          <span className="font-medium">{service.name}</span>
          <HealthLabel health={service.health} showDetail />
        </Chip>
      ))}
    </>
  );
}

function SocketChip() {
  const { t } = useTranslation();
  const status = useSocketStatus();
  const icon = {
    idle: <ClockIcon className="size-4 text-fg-muted" />,
    connecting: <SpinnerIcon className="size-4 text-info" />,
    open: <CheckIcon className="size-4 text-ok" />,
    closed: <SpinnerIcon className="size-4 text-warn" />,
  }[status];
  return (
    <Chip>
      {icon}
      {t(`stack.socket.${status}`)}
    </Chip>
  );
}

export function StackStatusStrip() {
  const { t } = useTranslation();
  return (
    <section aria-label={t('stack.label')} className="border-t border-line bg-surface-muted">
      <ul className="mx-auto flex max-w-screen-2xl flex-wrap gap-2 px-4 py-2 text-xs sm:px-6">
        <ServerChip />
        <StackChips />
        <SocketChip />
      </ul>
    </section>
  );
}
