/**
 * One decoded protocol object, raw text and decoded view side by side: JWT header and payload, SD-JWT
 * disclosures and key-binding JWT, JSON with its embedded Data Integrity proof, or URL parameters.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DecodedSection, DecodedView } from './analyse';
import { CopyDownload } from './CopyDownload';
import {
  collectSdDigests,
  disclosureDigest,
  formatJson,
  isJsonObject,
  type DecodedJwt,
  type DecodedSdJwt,
  type JsonObject,
} from './decode';
import { JsonTree } from './JsonTree';

interface SectionViewProps {
  section: DecodedSection;
  /** Prefix of the download file name (run id and message number). */
  filePrefix: string;
}

export function SectionView({ section, filePrefix }: SectionViewProps) {
  const { t } = useTranslation();
  const title = t(`inspector.section.${section.kind}`);
  const where = t('inspector.sectionSource', {
    source: t(`inspector.source.${section.source}`),
    path: section.path,
  });
  const json = section.view.type === 'json' || section.view.type === 'params';
  return (
    <section
      aria-label={`${title}, ${where}`}
      className="rounded-md border border-line bg-surface"
      data-section={section.kind}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h4 className="text-sm font-semibold">
          {title} <span className="font-mono text-xs font-normal text-fg-muted">{where}</span>
        </h4>
        <CopyDownload
          text={section.raw}
          what={title}
          fileName={`${filePrefix}_${section.source}_${section.path.replace(/[^A-Za-z0-9_-]+/g, '-')}.${json ? 'json' : 'txt'}`}
          mediaType={json ? 'application/json' : 'text/plain'}
        />
      </header>
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="min-w-0">
          <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('inspector.raw')}
          </h5>
          <pre
            className="max-h-72 overflow-auto rounded bg-surface-muted p-2 font-mono text-xs break-all whitespace-pre-wrap"
            data-testid="section-raw"
          >
            {section.raw}
          </pre>
        </div>
        <div className="min-w-0" data-testid="section-decoded">
          <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('inspector.decoded')}
          </h5>
          <Decoded view={section.view} />
        </div>
      </div>
    </section>
  );
}

function Decoded({ view }: { view: DecodedView }) {
  const { t } = useTranslation();
  switch (view.type) {
    case 'jwt':
      return <JwtView jwt={view.jwt} />;
    case 'sd-jwt':
      return <SdJwtView sdJwt={view.sdJwt} />;
    case 'json':
      return (
        <div className="space-y-3">
          <JsonTree value={view.value} />
          {view.proofs.map((proof, index) => (
            <ProofBlock key={index} proof={proof} />
          ))}
        </div>
      );
    case 'params':
      return <ParamsTable params={view.params} />;
    case 'opaque':
      return <p className="text-sm text-fg-muted">{t('inspector.opaque')}</p>;
  }
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h6 className="text-xs font-semibold text-fg">{label}</h6>
      {children}
    </div>
  );
}

export function JwtView({ jwt }: { jwt: DecodedJwt }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-testid="jwt-view">
      <Labelled label={t('inspector.jwt.header')}>
        <JsonTree value={jwt.header} />
      </Labelled>
      <Labelled label={t('inspector.jwt.payload')}>
        <JsonTree value={jwt.payload} />
      </Labelled>
      <Labelled label={t('inspector.jwt.signature')}>
        <p className="font-mono text-xs break-all text-fg-muted">
          {jwt.signature || t('inspector.jwt.unsigned')}
        </p>
      </Labelled>
    </div>
  );
}

/** Whether each disclosure's digest is listed in the issuer JWT; undefined while hashing. */
function useDisclosureListing(sdJwt: DecodedSdJwt): Array<boolean | undefined> {
  const [listing, setListing] = useState<Array<boolean | undefined>>([]);
  useEffect(() => {
    let cancelled = false;
    const payload = sdJwt.issuerJwt.decoded.payload;
    const sdAlg = isJsonObject(payload) && typeof payload._sd_alg === 'string' ? payload._sd_alg : 'sha-256';
    const listed = collectSdDigests(payload);
    void Promise.all(sdJwt.disclosures.map((d) => disclosureDigest(d.encoded, sdAlg))).then((digests) => {
      if (!cancelled)
        setListing(digests.map((digest) => (digest === undefined ? undefined : listed.has(digest))));
    });
    return () => {
      cancelled = true;
    };
  }, [sdJwt]);
  return listing;
}

