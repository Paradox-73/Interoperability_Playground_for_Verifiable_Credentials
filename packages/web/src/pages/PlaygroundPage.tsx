/**
 * The page a judge sees first: choose the three roles, set the run, press Run, follow the timeline.
 * Below the timeline, the sequence diagram and the protocol inspector show the same run's recorded
 * messages.
 */
import { useTranslation } from 'react-i18next';
import { RunBar } from '../features/run-bar/RunBar';
import { SdkPanelForRun } from '../features/inji-verify-sdk/SdkPanelForRun';
import { ManualWalletModal } from '../features/manual-wallet/ManualWalletModal';
import { RoleSelector } from '../features/selector/RoleSelector';
import { Timeline } from '../features/timeline/Timeline';
import { LazyRunExplorer } from '../inspector/LazyRunExplorer';
import { usePlaygroundStore } from '../state/playground';
import { useRunEvents } from '../state/run-events';
import { useDocumentTitle } from '../app/use-document-title';

export function PlaygroundPage() {
  const { t } = useTranslation();
  const activeRunId = usePlaygroundStore((state) => state.activeRunId);
  const events = useRunEvents(activeRunId);
  useDocumentTitle(t('app.nav.playground'));
  return (
    <div className="space-y-6">
      <h1 className="sr-only">{t('app.nav.playground')}</h1>
      <RoleSelector />
      <RunBar />
      <SdkPanelForRun runId={activeRunId} />
      <Timeline runId={activeRunId} linkToRun />
      {activeRunId && <LazyRunExplorer key={activeRunId} runId={activeRunId} events={events} />}
      <ManualWalletModal runId={activeRunId} />
    </div>
  );
}
