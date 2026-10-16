/**
 * GET for documents a presented credential points the server at (did:web documents, status lists, JSON-LD
 * contexts). The credential chooses the URL, so the fetch is limited: a host outside `allowedHosts` must
 * not be or resolve to a private, loopback or link-local address, and the connection goes to the address
 * that was checked (no second lookup, so DNS rebinding cannot swap in another); only http and https URLs
 * are fetched, redirects are not followed, the answer may be at most 100 KB, and the request times out.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { get as httpGet, type IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { FormatError, errorMessage, type FormatErrorCode } from '../errors.js';

export type FetchLike = (
  url: string,
  init?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirect?: 'error';
    /** The checked address of a host outside `allowedHosts`: connect there, do not resolve the name again. */
    pinnedAddress?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  /** Read with a size cap when present (a Fetch API Response); otherwise `text()` is used. */
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

export interface FetchLimits {
  /**
   * HTTP client; tests and the recording layer pass their own. Default: `pinnedFetch`. A client used in
   * production must hand requests with `init.pinnedAddress` to `pinnedFetch`, or DNS rebinding is open.
   */
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
  // IPv4-compatible (with :: and ::1), SIIT, NAT64, 6to4 and Teredo addresses carry an IPv4 address that
  // may be private; discard-only (100::/64) and site-local (fec0::/10) addresses are never public.
  ['::', 96],
  ['::ffff:0:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
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
  const parsed = parseUrl(url, codes.failed);
  // A credential could name file:, data: or ftp: URLs; only the two schemes an HTTP client speaks go out.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new FormatError(codes.insecure, `${url} is not an http or https URL; it is not fetched`, {
      details: { url },
    });
  }
  const pinnedAddress = request.configured ? undefined : await assertPublicHost(parsed, limits, codes);
  const fetchImpl: FetchLike = limits.fetch ?? pinnedFetch;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(limits.timeoutMs ?? 10_000),
      headers: { accept: request.accept },
      redirect: 'error',
      ...(pinnedAddress === undefined ? {} : { pinnedAddress }),
    });
    if (!response.ok) {
      // The body is not read; cancelling it frees the socket now instead of at the timeout.
      await response.body?.cancel().catch(() => undefined);
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

/** The URL, or a FormatError with the caller's code, so the report blames the caller's check. */
function parseUrl(url: string, code: FormatErrorCode): URL {
  try {
    return new URL(url);
  } catch (cause) {
    throw new FormatError(code, `${url} is not a URL`, { cause, details: { url } });
  }
}

function isAllowedHost(url: URL, allowed: readonly string[]): boolean {
  return allowed.some((raw) => {
    const entry = raw.toLowerCase();
    if (entry.startsWith('*.')) return url.hostname.endsWith(entry.slice(1));
    if (!/:\d+$/.test(entry)) return url.hostname === entry;
    // URL.port is empty for the scheme's default port, so `name:443` must still match https://name/.
    return `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}` === entry;
  });
}

/**
 * Refuses a host that is, or resolves to, an address inside the server's own networks. Returns the
 * checked address to connect to, or `undefined` for an allowed host.
 */
async function assertPublicHost(
  url: URL,
  limits: FetchLimits,
  codes: LimitedGet['codes'],
): Promise<string | undefined> {
  if (isAllowedHost(url, limits.allowedHosts ?? DEFAULT_FETCH_ALLOWED_HOSTS)) return undefined;
  // URL keeps the brackets of an IPv6 literal (`[::1]`); the address checks need it bare.
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
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
  return addresses[0];
}

/**
 * GET with Node's http/https client. With `init.pinnedAddress` the socket connects to that address while
 * the URL's host name stays in the Host header and the TLS server name; without it, the global fetch.
 */
export const pinnedFetch: FetchLike = (url, init) => {
  const address = init?.pinnedAddress;
  if (address === undefined) return globalThis.fetch(url, init);
  const family = isIP(address);
  const lookup = ((_hostname, options, callback) => {
    // Node asks for every address (`all: true`) when it tries IPv4 and IPv6 in turn.
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  }) as LookupFunction;
  const get = new URL(url).protocol === 'https:' ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      { headers: init?.headers, lookup, ...(init?.signal ? { signal: init.signal } : {}) },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
        resolve({ ok: status >= 200 && status < 300, status, body, text: () => new Response(body).text() });
      },
    );
    request.on('error', reject);
  });
};

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
