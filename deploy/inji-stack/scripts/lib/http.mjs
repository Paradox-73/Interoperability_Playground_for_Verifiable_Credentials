// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Small HTTP helpers for the stack scripts: requests with a timeout that never throw on HTTP status, waiting
 * for an endpoint, HTTPS through the TLS front with the test CA, and the host network map.
 */
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';

/**
 * One HTTP exchange as recorded by the smoke test.
 * @typedef {{ label: string, method: string, url: string, status: number, ms: number,
 *   requestBody?: unknown, body: unknown, error?: string }} Exchange
 */

/** Parses a response body as JSON when it is JSON, else returns the text. */
export function parseBody(text) {
  if (text === '') return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * fetch with a timeout. Network errors are returned as status 0 with `error`, so callers decide what a
 * failure means.
 * @returns {Promise<Exchange>}
 */
export async function request(label, url, { method = 'GET', headers = {}, body, timeoutMs = 30_000 } = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return {
      label,
      method,
      url,
      status: response.status,
      ms: Date.now() - started,
      requestBody: body,
      body: parseBody(text),
    };
  } catch (error) {
    const message = error instanceof Error ? (error.cause?.message ?? error.message) : String(error);
    return {
      label,
      method,
      url,
      status: 0,
      ms: Date.now() - started,
      requestBody: body,
      body: '',
      error: message,
    };
  }
}

/**
 * GET over HTTPS to the TLS front from the host: connects to `url` (for example https://localhost:28443) but
 * presents `hostHeader` as TLS server name and Host header, and trusts only the given CA certificate.
 * @returns {Promise<Exchange>}
 */
export function httpsGetVia(label, url, { hostHeader, caPem, timeoutMs = 30_000 }) {
  const started = Date.now();
  const target = new URL(url);
  return new Promise((resolvePromise) => {
    const req = httpsRequest(
      {
        host: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        servername: hostHeader,
        headers: { Host: hostHeader, Accept: 'application/json' },
        ca: caPem,
        timeout: timeoutMs,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () =>
          resolvePromise({
            label,
            method: 'GET',
            url: `https://${hostHeader}${target.pathname} (via ${target.host})`,
            status: res.statusCode ?? 0,
            ms: Date.now() - started,
            body: parseBody(text),
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs} ms`)));
    req.on('error', (error) =>
      resolvePromise({
        label,
        method: 'GET',
        url,
        status: 0,
        ms: Date.now() - started,
        body: '',
        error: error.message,
      }),
    );
    req.end();
  });
}

/**
 * Polls `probe` until it returns true or `timeoutMs` passes.
 * @param {() => Promise<boolean>} probe
 * @returns {Promise<number>} milliseconds until the probe succeeded
 */
export async function waitFor(description, probe, { timeoutMs, intervalMs = 5_000, onWait } = {}) {
  const started = Date.now();
  for (;;) {
    if (await probe()) return Date.now() - started;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`${description}: not ready after ${Math.round(timeoutMs / 1000)} s`);
    }
    onWait?.(Date.now() - started);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Reads network-map.host.json: [{ from, to, hostHeader? }], longest `from` first. */
export function loadNetworkMap(file) {
  const { entries } = JSON.parse(readFileSync(file, 'utf8'));
  return [...entries].sort((a, b) => b.from.length - a.from.length);
}

/**
 * Maps a URL the stack advertises (for example http://certify-nginx:80/v1/certify/...) to the URL a host
 * client must call. Returns the URL unchanged when no entry matches. A prefix only matches at a boundary, so
 * http://certify-nginx does not capture http://certify-nginx-2.
 * @returns {{ url: string, hostHeader?: string }}
 */
export function toHostUrl(url, networkMap) {
  for (const entry of networkMap) {
    if (url === entry.from || url.startsWith(`${entry.from}/`) || url.startsWith(`${entry.from}?`)) {
      return { url: entry.to + url.slice(entry.from.length), hostHeader: entry.hostHeader };
    }
  }
  return { url };
}
