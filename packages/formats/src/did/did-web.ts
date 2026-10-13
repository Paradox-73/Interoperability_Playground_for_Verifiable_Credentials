/**
 * did:web (https://w3c-ccg.github.io/did-method-web/): the DID names an HTTPS URL that serves the DID
 * document.
 *
 * Local runs have no public host names or certificates, so the resolver takes a host override map:
 * `{ 'issuer.ps02.test': 'http://127.0.0.1:28110' }` makes `did:web:issuer.ps02.test` load
 * `http://127.0.0.1:28110/.well-known/did.json`. Only `*.ps02.test` names (a reserved `.test` domain,
 * RFC 6761 section 6.2) and `localhost` may be overridden, so a configuration mistake cannot redirect
 * the DID of a real domain.
 *
 * A presented credential chooses the DID, so the fetch is limited: a host outside `allowedHosts` must not
 * be or resolve to a private, loopback or link-local address, redirects are not followed, and the
 * document may be at most 100 KB.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { FormatError, errorMessage } from '../errors.js';
import { isRecord } from '../util/encoding.js';
import type { DidDocument, DidResolutionResult } from './types.js';

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string>; redirect?: 'error' },
) => Promise<{
  ok: boolean;
  status: number;
  /** Read with a size cap when present (a Fetch API Response); otherwise `text()` is used. */
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

export interface DidWebOptions {
  /** HTTP client; tests and the recording layer pass their own. Default: global fetch. */
  fetch?: FetchLike;
  /** Host (with `:port` when the DID has one) to base URL. */
  hostOverrides?: Record<string, string>;
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number;
  /**
   * Hosts (without port) whose address is not checked, for private networks you test against; `*.name`
   * matches every subdomain of `name`. Default: `*.ps02.test` and `localhost`, the local stack's names.
   */
  allowedHosts?: readonly string[];
  /** Addresses of a host name. Default: the system resolver (`dns.lookup`). */
  lookup?: (hostname: string) => Promise<string[]>;
}

export const DEFAULT_DID_WEB_ALLOWED_HOSTS: readonly string[] = ['*.ps02.test', 'localhost'];
const MAX_DOCUMENT_BYTES = 100 * 1024;

const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 127],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

function isAllowedHost(hostname: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) =>
    entry.startsWith('*.') ? hostname.endsWith(entry.slice(1)) : hostname === entry.toLowerCase(),
  );
}

/** Refuses a host that is, or resolves to, an address inside the server's own networks. */
async function assertPublicHost(host: string, options: DidWebOptions): Promise<void> {
  const hostname = host.replace(/:\d+$/, '');
  if (isAllowedHost(hostname, options.allowedHosts ?? DEFAULT_DID_WEB_ALLOWED_HOSTS)) return;
  // shortcut: the name is resolved again when fetching, so DNS rebinding can slip past; pin the address
  // in the connector if this resolver ever runs where internal services are worth reaching.
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await (options.lookup ?? defaultLookup)(hostname);
  } catch (cause) {
    throw new FormatError('DID_WEB_FETCH_FAILED', `cannot resolve did:web host ${hostname}`, { cause });
  }
  const blocked = addresses.find((address) =>
    BLOCKED_ADDRESSES.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4'),
  );
  if (blocked !== undefined || addresses.length === 0) {
    throw new FormatError(
      'DID_WEB_INSECURE',
      `did:web host ${hostname} is a private, loopback or link-local address; it is not fetched`,
      { details: { host: hostname } },
    );
  }
}

async function defaultLookup(hostname: string): Promise<string[]> {
  return (await dnsLookup(hostname, { all: true })).map((entry) => entry.address);
}

/** The body as text, refused once it passes `MAX_DOCUMENT_BYTES`. */
async function readCapped(response: Awaited<ReturnType<FetchLike>>, url: string): Promise<string> {
  const tooLarge = () =>
    new FormatError('DID_WEB_FETCH_FAILED', `${url} is larger than ${MAX_DOCUMENT_BYTES} bytes`, {
      details: { url },
    });
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) throw tooLarge();
    return text;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
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
  const { host } = parseDidWeb(did);
  // An overridden host goes where the configuration sends it (only *.ps02.test and localhost can be).
  if (options.hostOverrides?.[host] === undefined) await assertPublicHost(host, options);
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let body: string;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { accept: 'application/did+json, application/json' },
      redirect: 'error',
    });
    if (!response.ok) {
      throw new FormatError('DID_WEB_FETCH_FAILED', `GET ${url} answered HTTP ${response.status}`, {
        details: { url, status: response.status },
      });
    }
    body = await readCapped(response, url);
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
