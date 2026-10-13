/**
 * Connection-level network map. In host development mode the Inji stack advertises URLs that only
 * resolve inside its compose network (`http://certify-nginx`, `https://certify.ps02.test`). The map
 * sends the TCP connection for such an origin to a port on the host instead, while the request keeps
 * its URL: the `Host` header and the TLS server name stay exactly what the stack expects, so the
 * recorded exchange shows the real URL and TLS certificates for `*.ps02.test` still validate.
 *
 * It is applied in an undici connector (the function that opens sockets for an HTTP client), not by
 * rewriting URLs, which would change what is signed (`aud`, `htu`) and what gets recorded.
 *
 * File format (`deploy/inji-stack/network-map.host.json`, chosen with `PLAYGROUND_NETWORK_MAP`):
 * `{ "entries": [{ "from": "http://certify-nginx", "to": "http://localhost:28091" }, ...] }`.
 * Only the origin (scheme, host, port) of `from` and `to` is used.
 */
import { readFileSync } from 'node:fs';
import { Agent, buildConnector, fetch as undiciFetch, type Dispatcher } from 'undici';

export interface NetworkMapEntry {
  from: string;
  to: string;
  /** Informational in the file: the TLS server name and Host header always stay the original host. */
  hostHeader?: string;
}

interface Target {
  hostname: string;
  port: string;
}

/** Default port of a URL scheme, as undici passes it when the URL has none. */
export function portOf(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

function key(protocol: string, hostname: string, port: string): string {
  return `${protocol}//${hostname.toLowerCase()}:${port}`;
}

export class NetworkMap {
  readonly #targets = new Map<string, Target>();
  /** The mapped origins as `host:port`, default port written out (`certify-nginx:80`). */
  readonly hosts: string[] = [];

  constructor(entries: readonly NetworkMapEntry[] = []) {
    for (const entry of entries) {
      const from = new URL(entry.from);
      const to = new URL(entry.to);
      if (from.protocol !== to.protocol) {
        throw new Error(`network map entry ${entry.from} -> ${entry.to} changes the scheme`);
      }
      this.hosts.push(`${from.hostname}:${portOf(from)}`);
      this.#targets.set(key(from.protocol, from.hostname, portOf(from)), {
        hostname: to.hostname,
        port: portOf(to),
      });
    }
  }

  /** Reads a map file; a missing path gives an empty map. */
  static fromFile(path: string | undefined): NetworkMap {
    if (!path) return new NetworkMap();
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { entries?: NetworkMapEntry[] };
    return new NetworkMap(parsed.entries ?? []);
  }

  get size(): number {
    return this.#targets.size;
  }

  /** Where a connection to this origin really goes, or `undefined` when it is not mapped. */
  lookup(protocol: string, hostname: string, port: string): Target | undefined {
    // undici passes an empty port for a URL on its scheme's default port (http://certify-nginx).
    const effectivePort = port === '' || port === undefined ? (protocol === 'https:' ? '443' : '80') : port;
    return this.#targets.get(key(protocol, hostname, effectivePort));
  }

  /**
   * An undici dispatcher that opens mapped connections on the mapped host and port. `ca` adds trusted
   * certificates (the stack's test CA) to the default ones.
   */
  dispatcher(options: { ca?: string } = {}): Dispatcher {
    const connect = buildConnector(options.ca ? { ca: options.ca } : {});
    return new Agent({
      connect: (connectOptions, callback) => {
        const target = this.lookup(connectOptions.protocol, connectOptions.hostname, connectOptions.port);
        if (!target) {
          connect(connectOptions, callback);
          return;
        }
        connect(
          {
            ...connectOptions,
            hostname: target.hostname,
            host: `${target.hostname}:${target.port}`,
            port: target.port,
            // TLS still checks the certificate against the advertised name, not localhost.
            servername: connectOptions.servername ?? connectOptions.hostname,
          },
          callback,
        );
      },
    });
  }
}

/**
 * A Fetch API function that goes through the network map. Without entries and without an extra CA it
 * is the global `fetch`.
 */
export function networkFetch(map: NetworkMap, options: { ca?: string } = {}): typeof globalThis.fetch {
  if (map.size === 0 && !options.ca) return globalThis.fetch;
  const dispatcher = map.dispatcher(options);
  type UndiciInit = NonNullable<Parameters<typeof undiciFetch>[1]>;
  return async (input: string | URL | Request, init?: RequestInit) => {
    // The npm undici does not recognise the global Request class (Node bundles its own copy of
    // undici), so a Request is taken apart into URL and init.
    let url: string;
    let requestInit: RequestInit = init ?? {};
    if (input instanceof Request) {
      url = input.url;
      const body = input.body ? await input.arrayBuffer() : undefined;
      requestInit = {
        method: input.method,
        headers: input.headers,
        redirect: input.redirect,
        signal: input.signal,
        ...(body === undefined ? {} : { body }),
        ...init,
      };
    } else {
      url = input.toString();
    }
    const response = await undiciFetch(url, { ...requestInit, dispatcher } as UndiciInit);
    return response;
  };
}
