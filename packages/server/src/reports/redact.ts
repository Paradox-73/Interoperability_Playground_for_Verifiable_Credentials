// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Redaction for exports: removes the values that would let a reader of an exported run act as one of
 * its parties (bearer tokens, one-time codes, client secrets, cookies, private key material) while
 * keeping everything that makes the export useful as interoperability evidence (URLs, metadata,
 * credentials, presentations, verification results, error bodies).
 *
 * Stored exchanges keep their full payloads; redaction happens only on the way out.
 *
 * A redacted value becomes `[redacted sha256:<first 8 hex digits>]`. The digest prefix shows whether
 * two places carried the same value (for example the access token returned by the token endpoint and
 * the one sent to the credential endpoint) without revealing it.
 */
import { createHash } from 'node:crypto';
import type {
  RecordedExchange,
  RecordedRequest,
  RecordedResponse,
  RunEvent,
} from '@inji-playground/protocol';

/**
 * Names of fields that carry a secret in a JSON body, a form body or a URL query, compared after
 * lower-casing and turning `-` into `_`. `code` is a secret only in forms and URLs (the OAuth
 * authorization code); in JSON bodies it is usually an error code, so it is listed separately.
 */
const SECRET_FIELDS = new Set([
  'access_token',
  'refresh_token',
  'id_token',
  'pre_authorized_code',
  'tx_code',
  // PKCE verifier: with the authorization code it redeems the code (Mimoto's download body uses codeVerifier).
  'code_verifier',
  'codeverifier',
  'user_pin',
  'client_secret',
  'client_assertion',
  'password',
  'secret',
  'api_key',
  'private_key',
  'privatekeyjwk',
  'privatekeymultibase',
  'privatekeybase58',
  'privatekeypem',
]);
const FORM_ONLY_SECRET_FIELDS = new Set(['code']);

/** Members of a JWK that hold private key material (RFC 7518 sections 6.2.2, 6.3.2 and 6.4). */
const JWK_PRIVATE_MEMBERS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);

/** Headers whose whole value is a credential. `authorization` keeps its scheme (`Bearer`, `DPoP`). */
const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'dpop',
  'x-api-key',
  'api-key',
  // CSRF tokens echo a session cookie (Mimoto's XSRF-TOKEN).
  'x-xsrf-token',
  'x-csrf-token',
]);

