/**
 * One run on its own page (`/runs/:id`). Subscribing to the run makes the server send its stored
 * events first, so the same timeline works for a running and for a finished run.
 */
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Timeline } from '../features/timeline/Timeline';
import { SdkPanelForRun } from '../features/inji-verify-sdk/SdkPanelForRun';
import { ManualWalletModal } from '../features/manual-wallet/ManualWalletModal';
import { useDocumentTitle } from '../app/use-document-title';
import { LazyRunExplorer } from '../inspector/LazyRunExplorer';
import { useRunEvents } from '../state/run-events';

export function RunPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const events = useRunEvents(id);
  useDocumentTitle(t('pages.run.title', { runId: id ?? '' }));
  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-accent underline">
        {t('pages.run.back')}
      </Link>
      <h1 className="text-xl font-semibold">{t('pages.run.title', { runId: id ?? '' })}</h1>
      {id && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link to={`/runs/${encodeURIComponent(id)}/report`} className="text-accent underline">
            {t('pages.run.report')}
          </Link>
          <Link to={`/runs/${encodeURIComponent(id)}/playback`} className="text-accent underline">
            {t('pages.run.playback')}
          </Link>
        </p>
      )}
      <SdkPanelForRun runId={id} />
      <Timeline runId={id} />
      {id && <LazyRunExplorer key={id} runId={id} events={events} />}
      <ManualWalletModal runId={id} />
    </div>
  );
}
