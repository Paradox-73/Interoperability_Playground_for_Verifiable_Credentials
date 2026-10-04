/**
 * The page a judge sees first: choose the three roles, set the run, press Run, follow the timeline.
 * The inspector and the sequence diagram join the timeline in the lower area in a later step.
 */
import { useTranslation } from 'react-i18next';
import { RunBar } from '../features/run-bar/RunBar';
import { RoleSelector } from '../features/selector/RoleSelector';
import { Timeline } from '../features/timeline/Timeline';
import { usePlaygroundStore } from '../state/playground';
import { useDocumentTitle } from '../app/use-document-title';

export function PlaygroundPage() {
  const { t } = useTranslation();
  const activeRunId = usePlaygroundStore((state) => state.activeRunId);
  useDocumentTitle(t('app.nav.playground'));
  return (
    <div className="space-y-6">
      <h1 className="sr-only">{t('app.nav.playground')}</h1>
      <RoleSelector />
      <RunBar />
      <Timeline runId={activeRunId} linkToRun />
    </div>
  );
}
