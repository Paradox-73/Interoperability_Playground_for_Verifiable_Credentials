/**
 * The phone step of a run (`mobile-wallet`, or any role that waits for a person): a modal with a large QR
 * code, the same request as a link with a copy button, what to do in plain steps, a live waiting status
 * with the time left, "Done" (`POST /api/runs/{id}/person-done`) for wallets whose traffic the playground
 * cannot see, and "Cancel run".
 *
 * The modal opens on the run's pending `person.action-needed` event and closes by itself when the step
 * ends (the server saw the wallet act, the person pressed "Done", the run was cancelled or timed out).
 */
import { RunActionResponseSchema } from '@inji-playground/protocol';
import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, postJson } from '../../api/http';
import { announce } from '../../state/announcer';
import { useRunEvents } from '../../state/run-events';
import { buildRunView, formatDuration } from '../../state/run-view';
import { pendingPersonAction, type PendingAction } from './pending';

export function ManualWalletModal({ runId }: { runId: string | undefined }) {
  const events = useRunEvents(runId);
  const pending = useMemo(
    () => (runId ? pendingPersonAction(buildRunView(runId, events)) : undefined),
    [runId, events],
  );
  if (!runId || !pending) return null;
  // Keyed by action, so a second action (offer, then request) starts with a fresh state.
  return <ActionDialog key={pending.action.id} runId={runId} {...pending} />;
}

interface ActionDialogProps extends PendingAction {
  runId: string;
}

function ActionDialog({ runId, action, startedAt }: ActionDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const statusId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const now = useNow(1000);
  const id = encodeURIComponent(runId);

  const done = useMutation({
    mutationFn: () =>
      postJson(`/api/runs/${id}/person-done`, { actionId: action.id }, (json) =>
        RunActionResponseSchema.parse(json),
      ),
    onSuccess: () => announce(t('manualWallet.doneSent')),
  });
  const cancel = useMutation({
    mutationFn: () => postJson(`/api/runs/${id}/cancel`, {}, (json) => RunActionResponseSchema.parse(json)),
    onSuccess: () => announce(t('manualWallet.cancelled')),
  });

  // Focus moves into the dialog when it opens, so keyboard and screen-reader users land on it.
  useEffect(() => heading.current?.focus(), []);

  const started = Date.parse(startedAt);
  const leftMs = Number.isNaN(started) ? undefined : Math.max(0, started + action.timeoutMs - now);
  const link = action.deepLink ?? action.qrText;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      announce(t('manualWallet.copied'));
    } catch {
      setCopied(false);
    }
  };

  const button =
    'rounded-md border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-fg-muted';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusId}
        className="my-8 w-full max-w-2xl rounded-lg border border-line bg-surface p-6 text-fg shadow-lg"
        data-testid="manual-wallet-modal"
      >
        <h2 id={titleId} ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          {action.title}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{t('manualWallet.intro', { runId })}</p>

        <div className="mt-4 grid gap-6 sm:grid-cols-[auto_1fr]">
          {action.qrText && (
            <figure className="flex flex-col items-center gap-2">
              {/* White quiet zone in both themes: phone cameras need dark modules on a light background. */}
              <div className="rounded-md bg-white p-3">
                <QRCodeSVG
                  value={action.qrText}
                  size={280}
                  level="M"
                  marginSize={2}
                  role="img"
                  aria-label={t('manualWallet.qrLabel')}
                  data-testid="manual-wallet-qr"
                />
              </div>
              <figcaption className="text-xs text-fg-muted">{t('manualWallet.qrCaption')}</figcaption>
            </figure>
          )}
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5">
              {action.instructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {link && (
              <div className="space-y-1">
                <p className="font-semibold">{t('manualWallet.linkHeading')}</p>
                <p
                  className="rounded-md border border-line bg-surface-muted p-2 font-mono text-xs break-all"
                  data-testid="manual-wallet-link"
                >
                  {link}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={button} onClick={() => void copy()}>
                    {copied ? t('manualWallet.copiedButton') : t('manualWallet.copy')}
                  </button>
                  {action.deepLink && (
                    <a href={action.deepLink} className="self-center text-accent underline">
                      {t('manualWallet.openLink')}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          id={statusId}
          aria-live="polite"
          className="mt-4 rounded-md border border-line bg-surface-muted p-3 text-sm"
        >
          <p className="font-semibold">
            <span aria-hidden="true" className="mr-1 inline-block animate-pulse motion-reduce:animate-none">
              ●
            </span>
            {t('manualWallet.waiting')}
          </p>
          {leftMs !== undefined && (
            <p className="text-fg-muted">{t('manualWallet.timeLeft', { time: formatDuration(leftMs) })}</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className={button}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t('manualWallet.cancel')}
          </button>
          <button
            type="button"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted"
            disabled={done.isPending}
            onClick={() => done.mutate()}
          >
            {t('manualWallet.done')}
          </button>
        </div>
        <p className="mt-2 text-right text-xs text-fg-muted">{t('manualWallet.doneHint')}</p>
        {(done.isError || cancel.isError) && (
          <p role="alert" className="mt-2 text-sm text-fail">
            {t('manualWallet.failed', { reason: describeError(done.error ?? cancel.error) })}
          </p>
        )}
      </div>
    </div>
  );
}

/** The current time, updated every `intervalMs`. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
