// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Interoperability gap register (`/gaps`), read from `GET /api/gaps` (the server reads
 * `docs/gaps/gaps.json`). Red matrix cells link here with `?cell=<cell id>`; the page then lists only
 * the gaps whose cell patterns match that cell and offers the full list.
 *
 * Entries marked `private` are security-relevant: only their id, repository and severity are shown,
 * because the details are reported to the maintainers privately.
 */
import { GapListSchema, type Gap, type GapList } from '@inji-playground/protocol';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { describeError, getJson } from '../../api/http';
import { useDocumentTitle } from '../../app/use-document-title';
import { gapsForCell } from './cells';

export const gapsKey = ['gaps'] as const;

export function useGaps() {
  return useQuery<GapList>({
    queryKey: gapsKey,
    queryFn: ({ signal }) => getJson('/api/gaps', (json) => GapListSchema.parse(json), signal),
  });
}

export function GapsPage() {
  const { t } = useTranslation();
  const title = t('pages.gaps.title');
  useDocumentTitle(title);
  const [params] = useSearchParams();
  const cell = params.get('cell') ?? undefined;
  const gaps = useGaps();

  const all = gaps.data?.gaps ?? [];
  const shown = cell ? gapsForCell(all, cell) : all;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-fg-muted">{t('gaps.intro')}</p>
      </div>

      {cell && (
        <p
          className="rounded-md border border-line bg-surface-muted p-3 text-sm"
          data-testid="gap-cell-filter"
        >
          {t('gaps.forCell', { count: shown.length })} <span className="font-mono break-all">{cell}</span>{' '}
          <Link to="/gaps" className="text-accent underline">
            {t('gaps.showAll', { count: all.length })}
          </Link>
        </p>
      )}

      {gaps.isPending && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}
      {gaps.isError && (
        <p role="alert" className="text-sm text-fail">
          {t('gaps.error', { reason: describeError(gaps.error) })}
        </p>
      )}

      {gaps.data && all.length === 0 && <EmptyRegister source={gaps.data.source} />}
      {gaps.data && all.length > 0 && cell && shown.length === 0 && (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
          {t('gaps.noneForCell')}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="space-y-4">
          {shown.map((gap) => (
            <li key={gap.id}>
              <GapEntry gap={gap} />
            </li>
          ))}
        </ul>
      )}

      {gaps.data && gaps.data.problems.length > 0 && (
        <section aria-labelledby="gap-problems" className="space-y-2">
          <h2 id="gap-problems" className="text-lg font-semibold">
            {t('gaps.problemsHeading')}
          </h2>
          <ul className="list-disc pl-5 text-sm text-warn">
            {gaps.data.problems.map((problem) => (
              <li key={problem.index}>
                {t('gaps.problem', { index: problem.index, message: problem.message })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EmptyRegister({ source }: { source: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
      <p className="font-semibold">{source ? t('gaps.emptyFile', { source }) : t('gaps.noFile')}</p>
      <p>{t('gaps.howToAdd')}</p>
      <pre
        // A scrollable region must be reachable by keyboard (axe scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={t('gaps.howToAdd')}
        className="relative overflow-x-auto rounded bg-surface-muted p-2 font-mono text-xs"
      >
        {GAP_EXAMPLE}
      </pre>
      <p>{t('gaps.howToLink')}</p>
    </div>
  );
}

/** A register entry as a reader would write it; ids, repository and pattern are illustrative. */
const GAP_EXAMPLE = `[
  {
    "id": "G-example",
    "title": "What does not work, in one line",
    "repository": "mosip/inji-verify",
    "version": "0.18.2",
    "severity": "medium",
    "status": "new",
    "summary": "What was run, what was expected, what happened.",
    "cells": ["*/*/inji-verify/vc+sd-jwt"],
    "evidence": { "runId": "<run id>", "date": "YYYY-MM-DD" }
  }
]`;

function GapEntry({ gap }: { gap: Gap }) {
  const { t } = useTranslation();
  const isPrivate = gap.disclosure === 'private';
  return (
    <article
      id={`gap-${gap.id}`}
      aria-labelledby={`gap-${gap.id}-title`}
      className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm"
    >
      <h2 id={`gap-${gap.id}-title`} className="text-base font-semibold">
        <span className="font-mono">{gap.id}</span> · {isPrivate ? t('gaps.privateTitle') : gap.title}
      </h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
        <dt className="text-fg-muted">{t('gaps.repository')}</dt>
        <dd>
          {gap.repository}
          {gap.version && !isPrivate ? ` ${gap.version}` : ''}
        </dd>
        {gap.severity && (
          <>
            <dt className="text-fg-muted">{t('gaps.severity')}</dt>
            <dd>{t(`gaps.severityValue.${gap.severity}`)}</dd>
          </>
        )}
        {!isPrivate && gap.status && (
          <>
            <dt className="text-fg-muted">{t('gaps.status')}</dt>
            <dd>{t(`gaps.statusValue.${gap.status}`)}</dd>
          </>
        )}
        {!isPrivate && gap.cells.length > 0 && (
          <>
            <dt className="text-fg-muted">{t('gaps.cells')}</dt>
            <dd className="font-mono text-xs break-all">{gap.cells.join(', ')}</dd>
          </>
        )}
        {!isPrivate && gap.evidence && (
          <>
            <dt className="text-fg-muted">{t('gaps.evidence')}</dt>
            <dd>
              {gap.evidence.runId ? (
                <Link
                  to={`/runs/${encodeURIComponent(gap.evidence.runId)}/report`}
                  className="text-accent underline"
                >
                  {t('gaps.evidenceRun', { runId: gap.evidence.runId })}
                </Link>
              ) : null}
              {gap.evidence.caseId && <span className="ml-2 font-mono">{gap.evidence.caseId}</span>}
              {gap.evidence.date && <span className="ml-2 text-fg-muted">{gap.evidence.date}</span>}
            </dd>
          </>
        )}
        {!isPrivate && gap.upstreamIssue && (
          <>
            <dt className="text-fg-muted">{t('gaps.upstream')}</dt>
            <dd>
              <a
                href={gap.upstreamIssue}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline break-all"
              >
                {gap.upstreamIssue}
                <span className="sr-only">{t('inspector.opensInNewTab')}</span>
              </a>
            </dd>
          </>
        )}
        {!isPrivate && gap.issueDraft && (
          <>
            <dt className="text-fg-muted">{t('gaps.issueDraft')}</dt>
            <dd className="font-mono text-xs break-all">{gap.issueDraft}</dd>
          </>
        )}
      </dl>
      {isPrivate ? (
        <p className="text-fg-muted">{t('gaps.privateNote')}</p>
      ) : (
        gap.summary && <p>{gap.summary}</p>
      )}
    </article>
  );
}
