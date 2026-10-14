/**
 * Shows the Inji Verify SDK panel while a run whose verifier is `inji-verify-sdk` is going on, from the
 * step where the verifier creates its request. The component posts /vp-session-request as soon as it
 * mounts, and the server records that request in the run only once the step has started (it claims
 * /v1/verify then); mounted earlier, during issuance, the request was lost and the run waited for ever.
 */
import { useMemo } from 'react';
import { useRunEvents } from '../../state/run-events';
import { buildRunView } from '../../state/run-view';
import { InjiVerifySdkPanel } from './InjiVerifySdkPanel';

/** Role id of the verifier that runs in the browser (the server-side half lives in adapters/inji). */
export const SDK_VERIFIER_ID = 'inji-verify-sdk';

export function SdkPanelForRun({ runId }: { runId: string | undefined }) {
  const events = useRunEvents(runId);
  const view = useMemo(() => (runId ? buildRunView(runId, events) : undefined), [runId, events]);
  if (!runId || !view?.config || view.finished || view.config.verifier !== SDK_VERIFIER_ID) return null;
  if (!view.rows.some((row) => row.step === 'verifier.request')) return null;
  return <InjiVerifySdkPanel key={runId} runId={runId} format={view.config.format} />;
}