/** Secret `name=value` pairs inside text that is neither JSON nor a URL. */
const TEXT_PAIR =
  /\b(access_token|refresh_token|id_token|pre-authorized_code|pre_authorized_code|tx_code|client_secret|code_verifier|code)=([^&\s"'<>]+)/gi;
/** Bearer and DPoP tokens inside text, for example in an error message that echoes a header. */
const TEXT_TOKEN = /\b(Bearer|DPoP)\s+([A-Za-z0-9\-._~+/]+=*)/g;

/** Counts how many values one redaction pass replaced. */
export class Redactor {
  count = 0;

  /** The placeholder for a secret value. */
  mask(value: string): string {
    if (isMask(value)) return value;
    this.count += 1;
    const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);
    return `[redacted sha256:${digest}]`;
  }

  /** Returns a redacted copy of a JSON value: objects, arrays and strings that embed secrets. */
  json(value: unknown): unknown {
    if (typeof value === 'string') return this.text(value);
    if (Array.isArray(value)) return value.map((item) => this.json(item));
    if (value === null || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const isJwk = typeof record.kty === 'string';
    // In JSON `code` is usually an error code, but next to an authorization_code grant type it is the
    // OAuth authorization code (Mimoto's credential download body: code, grantType, codeVerifier).
    const isCodeGrant = [record.grantType, record.grant_type].includes('authorization_code');
    const out: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(record)) {
      const secret =
        isSecretField(key, false) ||
        (isJwk && JWK_PRIVATE_MEMBERS.has(key)) ||
        (isCodeGrant && key === 'code');
      out[key] = secret && member !== null && member !== undefined ? this.maskAny(member) : this.json(member);
    }
    return out;
  }

  /**
   * Redacts free text: a whole JSON document, a URL or query string (each secret parameter, and JSON
   * carried in a parameter such as `credential_offer`), or `name=value` pairs and bearer tokens.
   */
  text(value: string): string {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      const parsed = tryJson(trimmed);
      if (parsed !== undefined) {
        // Re-serialise only when something was replaced, so untouched bodies keep their formatting.
        const before = this.count;
        const redacted = this.json(parsed);
        return this.count === before ? value : JSON.stringify(redacted);
      }
    }
    if (looksLikeUrl(trimmed)) return this.url(value);
    return value
      .replace(TEXT_PAIR, (_match, name: string, secret: string) => `${name}=${this.mask(secret)}`)
      .replace(TEXT_TOKEN, (_match, scheme: string, secret: string) => `${scheme} ${this.mask(secret)}`);
  }

  /** Redacts the query (and a fragment that holds a query, as in implicit responses) of a URL. */
  url(value: string): string {
    const queryStart = value.indexOf('?');
    const hashStart = value.indexOf('#');
    if (queryStart < 0 && hashStart < 0) return value;
    const end = hashStart >= 0 ? hashStart : value.length;
    const base = value.slice(0, queryStart >= 0 ? queryStart : end);
    const query = queryStart >= 0 && queryStart < end ? value.slice(queryStart + 1, end) : undefined;
    const fragment = hashStart >= 0 ? value.slice(hashStart + 1) : undefined;
    let out = base;
    if (query !== undefined) out += `?${this.form(query)}`;
    if (fragment !== undefined) out += `#${fragment.includes('=') ? this.form(fragment) : fragment}`;
    return out;
  }

  /** Redacts an `application/x-www-form-urlencoded` string, keeping parameter order and names. */
  form(value: string): string {
    if (value === '') return value;
    return value
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=');
        if (eq < 0) return pair;
        const name = pair.slice(0, eq);
        const raw = pair.slice(eq + 1);
        const decodedName = safeDecode(name);
        const decoded = safeDecode(raw.replace(/\+/g, ' '));
        if (isSecretField(decodedName, true)) return `${name}=${encodeURIComponent(this.mask(decoded))}`;
        const redacted = this.text(decoded);
        return redacted === decoded ? pair : `${name}=${encodeURIComponent(redacted)}`;
      })
      .join('&');
  }

  headers(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (!SECRET_HEADERS.has(lower)) {
        out[name] = lower === 'location' || lower === 'content-location' ? this.text(value) : value;
        continue;
      }
      const scheme = /^(Bearer|DPoP|Basic)\s+(.+)$/i.exec(value);
      out[name] = scheme ? `${scheme[1]} ${this.mask(scheme[2] as string)}` : this.mask(value);
    }
    return out;
  }

  /** Redacts a request or response body according to its content type; base64 bodies are left alone. */
  body(
    message: Pick<RecordedRequest | RecordedResponse, 'headers' | 'body' | 'bodyEncoding'>,
  ): string | undefined {
    const { body } = message;
    if (body === undefined || message.bodyEncoding === 'base64') return body;
    const contentType = (message.headers['content-type'] ?? '').toLowerCase();
    if (contentType.includes('application/x-www-form-urlencoded')) return this.form(body);
    return this.text(body);
  }

  exchange(exchange: RecordedExchange): RecordedExchange {
    const request: RecordedRequest = {
      ...exchange.request,
      url: this.url(exchange.request.url),
      headers: this.headers(exchange.request.headers),
    };
    const requestBody = this.body(exchange.request);
    if (requestBody !== undefined) request.body = requestBody;
    let response: RecordedResponse | undefined;
    if (exchange.response) {
      response = { ...exchange.response, headers: this.headers(exchange.response.headers) };
      const responseBody = this.body(exchange.response);
      if (responseBody !== undefined) response.body = responseBody;
    }
    return { ...exchange, request, ...(response ? { response } : {}), redacted: true };
  }

  event(event: RunEvent): RunEvent {
    switch (event.type) {
      case 'exchange':
        return { ...event, exchange: this.exchange(event.exchange) };
      case 'artifact':
        // Offers carry pre-authorized codes; credentials, presentations and results are the evidence.
        return event.kind === 'offer' ? { ...event, raw: this.text(event.raw) } : event;
      case 'person.action-needed':
        return { ...event, action: this.json(event.action) as typeof event.action };
      case 'step.finished':
        // Error messages sometimes echo what a server answered, header values included.
        return event.error
          ? { ...event, error: { ...event.error, message: this.text(event.error.message) } }
          : event;
      case 'run.finished': {
        const { error } = event.report;
        return error
          ? { ...event, report: { ...event.report, error: { ...error, message: this.text(error.message) } } }
          : event;
      }
      case 'run.started':
      case 'step.started':
        return event;
    }
  }

  /** Masks a secret member: strings become the placeholder, other values are masked as their JSON. */
  maskAny(value: unknown): string {
    return this.mask(typeof value === 'string' ? value : JSON.stringify(value));
  }
}

function isSecretField(name: string, inForm: boolean): boolean {
  const normalised = name.toLowerCase().replace(/-/g, '_');
  return SECRET_FIELDS.has(normalised) || (inForm && FORM_ONLY_SECRET_FIELDS.has(normalised));
}

function isMask(value: string): boolean {
  return /^\[redacted sha256:[0-9a-f]{8}\]$/.test(value);
}

/** Absolute URLs with a scheme (`https:`, `openid-credential-offer:`, `openid4vp:`) and relative paths. */
function looksLikeUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:\?/i.test(value) || /^\/[^/]/.test(value)
  );
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Redacts one exchange; convenience for callers that do not need the count. */
export function redactExchange(exchange: RecordedExchange): RecordedExchange {
  return new Redactor().exchange(exchange);
}
