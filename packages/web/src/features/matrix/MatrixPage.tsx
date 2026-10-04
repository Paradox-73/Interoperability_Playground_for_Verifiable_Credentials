/**
 * Compatibility matrix (`/matrix`): rows are issuer -> wallet -> verifier combinations, columns are
 * credential format x OpenID4VP profile. Each cell shows the verdict of its newest finished run as an
 * icon plus a word plus a colour, links to that run's report, and can run again ("Run cell"); each row
 * can run all its runnable cells at once ("Run row"). Red cells link to the gap register.
 *
 * Cells come from `GET /api/matrix`: stored runs, plus every other combination of registered roles from
 * the compatibility check (untested, or not supported with the reason).
 */
import type { MatrixCell, MatrixRole, RunConfigInput } from '@inji-playground/protocol';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { apiUrl, describeError } from '../../api/http';
import { useDocumentTitle } from '../../app/use-document-title';
import { announce } from '../../state/announcer';
import { formatUtc } from '../history/format';
import { useRefreshOnRunFinished } from '../history/live-refresh';
import { STATUS_STYLE, StatusBadge } from '../report/badges';
import { useStartRun } from '../tamper/api';
import { MatrixFilters } from './MatrixFilters';
import {
  matrixFilterFromParams,
  matrixFilterToParams,
  matrixKey,
  matrixMarkdownPath,
  useMatrix,
  type MatrixFilter,
} from './api';
import {
  isRed,
  isRunnable,
  layoutMatrix,
  runConfigOfCell,
  type MatrixColumn,
  type MatrixRow,
} from './layout';

interface StartedRun {
  runId: string;
  label: string;
}

