/**
 * GET for documents a presented credential points the server at (did:web documents, status lists). The
 * credential chooses the URL, so the fetch is limited: a host outside `allowedHosts` must not be or
 * resolve to a private, loopback or link-local address, redirects are not followed, the answer may be at
 * most 100 KB, and the request times out.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { FormatError, errorMessage, type FormatErrorCode } from '../errors.js';

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

export interface FetchLimits {
  /** HTTP client; tests and the recording layer pass their own. Default: global fetch. */
  fetch?: FetchLike;
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number;
  /**
   * Hosts whose address is not checked, for private networks you test against: `name` (any port),
   * `name:port` (that port only), or `*.name` (every subdomain of `name`). Default: `*.ps02.test`, the
   * local stack's names.
   */
  allowedHosts?: readonly string[];
  /** Addresses of a host name. Default: the system resolver (`dns.lookup`). */
  lookup?: (hostname: string) => Promise<string[]>;
}

export const DEFAULT_FETCH_ALLOWED_HOSTS: readonly string[] = ['*.ps02.test'];
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
  // IPv4-compatible (with :: and ::1), NAT64 and 6to4 addresses carry an IPv4 address that may be private.
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

export interface LimitedGet {
  url: string;
  accept: string;
  /** Codes for a refused host and for any other failure, so the caller's report names its own check. */
  codes: { insecure: FormatErrorCode; failed: FormatErrorCode };
  /** The URL comes from the server's own configuration, not from a credential: no address check. */
  configured?: boolean;
}

/** The body of a successful GET as text. Rejects with a FormatError. */
export async function fetchLimited(request: LimitedGet, limits: FetchLimits = {}): Promise<string> {
  const { url, codes } = request;
  if (!request.configured) await assertPublicHost(new URL(url), limits, codes);
  const fetchImpl: FetchLike = limits.fetch ?? ((input, init) => globalThis.fetch(input, init));
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(limits.timeoutMs ?? 10_000),
      headers: { accept: request.accept },
      redirect: 'error',
    });
    if (!response.ok) {
      throw new FormatError(codes.failed, `GET ${url} answered HTTP ${response.status}`, {
        details: { url, status: response.status },
      });
    }
    return await readCapped(response, url, codes.failed);
  } catch (error) {
    if (error instanceof FormatError) throw error;
    throw new FormatError(codes.failed, `GET ${url} failed: ${errorMessage(error)}`, {
      cause: error,
      details: { url },
    });
  }
}

function isAllowedHost(url: URL, allowed: readonly string[]): boolean {
  return allowed.some((raw) => {
    const entry = raw.toLowerCase();
    if (entry.startsWith('*.')) return url.hostname.endsWith(entry.slice(1));
    // URL.host leaves out a scheme's default port, so `name:443` never matches an https URL: write `name`.
    return /:\d+$/.test(entry) ? url.host === entry : url.hostname === entry;
  });
}

/** Refuses a host that is, or resolves to, an address inside the server's own networks. */
async function assertPublicHost(url: URL, limits: FetchLimits, codes: LimitedGet['codes']): Promise<void> {
  if (isAllowedHost(url, limits.allowedHosts ?? DEFAULT_FETCH_ALLOWED_HOSTS)) return;
  // URL keeps the brackets of an IPv6 literal (`[::1]`); the address checks need it bare.
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
  // shortcut: the name is resolved again when fetching, so DNS rebinding can slip past; pin the address
  // in the connector if this server ever runs where internal services are worth reaching.
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await (limits.lookup ?? defaultLookup)(hostname);
  } catch (cause) {
    throw new FormatError(codes.failed, `cannot resolve host ${hostname}`, { cause });
  }
  const blocked = addresses.find((address) =>
    BLOCKED_ADDRESSES.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4'),
  );
  if (blocked !== undefined || addresses.length === 0) {
    throw new FormatError(
      codes.insecure,
      `host ${hostname} is a private, loopback or link-local address; it is not fetched`,
      { details: { host: hostname } },
    );
  }
}

async function defaultLookup(hostname: string): Promise<string[]> {
  return (await dnsLookup(hostname, { all: true })).map((entry) => entry.address);
}

/** The body as text, refused once it passes `MAX_DOCUMENT_BYTES`. */
async function readCapped(
  response: Awaited<ReturnType<FetchLike>>,
  url: string,
  code: FormatErrorCode,
): Promise<string> {
  const tooLarge = () =>
    new FormatError(code, `${url} is larger than ${MAX_DOCUMENT_BYTES} bytes`, { details: { url } });
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
