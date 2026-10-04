/**
 * Runs page. The stored history with filters is the history dashboard's job; until it exists, this page
 * lists the runs started from this tab so each one can be reopened.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { usePlaygroundStore } from '../state/playground';
import { useDocumentTitle } from '../app/use-document-title';

export function RunsPage() {
  const { t } = useTranslation();
  const startedRuns = usePlaygroundStore((state) => state.startedRuns);
  useDocumentTitle(t('pages.runs.title'));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('pages.runs.title')}</h1>
      <p className="text-sm text-fg-muted">{t('pages.runs.empty')}</p>
      {startedRuns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
          {t('pages.runs.none')}
        </p>
      ) : (
        <ul className="space-y-1">
          {startedRuns.map((runId) => (
            <li key={runId}>
              <Link
                to={`/runs/${encodeURIComponent(runId)}`}
                className="font-mono text-sm text-accent underline"
              >
                {t('timeline.run', { runId })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
