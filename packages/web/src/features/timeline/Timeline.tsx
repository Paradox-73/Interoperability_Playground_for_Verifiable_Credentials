/**
 * Live timeline of one run: one row per protocol step, plain-language label first and the protocol's
 * term second, status as icon + word, duration, and the specification section that defines the step.
 */
import type { InteropReport } from '@inji-playground/protocol';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckIcon, CrossIcon, PersonIcon, SkipIcon, SpinnerIcon, WarningIcon } from '../../app/icons';
import { formatDuration, type RowStatus, type RunView, type TimelineRow } from '../../state/run-view';
import { useRoleIndex } from '../selector/use-combination';
import { useLiveRun } from './use-live-run';

const STATUS_STYLE: Record<RowStatus, { className: string; Icon: typeof CheckIcon }> = {
  running: { className: 'text-info', Icon: SpinnerIcon },
  waiting: { className: 'text-warn', Icon: PersonIcon },
  ok: { className: 'text-ok', Icon: CheckIcon },
  failed: { className: 'text-fail', Icon: CrossIcon },
  skipped: { className: 'text-fg-muted', Icon: SkipIcon },
};

interface TimelineProps {
  runId: string | undefined;
  /** Show a link to the run's own page (on the playground page, not on the run page itself). */
  linkToRun?: boolean;
}

export function Timeline({ runId, linkToRun = false }: TimelineProps) {
  const { t } = useTranslation();
  const view = useLiveRun(runId);

  return (
    <section aria-labelledby="timeline-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          {t('timeline.heading')}
        </h2>
        {view && linkToRun && (
          <Link to={`/runs/${encodeURIComponent(view.runId)}`} className="text-sm text-accent underline">
            {t('timeline.openRun')}
          </Link>
        )}
      </div>

      {!view ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm text-fg-muted">
          {t('timeline.empty')}
        </p>
      ) : (
        <RunTimeline view={view} />
      )}
    </section>
  );
}

function RunTimeline({ view }: { view: RunView }) {
  const { t } = useTranslation();
  const roles = useRoleIndex();
  // Role names when the server lists the role, else the id from the run configuration.
  const nameOf = (id: string) => roles.get(id)?.descriptor.name ?? id;
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono">{t('timeline.run', { runId: view.runId })}</span>
        {view.config && (
          <>
            <span>
              {nameOf(view.config.issuer)} → {nameOf(view.config.wallet)} → {nameOf(view.config.verifier)}
            </span>
            <span className="rounded border border-line bg-surface-muted px-1.5 py-px text-xs">
              {t(`format.${view.config.format}`)}
            </span>
          </>
        )}
        <span className="text-fg-muted">{t('timeline.exchanges', { count: view.exchangeCount })}</span>
      </p>

      {view.rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('timeline.waitingForEvents', { runId: view.runId })}</p>
      ) : (
        <ol aria-label={t('timeline.steps', { runId: view.runId })} className="divide-y divide-line">
          {view.rows.map((row) => (
            <TimelineRowItem key={row.key} row={row} />
          ))}
        </ol>
      )}

      {view.report && <RunResult report={view.report} />}
    </div>
  );
}

function TimelineRowItem({ row }: { row: TimelineRow }) {
  const { t } = useTranslation();
  const { className, Icon } = STATUS_STYLE[row.status];
  return (
    <li
      className="grid grid-cols-[8.5rem_1fr_auto] gap-x-3 py-2 text-sm"
      data-step={row.step}
      data-status={row.status}
    >
      <span className={`inline-flex items-start gap-1.5 font-medium ${className}`}>
        <Icon className="mt-0.5 size-4" />
        {t(`timeline.status.${row.status}`)}
      </span>
      <span className="min-w-0">
        <span className="block">
          {row.label} <span className="text-fg-muted">({row.protocolTerm})</span>
        </span>
        {row.error && (
          <span className="mt-0.5 block text-fail">
            <span className="font-mono">{row.error.code}</span>: {row.error.message}
          </span>
        )}
        {row.personAction && <span className="mt-0.5 block text-warn">{row.personAction.title}</span>}
        {row.spec && (
          <a
            href={row.spec.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-block text-xs text-accent underline"
          >
            {t('timeline.spec', { section: row.spec.section })}
            <span className="sr-only">{t('timeline.specContext', { name: row.spec.name })}</span>
          </a>
        )}
      </span>
      <span className="text-right font-mono text-xs text-fg-muted tabular-nums">
        {row.durationMs !== undefined ? formatDuration(row.durationMs) : ''}
      </span>
    </li>
  );
}

function RunResult({ report }: { report: InteropReport }) {
  const { t } = useTranslation();
  const passed = report.verdict === 'pass';
  const Icon = passed ? CheckIcon : report.verdict === 'not-supported' ? WarningIcon : CrossIcon;
  return (
    <div
      className={`rounded-md border p-3 text-sm ${passed ? 'border-ok text-ok' : 'border-fail text-fail'}`}
      data-testid="run-result"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon />
        {t('timeline.result', {
          verdict: t(`verdict.${report.verdict}`),
          outcome: t(`outcome.${report.outcome}`),
          expected: t(`outcome.${report.scenario.expected}`),
        })}
      </p>
      {report.error && (
        <p className="mt-1 text-fg">
          {t('timeline.resultError', { step: report.error.step, message: report.error.message })}
        </p>
      )}
    </div>
  );
}
