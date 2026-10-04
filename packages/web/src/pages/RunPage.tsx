/**
 * One run on its own page (`/runs/:id`). Subscribing to the run makes the server send its stored
 * events first, so the same timeline works for a running and for a finished run.
 */
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Timeline } from '../features/timeline/Timeline';
import { useDocumentTitle } from '../app/use-document-title';

export function RunPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  useDocumentTitle(t('pages.run.title', { runId: id ?? '' }));
  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-accent underline">
        {t('pages.run.back')}
      </Link>
      <h1 className="text-xl font-semibold">{t('pages.run.title', { runId: id ?? '' })}</h1>
      <Timeline runId={id} />
    </div>
  );
}
