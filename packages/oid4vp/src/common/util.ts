import { randomBytes } from 'node:crypto';
import { base64UrlEncode, isRecord } from '@inji-playground/formats';
import { Oid4vpError } from './errors.js';

/** `fetch` as a role receives it: the recording client of a run, or the global one. */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** 128 random bits, base64url: enough for `state` and `nonce` (OpenID4VP 1.0 section 14.1). */
export function randomToken(bytes = 16): string {
  return base64UrlEncode(randomBytes(bytes));
}

export function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

type ParameterErrorCode = 'REQUEST_INVALID' | 'RESPONSE_INVALID' | 'SUBMISSION_INVALID';

/** Parses JSON or throws an `Oid4vpError` that names the parameter. */
export function parseJsonParameter(name: string, text: string, code: ParameterErrorCode): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Oid4vpError(code, `${name} is not valid JSON`, {
      cause,
      details: { [name]: text.slice(0, 200) },
    });
  }
}

/** A parameter that is a JSON object, or a JSON-encoded string of one (as in a URI or a form). */
export function objectParameter(
  name: string,
  value: unknown,
  code: ParameterErrorCode,
): Record<string, unknown> {
  const parsed = typeof value === 'string' ? parseJsonParameter(name, value, code) : value;
  if (!isRecord(parsed)) throw new Oid4vpError(code, `${name} must be a JSON object`);
  return parsed;
}

export function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
