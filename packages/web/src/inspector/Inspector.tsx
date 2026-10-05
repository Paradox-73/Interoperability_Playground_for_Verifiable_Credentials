/**
 * Protocol inspector: the recorded messages of a run grouped by protocol step on the left, and the
 * selected message on the right with what the step is for, its decoded payloads beside the raw text,
 * and the full request and response (method, URL, status, headers, body).
 */
import { STEP_INFO, type RecordedExchange, type StepId } from '@inji-playground/protocol';
import { forwardRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../state/run-view';
import { analyseArtifact, analyseExchange } from './analyse';
import { CopyDownload } from './CopyDownload';
import { formatJson, tryParseJson } from './decode';
import { JsonTree } from './JsonTree';
import { downloadName, shortUrl, type ArtifactItem, type InspectorItem, type InspectorModel } from './model';
import { SectionView } from './SectionView';
import { stepHelpKey } from './step-help';

interface InspectorProps {
  runId: string;
  model: InspectorModel;
  /** The item shown in the detail pane; the list highlights it. */
  selected?: InspectorItem;
  /** True when `selected` is the newest item chosen automatically, not by the person. */
  following: boolean;
  onSelect: (id: string) => void;
}

export const Inspector = forwardRef<HTMLHeadingElement, InspectorProps>(function Inspector(
  { runId, model, selected, following, onSelect },
  detailHeadingRef,
) {
  const { t } = useTranslation();
  if (model.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm text-fg-muted">
        {t('inspector.empty')}
      </p>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
      <nav aria-label={t('inspector.messagesLabel', { runId })} className="min-w-0">
        <ol className="space-y-3">
          {model.groups.map((group) => (
            <li key={group.key}>
              <p className="text-xs font-semibold text-fg-muted">
                {group.step ? group.label || STEP_INFO[group.step].label : t('inspector.untagged')}
              </p>
              <ul className="mt-1 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <ItemButton item={item} current={item.id === selected?.id} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0">
        {selected ? (
          selected.kind === 'exchange' ? (
            <ExchangeDetail
              ref={detailHeadingRef}
              runId={runId}
              exchange={selected.exchange}
              following={following}
            />
          ) : (
            <ArtifactDetail ref={detailHeadingRef} runId={runId} item={selected} following={following} />
          )
        ) : (
          <p className="text-sm text-fg-muted">{t('inspector.selectPrompt')}</p>
        )}
      </div>
    </div>
  );
});

function ItemButton({
  item,
  current,
  onSelect,
}: {
  item: InspectorItem;
  current: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const base = 'block w-full rounded px-2 py-1 text-left text-xs font-mono';
  const style = current ? 'bg-accent-soft text-fg font-semibold' : 'text-fg hover:bg-surface-muted';
  if (item.kind === 'artifact') {
    return (
      <button
        type="button"
        className={`${base} ${style}`}
        aria-current={current ? 'true' : undefined}
        onClick={() => onSelect(item.id)}
        data-item-id={item.id}
      >
        {t('inspector.artifactTitle', { kind: t(`inspector.artifact.${item.artifactKind}`) })}
      </button>
    );
  }
  const { exchange } = item;
  const failed = exchange.error !== undefined || !exchange.response || exchange.response.status >= 400;
  return (
    <button
      type="button"
      className={`${base} ${style}`}
      aria-current={current ? 'true' : undefined}
      onClick={() => onSelect(item.id)}
      data-item-id={item.id}
    >
      <span className="block truncate">
        {exchange.seq}. {exchange.request.method} {shortUrl(exchange.request.url)}
      </span>
      <span className={`block ${failed ? 'text-fail' : 'text-fg-muted'}`}>
        {exchange.from} → {exchange.to} ·{' '}
        {exchange.response
          ? t('inspector.status', { status: exchange.response.status })
          : t('inspector.noResponse')}
      </span>
    </button>
  );
}

function StepHelp({ step }: { step: StepId | undefined }) {
  const { t } = useTranslation();
  if (!step) return null;
  const info = STEP_INFO[step];
  return (
    <div className="rounded-md border border-line bg-surface-muted p-3 text-sm" data-testid="step-help">
      <p className="font-semibold">
        {t('inspector.whatIsThis')} {info.protocolTerm}
      </p>
      <p className="mt-1">{t(`inspector.stepHelp.${stepHelpKey(step)}`)}</p>
      {info.spec && (
        <a
          href={info.spec.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-accent underline"
        >
          {t('inspector.specLink', { name: info.spec.name, section: info.spec.section })}
          <span className="sr-only">{t('inspector.opensInNewTab')}</span>
        </a>
      )}
    </div>
  );
}

function FollowingNote({ following }: { following: boolean }) {
  const { t } = useTranslation();
  return following ? <p className="text-xs text-fg-muted">{t('inspector.following')}</p> : null;
}

const ExchangeDetail = forwardRef<
  HTMLHeadingElement,
  { runId: string; exchange: RecordedExchange; following: boolean }
>(function ExchangeDetail({ runId, exchange, following }, headingRef) {
  const { t } = useTranslation();
  const sections = useMemo(() => analyseExchange(exchange), [exchange]);
  const filePrefix = downloadName(runId, `message-${exchange.seq}`);
  return (
    <article className="space-y-3" data-testid="exchange-detail" data-exchange-id={exchange.id}>
      <header className="space-y-1">
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold">
          {t('inspector.messageHeading', {
            seq: exchange.seq,
            method: exchange.request.method,
            path: shortUrl(exchange.request.url),
          })}
        </h3>
        <FollowingNote following={following} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-fg-muted">{t('inspector.fromTo')}</dt>
          <dd className="font-mono">
            {exchange.from} → {exchange.to}
          </dd>
          <dt className="text-fg-muted">{t('inspector.captured')}</dt>
          <dd>{t(`inspector.capture.${exchange.capture}`)}</dd>
          <dt className="text-fg-muted">{t('inspector.timing')}</dt>
          <dd className="font-mono">
            {exchange.startedAt} · {formatDuration(exchange.durationMs)}
          </dd>
        </dl>
        {exchange.redacted && <p className="text-xs text-warn">{t('inspector.redacted')}</p>}
      </header>

      <StepHelp step={exchange.step} />

      {sections.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">
            {t('inspector.decodedHeading', { count: sections.length })}
          </h4>
          <p className="text-xs text-fg-muted">{t('inspector.notVerified')}</p>
          {sections.map((section) => (
            <SectionView key={section.id} section={section} filePrefix={filePrefix} />
          ))}
        </div>
      )}

      <HttpPane
        title={t('inspector.request')}
        startLine={`${exchange.request.method} ${exchange.request.url}`}
        headers={exchange.request.headers}
        body={exchange.request.body}
        binary={exchange.request.bodyEncoding === 'base64'}
        fileName={`${filePrefix}_request`}
      />
      {exchange.response ? (
        <HttpPane
          title={t('inspector.response')}
          startLine={t('inspector.status', { status: exchange.response.status })}
          headers={exchange.response.headers}
          body={exchange.response.body}
          binary={exchange.response.bodyEncoding === 'base64'}
          fileName={`${filePrefix}_response`}
        />
      ) : (
        <p className="rounded-md border border-fail p-3 text-sm text-fail">
          {t('inspector.networkError', { error: exchange.error ?? t('inspector.noResponse') })}
        </p>
      )}
    </article>
  );
});

function HttpPane({
  title,
  startLine,
  headers,
  body,
  binary,
  fileName,
}: {
  title: string;
  startLine: string;
  headers: Record<string, string>;
  body: string | undefined;
  binary: boolean;
  fileName: string;
}) {
  const { t } = useTranslation();
  const json = body !== undefined && !binary ? tryParseJson(body) : undefined;
  const headerEntries = Object.entries(headers);
  return (
    <section aria-label={title} className="rounded-md border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h4 className="text-sm font-semibold">
          {title} <span className="font-mono text-xs font-normal break-all">{startLine}</span>
        </h4>
        {body !== undefined && body.length > 0 && (
          <CopyDownload
            text={json !== undefined ? formatJson(json) : body}
            what={t('inspector.bodyOf', { title })}
            fileName={`${fileName}.${json !== undefined ? 'json' : binary ? 'b64' : 'txt'}`}
            mediaType={json !== undefined ? 'application/json' : 'text/plain'}
          />
        )}
      </header>
      <div className="space-y-2 p-3">
        <details>
          <summary className="cursor-pointer text-xs font-semibold">
            {t('inspector.headers', { count: headerEntries.length })}
          </summary>
          <table className="mt-1 w-full border-collapse text-left font-mono text-xs">
            <tbody>
              {headerEntries.map(([name, value]) => (
                <tr key={name} className="border-b border-line align-top">
                  <th scope="row" className="py-0.5 pr-2 font-normal text-fg-muted">
                    {name}
                  </th>
                  <td className="py-0.5 break-all">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        {body === undefined || body.length === 0 ? (
          <p className="text-xs text-fg-muted">{t('inspector.noBody')}</p>
        ) : binary ? (
          <p className="text-xs text-fg-muted">{t('inspector.binaryBody', { length: body.length })}</p>
        ) : json !== undefined ? (
          <JsonTree value={json} />
        ) : (
          <pre
            // A scrollable region must be reachable by keyboard (axe scrollable-region-focusable).
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={t('inspector.bodyOf', { title })}
            className="max-h-72 overflow-auto rounded bg-surface-muted p-2 font-mono text-xs break-all whitespace-pre-wrap"
          >
            {body}
          </pre>
        )}
      </div>
    </section>
  );
}

const ArtifactDetail = forwardRef<
  HTMLHeadingElement,
  { runId: string; item: ArtifactItem; following: boolean }
>(function ArtifactDetail({ runId, item, following }, headingRef) {
  const { t } = useTranslation();
  const sections = useMemo(() => analyseArtifact(item.artifactKind, item.raw), [item]);
  const filePrefix = downloadName(runId, item.id);
  return (
    <article className="space-y-3" data-testid="artifact-detail">
      <header className="space-y-1">
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold">
          {t('inspector.artifactTitle', { kind: t(`inspector.artifact.${item.artifactKind}`) })}
        </h3>
        <FollowingNote following={following} />
        <p className="text-xs text-fg-muted">
          {t('inspector.artifactHint')}
          {item.format && <> {t('inspector.artifactFormat', { format: t(`format.${item.format}`) })}</>}
        </p>
      </header>
      {sections.map((section) => (
        <SectionView key={section.id} section={section} filePrefix={filePrefix} />
      ))}
    </article>
  );
});
