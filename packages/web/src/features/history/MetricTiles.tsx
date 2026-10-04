/**
 * Metric tiles above the history table (runs, success rate, verdict counts) and the per-step timing
 * table (success rate, p50 and p95 duration), all from `GET /api/metrics` with the page's filters.
 */
import type { Metrics } from '@inji-playground/protocol';
import { useTranslation } from 'react-i18next';
import { formatMs, formatRate, formatUtc } from './format';

export function MetricTiles({ metrics }: { metrics: Metrics }) {
  const { t } = useTranslation();
  const tiles = [
    { key: 'runs', value: String(metrics.window.runs), hint: t('history.tiles.runsHint') },
    {
      key: 'successRate',
      value: formatRate(metrics.successRate),
      hint: t('history.tiles.successRateHint'),
    },
    { key: 'pass', value: String(metrics.verdicts.pass), hint: '' },
    { key: 'fail', value: String(metrics.verdicts.fail), hint: '' },
    { key: 'error', value: String(metrics.verdicts.error), hint: '' },
    { key: 'notSupported', value: String(metrics.verdicts.notSupported), hint: '' },
  ] as const;

  return (
    <section aria-labelledby="metrics-heading" className="space-y-3">
      <h2 id="metrics-heading" className="text-lg font-semibold">
        {t('history.metricsHeading')}
      </h2>
      {metrics.window.firstRunAt && (
        <p className="text-sm text-fg-muted">
          {t('history.window', {
            from: formatUtc(metrics.window.firstRunAt),
            to: formatUtc(metrics.window.lastRunAt),
          })}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <li
            key={tile.key}
            className="rounded-lg border border-line bg-surface p-3"
            data-testid={`tile-${tile.key}`}
          >
            <p className="text-sm text-fg-muted">{t(`history.tiles.${tile.key}`)}</p>
            <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
            {tile.hint && <p className="text-xs text-fg-muted">{tile.hint}</p>}
          </li>
        ))}
      </ul>

      {metrics.steps.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="p-3 text-left font-semibold">{t('history.steps.caption')}</caption>
            <thead className="border-y border-line bg-surface-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t('history.steps.step')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('history.steps.executed')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('history.steps.successRate')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('history.steps.p50')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('history.steps.p95')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {metrics.steps.map((step) => (
                <tr key={step.step}>
                  <th scope="row" className="px-3 py-2 font-normal">
                    {step.label} <span className="font-mono text-xs text-fg-muted">{step.step}</span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{step.executed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRate(step.successRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMs(step.duration.p50Ms)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMs(step.duration.p95Ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
