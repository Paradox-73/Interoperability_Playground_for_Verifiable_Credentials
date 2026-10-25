// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * History dashboard (`/runs`): metric tiles, per-step timings and a filterable, paged table of every
 * stored run, newest first. Filters live in the page address; each row links to the run's report and
 * to its timeline and inspector.
 */
import type { RunSummary } from '@inji-playground/protocol';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { describeError } from '../../api/http';
import { useDocumentTitle } from '../../app/use-document-title';
import { OutcomeBadge, StatusBadge } from '../report/badges';
import { historyKeys, useMetrics, useRunList } from './api';
import { filterFromParams, filterToParams, hasFilter, PAGE_SIZE, type HistoryFilterKey } from './filters';
import { formatUtc } from './format';
import { HistoryFilters } from './HistoryFilters';
import { useRefreshOnRunFinished } from './live-refresh';
import { MetricTiles } from './MetricTiles';

export function HistoryPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('history.title'));
  const [params, setParams] = useSearchParams();
  const { filter, page } = filterFromParams(params);
  const runs = useRunList(filter, page);
  const metrics = useMetrics(filter);
  useRefreshOnRunFinished([historyKeys.runs, historyKeys.metrics]);

  const onChange = (key: HistoryFilterKey, value: string | undefined) => {
    // A new filter starts again at page 1.
    setParams(filterToParams({ ...filter, [key]: value }), { replace: true });
  };
  const goToPage = (next: number) => setParams(filterToParams(filter, next));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('history.title')}</h1>
        <p className="text-sm text-fg-muted">{t('history.intro')}</p>
      </div>

      <HistoryFilters
        filter={filter}
        onChange={onChange}
        onClear={() => setParams(new URLSearchParams(), { replace: true })}
      />

      {metrics.data && <MetricTiles metrics={metrics.data} />}
      {metrics.isError && (
        <p className="text-sm text-warn">
          {t('history.metricsError', { reason: describeError(metrics.error) })}
        </p>
      )}

      <section aria-labelledby="runs-heading" className="space-y-3">
        <h2 id="runs-heading" className="text-lg font-semibold">
          {t('history.runsHeading')}
        </h2>
        {runs.isPending && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}
        {runs.isError && (
          <p role="alert" className="text-sm text-fail">
            {t('history.error', { reason: describeError(runs.error) })}
          </p>
        )}
        {runs.data &&
          (runs.data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
              {hasFilter(filter) ? t('history.noMatch') : t('history.empty')}
            </p>
          ) : (
            <>
              <RunTable runs={runs.data.items} />
              <Pager page={page} total={runs.data.total} shown={runs.data.items.length} onPage={goToPage} />
            </>
          ))}
      </section>
    </div>
  );
}

function RunTable({ runs }: { runs: readonly RunSummary[] }) {
  const { t } = useTranslation();
  const th = 'px-3 py-2 font-semibold';
  return (
    <div
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard users scroll the table
      tabIndex={0}
      aria-label={t('history.tableCaption')}
      className="relative overflow-x-auto rounded-lg border border-line bg-surface"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('history.tableCaption')}</caption>
        <thead className="border-b border-line bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              {t('history.columns.created')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.roles')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.format')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.scenario')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.outcome')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.verdict')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.versions')}
            </th>
            <th scope="col" className={th}>
              {t('history.columns.links')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {runs.map((run) => (
            <RunRow key={run.runId} run={run} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const { t } = useTranslation();
  const id = encodeURIComponent(run.runId);
  const { config, versions } = run;
  return (
    <tr data-run-id={run.runId}>
      <td className="px-3 py-2 whitespace-nowrap">
        {formatUtc(run.createdAt)}
        <span className="block font-mono text-xs text-fg-muted">{run.runId}</span>
      </td>
      <td className="px-3 py-2">
        {config.issuer} → {config.wallet} → {config.verifier}
        <span className="block text-xs text-fg-muted">{t(`mode.${run.mode}`)}</span>
      </td>
      <td className="px-3 py-2">{t(`format.${config.format}`)}</td>
      <td className="px-3 py-2 font-mono text-xs">{config.scenario}</td>
      <td className="px-3 py-2">
        {run.outcome ? <OutcomeBadge outcome={run.outcome} /> : t(`history.status.${run.status}`)}
      </td>
      <td className="px-3 py-2">
        {run.verdict ? <StatusBadge status={run.verdict} /> : '—'}
        {run.error && (
          <span className="block text-xs text-fail">
            <span className="font-mono">{run.error.code}</span>: {run.error.message}
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
        {versions.issuer} / {versions.wallet} / {versions.verifier}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {run.status === 'finished' && (
          <Link to={`/runs/${id}/report`} className="mr-3 text-accent underline">
            {t('history.report')} <span className="sr-only">{t('history.ofRun', { runId: run.runId })}</span>
          </Link>
        )}
        <Link to={`/runs/${id}`} className="text-accent underline">
          {t('history.inspect')} <span className="sr-only">{t('history.ofRun', { runId: run.runId })}</span>
        </Link>
      </td>
    </tr>
  );
}

interface PagerProps {
  page: number;
  total: number;
  shown: number;
  onPage: (page: number) => void;
}

function Pager({ page, total, shown, onPage }: PagerProps) {
  const { t } = useTranslation();
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = first + shown - 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const button =
    'rounded-md border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-fg-muted';
  return (
    <nav aria-label={t('history.pager.label')} className="flex flex-wrap items-center gap-3 print:hidden">
      <p className="text-sm" aria-live="polite">
        {t('history.pager.showing', { first, last, total })}
      </p>
      <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('history.pager.previous')}
      </button>
      <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('history.pager.next')}
      </button>
    </nav>
  );
}
