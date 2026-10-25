// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `openid4vp://authorize?...` URIs: what a QR code or a same-device link carries (OpenID4VP 1.0
 * section 5, RFC 9101 section 5 for `request_uri`).
 */
import { REQUEST_URI_SCHEMES } from './constants.js';
import { Oid4vpError } from './errors.js';

/** Builds `openid4vp://authorize?...`; object values are JSON-encoded, undefined ones left out. */
export function buildRequestUri(params: Record<string, unknown>, scheme = 'openid4vp'): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(name, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return `${scheme}://authorize?${search.toString()}`;
}

/** Parameters of a request URI, as strings exactly as received. */
export function parseRequestUri(uri: string): Record<string, string> {
  let url: URL;
  try {
    url = new URL(uri);
  } catch (cause) {
    throw new Oid4vpError('REQUEST_URI_INVALID', 'not a URI', { cause });
  }
  if (!(REQUEST_URI_SCHEMES as readonly string[]).includes(url.protocol)) {
    throw new Oid4vpError('REQUEST_URI_INVALID', `not an OpenID4VP request URI: scheme is ${url.protocol}`, {
      details: { accepted: REQUEST_URI_SCHEMES },
    });
  }
  return Object.fromEntries(url.searchParams.entries());
}
