/**
 * Run report page (`/runs/:id/report`): the pass/fail interoperability report PS02 task 7 asks for.
 *
 * The first block holds the mandatory fields (issuer, wallet, verifier, format, proof type, outcome,
 * error detail); then the scenario's expected outcome next to the actual one, the run details, every
 * step with its timing and specification, downloads (Markdown, JSON, redacted export), links into the
 * inspector and the "replay with tamper" menu. The page prints cleanly: controls are hidden in print.
 */
import type { RoleRef, RunReportDocument } from '@inji-playground/protocol';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { apiUrl, describeError } from '../../api/http';
import { CheckIcon, CrossIcon, SkipIcon } from '../../app/icons';
import { useDocumentTitle } from '../../app/use-document-title';
import { formatMs, formatUtc } from '../history/format';
import { useRefreshOnRunFinished } from '../history/live-refresh';
import { ReplayWithTamper } from '../tamper/ReplayWithTamper';
import { OutcomeComparisonView } from '../tamper/TamperControls';
import { isNotFinished, reportKey, reportPaths, useRunReport } from './api';
import { OutcomeBadge, StatusBadge } from './badges';

export function ReportPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const report = useRunReport(id);
  useRefreshOnRunFinished([reportKey(id)]);
  const title = t('report.title', { runId: id });
  useDocumentTitle(title);
  const runLink = `/runs/${encodeURIComponent(id)}`;

  return (
    <div className="space-y-6">
      <Link to="/runs" className="text-sm text-accent underline print:hidden">
        {t('report.back')}
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>

      {report.isPending && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}
      {report.isError &&
        (isNotFinished(report.error) ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
            {t('report.notFinished')}{' '}
            <Link to={runLink} className="text-accent underline">
              {t('report.followRun')}
            </Link>
          </p>
        ) : (
          <p role="alert" className="text-sm text-fail">
            {t('report.error', { reason: describeError(report.error) })}
          </p>
        ))}
      {report.data && <ReportBody document={report.data} runLink={runLink} />}
    </div>
  );
}

function ReportBody({ document: doc, runLink }: { document: RunReportDocument; runLink: string }) {
  const { t } = useTranslation();
  const { report } = doc;
  const paths = reportPaths(report.runId);
  const action =
    'rounded-md border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-muted inline-block';

  return (
    <>
      <nav aria-label={t('report.actions')} className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className={action} onClick={() => window.print()}>
          {t('report.print')}
        </button>
        <a className={action} href={apiUrl(paths.markdownDownload)} download={`${report.runId}.report.md`}>
          {t('report.downloadMarkdown')}
        </a>
        <a className={action} href={apiUrl(paths.jsonDownload)} download={`${report.runId}.report.json`}>
          {t('report.downloadJson')}
        </a>
        <a className={action} href={apiUrl(paths.export)} download={`${report.runId}.export.json`}>
          {t('report.downloadExport')}
        </a>
        <Link className={action} to={runLink}>
          {t('report.openInspector')}
        </Link>
        <Link className={action} to={`${runLink}/playback`}>
          {t('report.playback')}
        </Link>
      </nav>

      <section aria-labelledby="mandatory-heading" className="space-y-3">
        <h2 id="mandatory-heading" className="flex flex-wrap items-center gap-3 text-lg font-semibold">
          {t('report.mandatoryHeading')} <StatusBadge status={report.verdict} className="text-base" />
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <Field name="issuer" label={t('role.kind.issuer')}>
            <RoleValue role={report.issuer} version={doc.versions.issuer} />
          </Field>
          <Field name="wallet" label={t('role.kind.wallet')}>
            <RoleValue role={report.wallet} version={doc.versions.wallet} />
          </Field>
          <Field name="verifier" label={t('role.kind.verifier')}>
            <RoleValue role={report.verifier} version={doc.versions.verifier} />
          </Field>
          <Field name="format" label={t('report.fields.format')}>
            {t(`format.${report.format}`)}
          </Field>
          <Field name="proof" label={t('report.fields.proof')}>
            <span className="font-mono">{report.credentialProof}</span>
            {report.holderProof && (
              <span className="text-fg-muted">
                {' '}
                · {t('report.fields.holderProof', { proof: report.holderProof })}
              </span>
            )}
          </Field>
          <Field name="outcome" label={t('report.fields.outcome')}>
            <OutcomeBadge outcome={report.outcome} />
          </Field>
          <Field name="error" label={t('report.fields.error')}>
            {doc.error ? (
              <span>
                {t('report.errorAt', { step: doc.error.stepLabel })}{' '}
                <span className="font-mono">{doc.error.code}</span>: {doc.error.message}
                {doc.error.exchange && (
                  <Link to={doc.error.exchange.uiLink} className="ml-2 text-accent underline print:hidden">
                    {t('report.openExchange', {
                      seq: doc.error.exchange.seq,
                      method: doc.error.exchange.method,
                    })}
                  </Link>
                )}
              </span>
            ) : (
              t('report.noError')
            )}
          </Field>
        </dl>
      </section>

      <section aria-labelledby="comparison-heading" className="space-y-3">
        <h2 id="comparison-heading" className="text-lg font-semibold">
          {t('report.comparisonHeading')}
        </h2>
        <OutcomeComparisonView report={report} />
      </section>

      <section aria-labelledby="details-heading" className="space-y-3">
        <h2 id="details-heading" className="text-lg font-semibold">
          {t('report.detailsHeading')}
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <Field name="mode" label={t('mode.label')}>
            {t(`mode.${report.mode}`)}
          </Field>
          <Field name="vciProfile" label={t('runBar.vciProfile')}>
            {t(`vciProfile.${report.vciProfile}`)}
          </Field>
          <Field name="vpProfile" label={t('runBar.vpProfile')}>
            {t(`vpProfile.${report.vpProfile}`)}
          </Field>
          {report.issuerDid && (
            <Field name="issuerDid" label={t('report.fields.issuerDid')}>
              <span className="font-mono break-all">{report.issuerDid}</span>
            </Field>
          )}
          <Field name="created" label={t('report.fields.created')}>
            {formatUtc(report.createdAt)}
          </Field>
          <Field name="duration" label={t('report.fields.duration')}>
            {t('report.durationValue', {
              total: formatMs(doc.run.totalStepMs),
              started: formatUtc(doc.run.startedAt),
              finished: formatUtc(doc.run.finishedAt),
            })}
          </Field>
          {doc.credentialSize && (
            <Field name="credentialSize" label={t('report.fields.credentialSize')}>
              {t('report.sizeValue', {
                bytes: doc.credentialSize.bytes,
                chars: doc.credentialSize.pixelpassChars,
              })}{' '}
              {doc.credentialSize.fitsQrV40 ? t('report.fitsQr') : t('report.tooBigForQr')}
            </Field>
          )}
          {report.replayOf && (
            <Field name="replayOf" label={t('report.fields.replayOf')}>
              <Link
                to={`/runs/${encodeURIComponent(report.replayOf)}/report`}
                className="text-accent underline"
              >
                {report.replayOf}
              </Link>
            </Field>
          )}
          <Field name="playground" label={t('report.fields.playground')}>
            {t('report.generated', {
              version: doc.versions.playground,
              date: formatUtc(doc.generatedAt),
            })}
          </Field>
        </dl>
      </section>

      <StepTable document={doc} />

      <ReplayWithTamper runId={report.runId} format={report.format} currentScenario={report.scenario.id} />
    </>
  );
}

