// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Copy and download buttons for one payload. Downloads are made in the browser from the recorded text,
 * so nothing is requested from the server again.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CopyDownloadProps {
  text: string;
  /** What the payload is, read by screen readers after "Copy" / "Download". */
  what: string;
  fileName: string;
  mediaType?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function saveText(text: string, fileName: string, mediaType = 'text/plain'): boolean {
  if (typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(new Blob([text], { type: `${mediaType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled, or some browsers cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export function CopyDownload({ text, what, fileName, mediaType = 'text/plain' }: CopyDownloadProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // No clipboard access (insecure origin, permission denied): say so instead of pretending.
      setState('failed');
    }
  };

  const copyLabel =
    state === 'copied'
      ? t('inspector.copied')
      : state === 'failed'
        ? t('inspector.copyFailed')
        : t('inspector.copy');
  const button =
    'rounded border border-line-strong bg-surface px-2 py-0.5 text-xs text-fg hover:bg-surface-muted';
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={button}
        // The visible word starts the accessible name (WCAG 2.5.3); the payload name follows.
        aria-label={`${copyLabel} ${what}`}
        onClick={() => void copy()}
      >
        {copyLabel}
      </button>
      <button
        type="button"
        className={button}
        aria-label={`${t('inspector.download')} ${what}`}
        onClick={() => saveText(text, fileName, mediaType)}
      >
        {t('inspector.download')}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? t('inspector.copiedWhat', { what }) : ''}
      </span>
    </span>
  );
}
