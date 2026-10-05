/**
 * The official Inji Verify component (`OpenID4VPVerification` of `@injistack/react-inji-verify-sdk` 0.18.1)
 * as the verifier of a run, for the `inji-verify-sdk` role.
 *
 * - The SDK talks to verify-service through the playground at `/v1/verify` on this page's origin:
 *   verify-service sends no CORS headers, and its `transaction_id` cookie is scoped to that path. The
 *   playground's reverse proxy records every call in the run.
 * - Its callbacks go to `POST /api/runs/{id}/verifier-callback`; the server-side role then rebuilds the
 *   request for the wallet from the recorded session and fetches the result itself.
 * - The SDK and its dependencies (about 2 MB) load only when the panel is shown (`lazy`).
 * - Same-device flow is off: its default (`true`) expects a web wallet URL and fails on a desktop browser.
 */
import type { CredentialFormat, VerifierCallback } from '@inji-playground/protocol';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl, describeError, postJson } from '../../api/http';
import { announce } from '../../state/announcer';
import { presentationDefinitionFor, SDK_CLIENT_ID } from './definition';

const OpenID4VPVerification = lazy(() =>
  import('@injistack/react-inji-verify-sdk').then((module) => ({ default: module.OpenID4VPVerification })),
);

interface InjiVerifySdkPanelProps {
  runId: string;
  format: CredentialFormat;
}

export function InjiVerifySdkPanel({ runId, format }: InjiVerifySdkPanelProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'waiting' | 'received' | 'error'>('waiting');
  const [problem, setProblem] = useState<string | undefined>();

  const send = (callback: VerifierCallback) =>
    postJson(`/api/runs/${encodeURIComponent(runId)}/verifier-callback`, callback, (json) => json).catch(
      (error: unknown) => setProblem(describeError(error)),
    );

  return (
    <section
      aria-labelledby="sdk-panel-heading"
      className="rounded-lg border border-line bg-surface p-4"
      data-testid="inji-verify-sdk-panel"
    >
      <h2 id="sdk-panel-heading" className="text-lg font-semibold">
        {t('injiVerifySdk.heading')}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t('injiVerifySdk.intro')}</p>
      <div className="mt-3 flex justify-center rounded-md bg-white p-3">
        <Suspense fallback={<p className="text-sm text-neutral-700">{t('injiVerifySdk.loading')}</p>}>
          <OpenID4VPVerification
            verifyServiceUrl={apiUrl('/v1/verify')}
            clientId={SDK_CLIENT_ID}
            // The SDK types allow only ldp_vc input descriptors; verify-service accepts vc+sd-jwt too.
            presentationDefinition={presentationDefinitionFor(format) as never}
            isSameDeviceFlowEnabled={false}
            onVPReceived={(transactionId) => {
              setState('received');
              announce(t('injiVerifySdk.received'));
              void send({ kind: 'vp-received', transactionId });
            }}
            onQrCodeExpired={() => {
              setState('error');
              void send({ kind: 'error', errorCode: 'qr-expired', errorMessage: 'the QR code expired' });
            }}
            onError={(error) => {
              setState('error');
              void send({
                kind: 'error',
                ...(error.errorCode ? { errorCode: error.errorCode } : {}),
                errorMessage: error.errorMessage,
                ...(error.transactionId ? { transactionId: error.transactionId } : {}),
              });
            }}
          />
        </Suspense>
      </div>
      <p aria-live="polite" className="mt-2 text-sm" data-testid="inji-verify-sdk-status">
        {t(`injiVerifySdk.status.${state}`)}
      </p>
      {problem && (
        <p role="alert" className="text-sm text-fail">
          {t('injiVerifySdk.callbackFailed', { reason: problem })}
        </p>
      )}
    </section>
  );
}