function Field({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div className="contents" data-field={name}>
      <dt className="font-semibold text-fg-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RoleValue({ role, version }: { role: RoleRef; version: string }) {
  const { t } = useTranslation();
  return (
    <span>
      {role.name} <span className="font-mono text-xs">({role.id})</span>{' '}
      <span className="text-fg-muted">
        · {t(`role.ecosystem.${role.ecosystem}`)} · {t('role.version', { version })}
      </span>
    </span>
  );
}

const STEP_ICON = { ok: CheckIcon, failed: CrossIcon, skipped: SkipIcon, 'not-run': SkipIcon } as const;
const STEP_STYLE = {
  ok: 'text-ok',
  failed: 'text-fail',
  skipped: 'text-fg-muted',
  'not-run': 'text-fg-muted',
};

function StepTable({ document: doc }: { document: RunReportDocument }) {
  const { t } = useTranslation();
  const th = 'px-3 py-2 font-semibold';
  return (
    <section aria-labelledby="steps-heading" className="space-y-3">
      <h2 id="steps-heading" className="text-lg font-semibold">
        {t('report.stepsHeading')}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('report.stepsCaption', { runId: doc.report.runId })}</caption>
          <thead className="border-b border-line bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                {t('report.steps.step')}
              </th>
              <th scope="col" className={th}>
                {t('report.steps.status')}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {t('report.steps.duration')}
              </th>
              <th scope="col" className={th}>
                {t('report.steps.spec')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {doc.steps.map((step, index) => {
              const Icon = STEP_ICON[step.status];
              return (
                <tr key={`${step.step}#${index}`}>
                  <th scope="row" className="px-3 py-2 font-normal">
                    {step.label} <span className="text-fg-muted">({step.protocolTerm})</span>
                  </th>
                  <td className={`px-3 py-2 ${STEP_STYLE[step.status]}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon />
                      {t(`report.stepStatus.${step.status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatMs(step.durationMs)}
                  </td>
                  <td className="px-3 py-2">
                    {step.spec ? (
                      <a
                        href={step.spec.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline"
                      >
                        {step.spec.name}, {step.spec.section}
                        <span className="sr-only">{t('inspector.opensInNewTab')}</span>
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
