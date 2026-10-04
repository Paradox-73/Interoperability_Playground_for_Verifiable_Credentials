/**
 * Transport for calls from the playground's roles to the playground itself (the hosted reference roles
 * and the reverse proxy): such requests are dispatched into the Fastify instance with `app.inject()`
 * instead of over a socket. They pass through the same routes, body parsers, hooks (the inbound
 * recorder) and serialisers as a request from a phone; only the TCP connection is left out. This keeps
 * reference runs working when the public URL is an address the server cannot reach from inside (a
 * tunnel, a LAN address behind client isolation) and lets tests run without opening a port.
 *
 * Every other URL goes to `network` (the network-mapped fetch).
 */
import type { FastifyInstance } from 'fastify';

export interface SelfTransportOptions {
  /** Origins that are this server (public URL, `localhost:<port>`, `127.0.0.1:<port>`). */
  selfOrigins: readonly string[];
  network: typeof globalThis.fetch;
}

/** Response statuses that carry no body; `new Response(body)` refuses one for them. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export function isSelfUrl(url: URL, selfOrigins: readonly string[]): boolean {
  return selfOrigins.includes(url.origin);
}

/** Origins under which this server is reached, for `isSelfUrl`. */
export function selfOriginsFor(port: number, publicUrl?: string): string[] {
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  if (publicUrl) origins.add(new URL(publicUrl).origin);
  return [...origins];
}

export function selfTransport(
  app: Pick<FastifyInstance, 'inject'>,
  options: SelfTransportOptions,
): typeof globalThis.fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!isSelfUrl(url, options.selfOrigins)) return options.network(request);
    if (request.signal.aborted) throw request.signal.reason;

    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      headers[name] = value;
    });
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    const injected = app.inject({
      method: request.method as 'GET',
      url: `${url.pathname}${url.search}`,
      headers: { ...headers, host: url.host },
      ...(body === undefined ? {} : { payload: body }),
    });
    const response = await raceSignal(injected, request.signal);

    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [String(value)]) responseHeaders.append(name, item);
    }
    const result = new Response(NULL_BODY_STATUSES.has(response.statusCode) ? null : response.rawPayload, {
      status: response.statusCode,
      headers: responseHeaders,
    });
    Object.defineProperty(result, 'url', { value: url.toString() });
    return result;
  }) as typeof globalThis.fetch;
}

function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason as Error);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error as Error);
      },
    );
  });
}
