/**
 * The `dc-api` person step (wallet `browser-wallet`, verifier `ref-verifier-dc-api`): this page plays the
 * verifier's web page of OpenID4VP 1.0 Appendix A. It reads the request from the verifier, passes it to
 * `navigator.credentials.get({ digital: { requests: [request] } })`, and posts what the browser returns to the
 * verifier, which checks that the answer is bound to this page's origin.
 *
 * Where the browser has no Digital Credentials API, or no wallet that holds the run's credential, the
 * playground's reference wallet can answer the same request (`providerUrl`); the page still posts the answer,
 * so the request, the transport back through the page and the origin binding are the same.
 */
import type { PersonAction } from '@inji-playground/protocol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, getJson, postJson } from '../../api/http';
import { announce } from '../../state/announcer';

type DcApi = NonNullable<PersonAction['dcApi']>;
interface DcApiMessage {
  protocol: string;
  data: Record<string, unknown>;
}

const asMessage = (json: unknown): DcApiMessage => json as DcApiMessage;

/** True when this browser exposes the Digital Credentials API (Chrome and Edge 141 and later). */
export function browserHasDcApi(win: Window & typeof globalThis = window): boolean {
  return 'DigitalCredential' in win && typeof win.navigator.credentials?.get === 'function';
}

/** Asks the browser; resolves with `{ protocol, data }` of the returned `DigitalCredential`. */
async function askBrowser(request: DcApiMessage): Promise<DcApiMessage> {
  const options = {
    digital: { requests: [request] },
    mediation: 'required',
  } as unknown as CredentialRequestOptions;
  const credential = (await navigator.credentials.get(options)) as unknown as {
    protocol?: string;
    data?: unknown;
  } | null;
  if (!credential) throw new Error('the browser returned no credential');
  const data =
    typeof credential.data === 'string' ? (JSON.parse(credential.data) as unknown) : credential.data;
  return { protocol: credential.protocol ?? request.protocol, data: (data ?? {}) as Record<string, unknown> };
}

export function DcApiPanel({ dcApi }: { dcApi: DcApi }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'asking' | 'posted' | 'error'>('idle');
  const [detail, setDetail] = useState<string | undefined>();
  const [request, setRequest] = useState<DcApiMessage | undefined>();
  const supported = browserHasDcApi();

  const run = async (source: 'browser' | 'playground') => {
    setState('asking');
    setDetail(undefined);
    try {
      const asked = await getJson(dcApi.requestUrl, asMessage);
      setRequest(asked);
      const answer =
        source === 'browser' ? await askBrowser(asked) : await postJson(dcApi.providerUrl, asked, asMessage);
      const result = await postJson(dcApi.responseUrl, answer, (json) => json as { outcome?: string });
      setState('posted');
      setDetail(result.outcome);
      announce(t('dcApi.posted', { outcome: result.outcome ?? '' }));
    } catch (error) {
      setState('error');
      setDetail(describeError(error));
    }
  };

  const button =
    'rounded-md border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-fg-muted';

  return (
    <div className="space-y-3 text-sm" data-testid="dc-api-panel" data-provider-url={dcApi.providerUrl}>
      <p>{t('dcApi.intro')}</p>
      <p className={supported ? 'text-ok' : 'text-fg-muted'} data-testid="dc-api-support">
        {supported ? t('dcApi.supported') : t('dcApi.unsupported')}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted"
          disabled={!supported || state === 'asking' || state === 'posted'}
          onClick={() => void run('browser')}
        >
          {t('dcApi.askBrowser')}
        </button>
        <button
          type="button"
          className={button}
          disabled={state === 'asking' || state === 'posted'}
          onClick={() => void run('playground')}
        >
          {t('dcApi.askPlayground')}
        </button>
      </div>
      <p aria-live="polite" data-testid="dc-api-status">
        {state === 'idle' && t('dcApi.status.idle')}
        {state === 'asking' && t('dcApi.status.asking')}
        {state === 'posted' && t('dcApi.status.posted', { outcome: detail ?? '' })}
        {state === 'error' && (
          <span role="alert" className="text-fail">
            {t('dcApi.status.error', { reason: detail ?? '' })}
          </span>
        )}
      </p>
      {request && (
        <details>
          <summary className="cursor-pointer font-semibold">{t('dcApi.request')}</summary>
          <pre
            // A scrollable region must be reachable by keyboard (axe scrollable-region-focusable).
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={t('dcApi.request')}
            className="mt-2 max-h-64 overflow-auto rounded-md border border-line bg-surface-muted p-2 font-mono text-xs"
          >
            {JSON.stringify(request, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
