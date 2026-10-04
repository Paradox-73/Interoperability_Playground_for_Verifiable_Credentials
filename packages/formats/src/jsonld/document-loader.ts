/**
 * JSON-LD document loader for Data Integrity signing and verification.
 *
 * Order of lookup for a URL:
 * 1. contexts pinned in this package plus those the caller adds (`contexts`);
 * 2. `did:` URLs through the DID resolver (a DID document, or one verification method for `#fragment`);
 * 3. only when `network` is given: a file cache, then an HTTPS fetch whose result is written to the cache.
 *
 * Network access is off by default, so a test or an offline demo can never depend on a remote context
 * by accident; a missing context fails with CONTEXT_NOT_PINNED and names the URL to pin.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FormatError, errorMessage } from '../errors.js';
import type { FetchLike } from '../did/did-web.js';
import type { DidResolver } from '../did/resolver.js';
import { parseDidUrl } from '../did/resolver.js';
import { contextForVerificationMethodType } from '../did/verification-method.js';
import { base64UrlEncode, isRecord, sha256 } from '../util/encoding.js';
import { pinnedContexts } from './contexts.js';

export interface RemoteDocument {
  contextUrl: null;
  documentUrl: string;
  document: unknown;
}

export type DocumentLoader = (url: string) => Promise<RemoteDocument>;

export type DocumentSource = 'pinned' | 'did' | 'cache' | 'network';

export interface DocumentLoaderOptions {
  /** Resolver for `did:` URLs. Without one, DID URLs fail. */
  didResolver?: DidResolver;
  /** Extra documents served offline, by URL (for example an issuer's credential vocabulary). */
  contexts?: Record<string, unknown> | Map<string, unknown>;
  /** Allows fetching contexts that are not pinned. Off unless given. */
  network?: {
    fetch?: FetchLike;
    /** Directory for fetched documents, so each URL is fetched once per machine. */
    cacheDir?: string;
    timeoutMs?: number;
  };
  /** Called for every document served, for the protocol inspector and for finding contexts to pin. */
  onLoad?: (event: { url: string; source: DocumentSource }) => void;
}

export function createDocumentLoader(options: DocumentLoaderOptions = {}): DocumentLoader {
  const documents = pinnedContexts();
  const extra =
    options.contexts instanceof Map ? options.contexts : new Map(Object.entries(options.contexts ?? {}));
  for (const [url, document] of extra) documents.set(url, document);
  const memoryCache = new Map<string, unknown>();

  const served = (url: string, document: unknown, source: DocumentSource): RemoteDocument => {
    options.onLoad?.({ url, source });
    // Libraries may modify what they receive; every caller gets its own copy.
    return { contextUrl: null, documentUrl: url, document: structuredClone(document) };
  };

  return async function documentLoader(url: string): Promise<RemoteDocument> {
    const pinned = documents.get(url);
    if (pinned !== undefined) return served(url, pinned, 'pinned');

    if (url.startsWith('did:')) return served(url, await loadDidDocument(url, options.didResolver), 'did');

    const cached = memoryCache.get(url);
    if (cached !== undefined) return served(url, cached, 'cache');

    if (!options.network) {
      throw new FormatError(
        'CONTEXT_NOT_PINNED',
        `JSON-LD document ${url} is not pinned and network access is off`,
        {
          details: { url },
        },
      );
    }
    const { document, source } = await fetchDocument(url, options.network);
    memoryCache.set(url, document);
    return served(url, document, source);
  };
}

async function loadDidDocument(url: string, resolver: DidResolver | undefined): Promise<unknown> {
  if (!resolver) throw new FormatError('DID_METHOD_UNSUPPORTED', `no DID resolver configured to load ${url}`);
  const parsed = parseDidUrl(url);
  if (parsed.fragment === undefined) return (await resolver.resolve(parsed.did)).didDocument;
  const { verificationMethod, didDocument } = await resolver.resolveVerificationMethod(url);
  // A verification method dereferenced on its own carries no context; the Data Integrity suites check
  // for the one that defines its type, which a DID document lists at its top level.
  return {
    '@context': contextForVerificationMethodType(verificationMethod.type) ?? didDocument['@context'],
    ...verificationMethod,
    id: verificationMethod.id.startsWith('#')
      ? `${parsed.did}${verificationMethod.id}`
      : verificationMethod.id,
  };
}

async function fetchDocument(
  url: string,
  network: NonNullable<DocumentLoaderOptions['network']>,
): Promise<{ document: unknown; source: DocumentSource }> {
  if (!url.startsWith('https://')) {
    throw new FormatError(
      'CONTEXT_FETCH_FAILED',
      `refusing to fetch JSON-LD document over a non-HTTPS URL: ${url}`,
    );
  }
  const cacheFile = network.cacheDir
    ? join(network.cacheDir, `${base64UrlEncode(sha256(url))}.json`)
    : undefined;
  if (cacheFile) {
    try {
      const entry = JSON.parse(await readFile(cacheFile, 'utf8')) as unknown;
      if (isRecord(entry) && entry.url === url) return { document: entry.document, source: 'cache' };
    } catch {
      // Not cached yet (or unreadable): fetch below.
    }
  }
  const fetchImpl: FetchLike = network.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let document: unknown;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(network.timeoutMs ?? 10_000),
      headers: { accept: 'application/ld+json, application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    document = JSON.parse(await response.text());
  } catch (cause) {
    throw new FormatError(
      'CONTEXT_FETCH_FAILED',
      `could not fetch JSON-LD document ${url}: ${errorMessage(cause)}`,
      {
        cause,
        details: { url },
      },
    );
  }
  if (cacheFile && network.cacheDir) {
    await mkdir(network.cacheDir, { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ url, fetchedAt: new Date().toISOString(), document }));
  }
  return { document, source: 'network' };
}
