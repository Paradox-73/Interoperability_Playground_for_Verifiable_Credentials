/**
 * Status words with an icon, shared by the matrix, the history table, the report page and the tamper
 * controls. The icon and the colour repeat the word; they are never the only signal (WCAG 1.4.1).
 */
import type { MatrixCellStatus, Outcome } from '@inji-playground/protocol';
import type { SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, CrossIcon, WarningIcon } from '../../app/icons';

type IconProps = SVGProps<SVGSVGElement>;

function OutlineIcon({ children, className = 'size-4', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Circle with a bar: the combination was ruled out before it ran. */
export const BlockedIcon = (props: IconProps) => (
  <OutlineIcon {...props}>
    <circle cx="8" cy="8" r="6" />
    <path d="M3.8 12.2l8.4-8.4" />
  </OutlineIcon>
);

/** Empty circle: could run, never has. */
export const UntestedIcon = (props: IconProps) => (
  <OutlineIcon {...props}>
    <circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2" />
  </OutlineIcon>
);

/** Matrix cell statuses; a run verdict is the same set without `untested`. */
export const STATUS_STYLE: Record<MatrixCellStatus, { Icon: typeof CheckIcon; text: string; frame: string }> =
  {
    pass: { Icon: CheckIcon, text: 'text-ok', frame: 'border-ok' },
    fail: { Icon: CrossIcon, text: 'text-fail', frame: 'border-fail' },
    error: { Icon: WarningIcon, text: 'text-warn', frame: 'border-warn' },
    'not-supported': { Icon: BlockedIcon, text: 'text-fg-muted', frame: 'border-line-strong border-dashed' },
    untested: { Icon: UntestedIcon, text: 'text-fg-muted', frame: 'border-line border-dashed' },
  };

/** "✓ Pass", "✗ Fail", ... for a verdict or a matrix cell status. */
export function StatusBadge({ status, className = '' }: { status: MatrixCellStatus; className?: string }) {
  const { t } = useTranslation();
  const { Icon, text } = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${text} ${className}`}
      data-status={status}
    >
      <Icon />
      {t(`matrix.status.${status}`)}
    </span>
  );
}

const OUTCOME_STATUS: Record<Outcome, MatrixCellStatus> = {
  VALID: 'pass',
  INVALID: 'fail',
  EXPIRED: 'error',
  ERROR: 'fail',
  NOT_RUN: 'untested',
};

/** The verifier's answer ("Valid", "Valid but expired", ...), with an icon that follows the answer. */
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  const { Icon, text } = STATUS_STYLE[OUTCOME_STATUS[outcome]];
  return (
    <span className={`inline-flex items-center gap-1 ${text}`} data-outcome={outcome}>
      <Icon />
      {t(`outcome.${outcome}`)}
    </span>
  );
}