export function SdJwtView({ sdJwt }: { sdJwt: DecodedSdJwt }) {
  const { t } = useTranslation();
  const listing = useDisclosureListing(sdJwt);
  return (
    <div className="space-y-3" data-testid="sd-jwt-view">
      <Labelled label={t('inspector.sdJwt.issuerJwt')}>
        <JwtView jwt={sdJwt.issuerJwt.decoded} />
      </Labelled>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs" data-testid="disclosures">
          <caption className="mb-1 text-left text-xs font-semibold text-fg">
            {t('inspector.sdJwt.disclosures', { count: sdJwt.disclosures.length })}
            <span className="block font-normal text-fg-muted">{t('inspector.sdJwt.disclosuresHint')}</span>
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-1 pr-2 font-semibold">
                {t('inspector.sdJwt.name')}
              </th>
              <th scope="col" className="py-1 pr-2 font-semibold">
                {t('inspector.sdJwt.value')}
              </th>
              <th scope="col" className="py-1 pr-2 font-semibold">
                {t('inspector.sdJwt.salt')}
              </th>
              <th scope="col" className="py-1 font-semibold">
                {t('inspector.sdJwt.listed')}
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sdJwt.disclosures.map((disclosure, index) => {
              const listed = listing[index];
              return (
                <tr key={disclosure.encoded} className="border-b border-line align-top">
                  <th scope="row" className="py-1 pr-2 font-normal">
                    {disclosure.name ?? t('inspector.sdJwt.arrayElement')}
                  </th>
                  <td className="py-1 pr-2 break-all">{JSON.stringify(disclosure.value)}</td>
                  <td className="py-1 pr-2 break-all text-fg-muted">{disclosure.salt}</td>
                  <td className={`py-1 ${listed === false ? 'text-fail' : ''}`}>
                    {listed === undefined
                      ? t('inspector.sdJwt.checking')
                      : listed
                        ? t('inspector.sdJwt.listedYes')
                        : t('inspector.sdJwt.listedNo')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sdJwt.invalidDisclosures.map((part) => (
          <p key={part} className="mt-1 text-xs text-fail">
            {t('inspector.sdJwt.invalid', { value: part })}
          </p>
        ))}
      </div>
      {sdJwt.keyBinding ? (
        <Labelled label={t('inspector.sdJwt.keyBinding')}>
          <JwtView jwt={sdJwt.keyBinding.decoded} />
        </Labelled>
      ) : (
        <p className="text-xs text-fg-muted">{t('inspector.sdJwt.noKeyBinding')}</p>
      )}
    </div>
  );
}

/** Fields of a Data Integrity or Linked Data proof that say who signed, when, for what and how. */
const PROOF_FIELDS = [
  'type',
  'cryptosuite',
  'created',
  'expires',
  'verificationMethod',
  'proofPurpose',
  'challenge',
  'domain',
  'proofValue',
  'jws',
];

export function ProofBlock({ proof }: { proof: JsonObject }) {
  const { t } = useTranslation();
  const fields = [
    ...PROOF_FIELDS.filter((field) => field in proof),
    ...Object.keys(proof).filter((field) => !PROOF_FIELDS.includes(field)),
  ];
  return (
    <table className="w-full border-collapse text-left text-xs" data-testid="ldp-proof">
      <caption className="mb-1 text-left text-xs font-semibold text-fg">
        {t('inspector.proof.heading')}
      </caption>
      <tbody>
        {fields.map((field) => {
          const value = proof[field];
          return (
            <tr key={field} className="border-b border-line align-top">
              <th scope="row" className="py-1 pr-2 font-mono font-normal">
                {field}
              </th>
              <td className="py-1 font-mono break-all">
                {typeof value === 'string' ? value : formatJson(value)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ParamsTable({ params }: { params: Array<[string, string]> }) {
  const { t } = useTranslation();
  return (
    <table className="w-full border-collapse text-left text-xs">
      <caption className="sr-only">{t('inspector.params.caption')}</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="py-1 pr-2 font-semibold">
            {t('inspector.params.name')}
          </th>
          <th scope="col" className="py-1 font-semibold">
            {t('inspector.params.value')}
          </th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {params.map(([name, value], index) => (
          <tr key={`${name}-${index}`} className="border-b border-line align-top">
            <th scope="row" className="py-1 pr-2 font-normal">
              {name}
            </th>
            <td className="py-1 break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
