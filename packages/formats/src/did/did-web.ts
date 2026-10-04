/**
 * did:web (https://w3c-ccg.github.io/did-method-web/): the DID names an HTTPS URL that serves the DID
 * document.
 *
 * Local runs have no public host names or certificates, so the resolver takes a host override map:
 * `{ 'issuer.ps02.test': 'http://127.0.0.1:28110' }` makes `did:web:issuer.ps02.test` load
 * `http://127.0.0.1:28110/.well-known/did.json`. Only `*.ps02.test` names (a reserved `.test` domain,
 * RFC 6761 section 6.2) and `localhost` may be overridden, so a configuration mistake cannot redirect
 * the DID of a real domain.
 */
import { FormatError, errorMessage } from '../errors.js';
import { isRecord } from '../util/encoding.js';
import type { DidDocument, DidResolutionResult } from './types.js';

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface DidWebOptions {
  /** HTTP client; tests and the recording layer pass their own. Default: global fetch. */
  fetch?: FetchLike;
  /** Host (with `:port` when the DID has one) to base URL. */
  hostOverrides?: Record<string, string>;
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number;
}

const OVERRIDABLE_HOST = /^(?:[a-z0-9-]+\.)*ps02\.test(?::\d{1,5})?$|^localhost(?::\d{1,5})?$/;

export function assertOverridableHost(host: string): void {
  if (!OVERRIDABLE_HOST.test(host)) {
    throw new FormatError(
      'DID_WEB_INSECURE',
      `did:web host override "${host}" refused: only *.ps02.test and localhost hosts can be mapped`,
    );
  }
}

export interface DidWebLocation {
  /** Host with port, decoded (`localhost:28110`). */
  host: string;
  /** Path segments after the host; empty for `/.well-known/did.json`. */
  path: string[];
}

/** did:web "Read (Resolve)": host and path of the document URL, before the scheme is added. */
export function parseDidWeb(did: string): DidWebLocation {
  if (!did.startsWith('did:web:')) throw new FormatError('DID_INVALID', `not a did:web: ${did}`);
  const segments = did.slice('did:web:'.length).split(':');
  const [encodedHost, ...path] = segments;
  let host: string;
  try {
    host = decodeURIComponent(encodedHost ?? '');
  } catch (cause) {
    throw new FormatError('DID_INVALID', `did:web host is not percent-encoded correctly: ${did}`, { cause });
  }
  if (
    !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host) ||
    path.some((segment) => segment.length === 0 || segment.includes('/'))
  ) {
    throw new FormatError('DID_INVALID', `not a valid did:web: ${did}`, {
      spec: 'did:web "Method-specific identifier"',
    });
  }
  return { host: host.toLowerCase(), path: path.map((segment) => decodeURIComponent(segment)) };
}

/** URL of the DID document, with the override map applied. */
export function didWebDocumentUrl(did: string, hostOverrides: Record<string, string> = {}): string {
  const { host, path } = parseDidWeb(did);
  const suffix =
    path.length === 0 ? '/.well-known/did.json' : `/${path.map(encodeURIComponent).join('/')}/did.json`;
  const override = hostOverrides[host];
  if (override !== undefined) {
    assertOverridableHost(host);
    return `${override.replace(/\/+$/, '')}${suffix}`;
  }
  return `https://${host}${suffix}`;
}

/** The did:web for a base URL, for roles that host their own document (`https://h:1/x` -> `did:web:h%3A1:x`). */
export function didWebFromUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const host = url.port ? `${url.hostname}%3A${url.port}` : url.hostname;
  const path = url.pathname.split('/').filter((segment) => segment.length > 0);
  return ['did:web', host, ...path].join(':');
}

export async function resolveDidWeb(did: string, options: DidWebOptions = {}): Promise<DidResolutionResult> {
  const url = didWebDocumentUrl(did, options.hostOverrides);
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let body: string;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { accept: 'application/did+json, application/json' },
    });
    if (!response.ok) {
      throw new FormatError('DID_WEB_FETCH_FAILED', `GET ${url} answered HTTP ${response.status}`, {
        details: { url, status: response.status },
      });
    }
    body = await response.text();
  } catch (error) {
    if (error instanceof FormatError) throw error;
    throw new FormatError('DID_WEB_FETCH_FAILED', `GET ${url} failed: ${errorMessage(error)}`, {
      cause: error,
      details: { url },
    });
  }
  let document: unknown;
  try {
    document = JSON.parse(body);
  } catch (cause) {
    throw new FormatError('DID_DOCUMENT_INVALID', `${url} did not return JSON`, { cause, details: { url } });
  }
  if (!isRecord(document) || document.id !== did) {
    throw new FormatError('DID_DOCUMENT_INVALID', `DID document id must equal ${did}`, {
      spec: 'did:web "Read (Resolve)" (the document id must match the DID)',
      details: { url, id: isRecord(document) ? document.id : undefined },
    });
  }
  return {
    didDocument: document as unknown as DidDocument,
    didResolutionMetadata: { method: 'web', retrievedFrom: url },
  };
}