export function MatrixPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pages.matrix.title'));
  const [params, setParams] = useSearchParams();
  const filter = matrixFilterFromParams(params);
  const matrix = useMatrix(filter);
  useRefreshOnRunFinished([matrixKey]);
  const startRun = useStartRun();
  const [started, setStarted] = useState<StartedRun[]>([]);
  const [startError, setStartError] = useState<string | undefined>();

  const onFilter = (next: MatrixFilter) => setParams(matrixFilterToParams(next), { replace: true });

  /** Starts runs one after the other, so the server queues live runs in the order of the row. */
  const run = async (items: ReadonlyArray<{ config: RunConfigInput; label: string }>) => {
    setStartError(undefined);
    for (const item of items) {
      try {
        const { runId } = await startRun.mutateAsync(item.config);
        setStarted((list) => [{ runId, label: item.label }, ...list].slice(0, 10));
        announce(t('matrix.started', { runId, label: item.label }));
      } catch (error) {
        setStartError(t('runBar.failed', { reason: describeError(error) }));
        return;
      }
    }
  };

  const layout = matrix.data ? layoutMatrix(matrix.data, filter.scenario) : undefined;
  const nameOf = (id: string) => layout?.roles.get(id)?.name ?? id;
  const rowLabel = (row: MatrixRow) =>
    `${nameOf(row.issuer)} → ${nameOf(row.wallet)} → ${nameOf(row.verifier)}`;
  const columnLabel = (column: MatrixColumn) =>
    `${t(`format.${column.format}`)}, ${t(`vpProfile.${column.vpProfile}`)}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('pages.matrix.title')}</h1>
        <p className="text-sm text-fg-muted">{t('matrix.intro')}</p>
      </div>

      <MatrixFilters filter={filter} onChange={onFilter} roles={matrix.data?.roles ?? []} />

      {matrix.isPending && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}
      {matrix.isError && (
        <p role="alert" className="text-sm text-fail">
          {t('matrix.error', { reason: describeError(matrix.error) })}
        </p>
      )}

      <div aria-live="polite" className="space-y-1 text-sm print:hidden">
        {startError && <p className="text-fail">{startError}</p>}
        {started.length > 0 && (
          <ul className="space-y-1">
            {started.map((item) => (
              <li key={item.runId}>
                {t('matrix.startedPrefix')}{' '}
                <Link
                  to={`/runs/${encodeURIComponent(item.runId)}`}
                  className="font-mono text-accent underline"
                >
                  {item.runId}
                </Link>{' '}
                · {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {matrix.data && layout && (
        <>
          <Totals totals={matrix.data.totals} generatedAt={matrix.data.generatedAt} />
          {layout.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
              {t('pages.matrix.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full border-separate border-spacing-1 text-left text-sm">
                <caption className="p-3 text-left font-semibold">
                  {t('matrix.caption', { scenario: filter.scenario })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-2">
                      {t('matrix.rowHeader')}
                    </th>
                    {layout.columns.map((column) => (
                      <th key={column.id} scope="col" className="min-w-44 px-2 py-2 align-bottom">
                        {t(`format.${column.format}`)}
                        <span className="block text-xs font-normal text-fg-muted">
                          {t(`vpProfile.${column.vpProfile}`)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {layout.rows.map((row) => {
                    const runnable = layout.columns
                      .map((column) => row.cells[column.id])
                      .filter((cell): cell is MatrixCell => cell !== undefined && isRunnable(cell));
                    return (
                      <tr key={row.id} data-row-id={row.id}>
                        <th scope="row" className="px-2 py-2 align-top font-normal">
                          <RoleChain roles={layout.roles} row={row} />
                          <button
                            type="button"
                            className="mt-2 rounded-md border border-line-strong px-2 py-1 text-xs hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-fg-muted print:hidden"
                            disabled={runnable.length === 0 || startRun.isPending}
                            onClick={() =>
                              void run(
                                runnable.map((cell) => ({
                                  config: runConfigOfCell(cell),
                                  label: `${rowLabel(row)}, ${t(`format.${cell.key.format}`)}`,
                                })),
                              )
                            }
                          >
                            {t('matrix.runRow', { count: runnable.length })}
                            <span className="sr-only">: {rowLabel(row)}</span>
                          </button>
                        </th>
                        {layout.columns.map((column) => {
                          const cell = row.cells[column.id];
                          const label = `${rowLabel(row)}, ${columnLabel(column)}`;
                          return cell ? (
                            <CellView
                              key={column.id}
                              cell={cell}
                              label={label}
                              disabled={startRun.isPending}
                              onRun={() => void run([{ config: runConfigOfCell(cell), label }])}
                            />
                          ) : (
                            <td key={column.id} className="px-2 py-2 text-fg-muted">
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">{t('matrix.noCell')}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm print:hidden">
            <a href={apiUrl(matrixMarkdownPath(filter))} className="text-accent underline" download>
              {t('matrix.downloadMarkdown')}
            </a>
          </p>
        </>
      )}
    </div>
  );
}

function RoleChain({ roles, row }: { roles: Map<string, MatrixRole>; row: MatrixRow }) {
  const { t } = useTranslation();
  const part = (id: string) => {
    const role = roles.get(id);
    return (
      <span className="block">
        {role?.name ?? id}{' '}
        <span className="text-xs text-fg-muted">
          {role ? `${t(`role.ecosystem.${role.ecosystem}`)} · ${role.version}` : ''}
        </span>
      </span>
    );
  };
  return (
    <>
      {part(row.issuer)}
      <span className="block text-xs text-fg-muted" aria-hidden="true">
        ↓
      </span>
      {part(row.wallet)}
      <span className="block text-xs text-fg-muted" aria-hidden="true">
        ↓
      </span>
      {part(row.verifier)}
    </>
  );
}

interface CellViewProps {
  cell: MatrixCell;
  /** Row and column in words, for screen readers and the run announcement. */
  label: string;
  disabled: boolean;
  onRun: () => void;
}

function CellView({ cell, label, disabled, onRun }: CellViewProps) {
  const { t } = useTranslation();
  const { frame } = STATUS_STYLE[cell.status];
  const { latestRun, counts } = cell;
  const blocking = cell.reasons.filter((r) => r.severity === 'blocking');
  const describedBy = useId();
  return (
    <td
      className={`rounded-md border-2 px-2 py-2 align-top ${frame}`}
      data-cell-id={cell.id}
      data-status={cell.status}
    >
      {latestRun ? (
        <Link
          to={`/runs/${encodeURIComponent(latestRun.runId)}/report`}
          className="underline decoration-1 underline-offset-2"
          aria-describedby={describedBy}
        >
          <StatusBadge status={cell.status} />
          <span className="sr-only">{t('matrix.openRun', { label })}</span>
        </Link>
      ) : (
        <StatusBadge status={cell.status} />
      )}
      <div id={describedBy} className="mt-1 space-y-0.5 text-xs">
        {latestRun?.outcome && (
          <p>
            {t('matrix.outcome', {
              outcome: t(`outcome.${latestRun.outcome}`),
              date: formatUtc(latestRun.createdAt),
            })}
          </p>
        )}
        {counts.runs > 0 && (
          <p className="text-fg-muted">
            {t('matrix.counts', { count: counts.runs, pass: counts.pass, fail: counts.fail + counts.error })}
          </p>
        )}
        {latestRun?.error && (
          <p className="text-fail">
            <span className="font-mono">{latestRun.error.code}</span>: {latestRun.error.message}
          </p>
        )}
        {cell.status === 'not-supported' &&
          blocking.map((reason) => (
            <p key={reason.code} className="text-fg-muted">
              {reason.message}
            </p>
          ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs print:hidden">
        {(isRed(cell) || cell.gapIds.length > 0) && (
          <Link to={`/gaps?cell=${encodeURIComponent(cell.id)}`} className="text-accent underline">
            {cell.gapIds.length > 0
              ? t('matrix.gaps', { ids: cell.gapIds.join(', ') })
              : t('matrix.checkGaps')}{' '}
            <span className="sr-only">{t('matrix.forCell', { label })}</span>
          </Link>
        )}
        {isRunnable(cell) && (
          <button
            type="button"
            onClick={onRun}
            disabled={disabled}
            className="text-accent underline disabled:text-fg-muted"
          >
            {t('matrix.runCell')} <span className="sr-only">{t('matrix.forCell', { label })}</span>
          </button>
        )}
      </div>
    </td>
  );
}

function Totals({
  totals,
  generatedAt,
}: {
  totals: {
    cells: number;
    pass: number;
    fail: number;
    error: number;
    notSupported: number;
    untested: number;
  };
  generatedAt: string;
}) {
  const { t } = useTranslation();
  const items = [
    { status: 'pass', count: totals.pass },
    { status: 'fail', count: totals.fail },
    { status: 'error', count: totals.error },
    { status: 'not-supported', count: totals.notSupported },
    { status: 'untested', count: totals.untested },
  ] as const;
  return (
    <section aria-labelledby="matrix-totals" className="space-y-2">
      <h2 id="matrix-totals" className="sr-only">
        {t('matrix.totals')}
      </h2>
      <ul className="flex flex-wrap gap-2 text-sm">
        <li className="rounded-md border border-line bg-surface px-3 py-1.5">
          {t('matrix.cells', { count: totals.cells })}
        </li>
        {items.map((item) => (
          <li key={item.status} className="rounded-md border border-line bg-surface px-3 py-1.5">
            <StatusBadge status={item.status} /> <span className="tabular-nums">{item.count}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t('matrix.generated', { date: formatUtc(generatedAt) })}</p>
    </section>
  );
}
