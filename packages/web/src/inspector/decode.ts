// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Decoders for the payloads that cross the wire in OpenID4VCI and OpenID4VP: compact JWTs, SD-JWTs
 * (issuer JWT, disclosures, key-binding JWT), JSON and form bodies.
 *
 * They only decode. No signature is verified here: the inspector shows what was sent, and the verdict on
 * whether it is valid comes from the verifier role that took part in the run.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decodes base64url (RFC 4648 section 5, padding optional) to bytes; undefined when it is not base64url. */
export function base64UrlToBytes(input: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(input)) return undefined;
  const base64 = input.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (base64.length % 4 === 1) return undefined;
  try {
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

/** Decodes base64url to UTF-8 text; undefined when the input is not base64url or not valid UTF-8. */
export function base64UrlToText(input: string): string | undefined {
  const bytes = base64UrlToBytes(input);
  if (!bytes) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Parses JSON text; undefined instead of an exception for anything that is not JSON. */
export function tryParseJson(text: string): JsonValue | undefined {
  const trimmed = text.trim();
  if (!trimmed || !'{["'.includes(trimmed[0]!)) return undefined;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return undefined;
  }
}

export interface DecodedJwt {
  header: JsonObject;
  payload: JsonValue;
  /** The signature part as sent (base64url); empty for an unsecured JWT. */
  signature: string;
  /** `header.payload`, the bytes the signature covers. */
  signingInput: string;
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/;

/**
 * Splits and decodes a compact JWS (RFC 7515 section 7.1). Returns undefined for anything else, including
 * placeholders such as `SYNTHETIC.PROOF.JWT` whose parts are not base64url JSON.
 */
export function decodeJwt(compact: string): DecodedJwt | undefined {
  const text = compact.trim();
  if (!JWT_SHAPE.test(text)) return undefined;
  const [headerPart, payloadPart, signature] = text.split('.') as [string, string, string];
  const headerText = base64UrlToText(headerPart);
  const header = headerText === undefined ? undefined : tryParseJson(headerText);
  if (!isJsonObject(header) || typeof header.alg !== 'string') return undefined;
  const payloadText = base64UrlToText(payloadPart);
  if (payloadText === undefined) return undefined;
  // A JWS payload need not be JSON; keep the text when it is not.
  const payload = tryParseJson(payloadText) ?? payloadText;
  return { header, payload, signature, signingInput: `${headerPart}.${payloadPart}` };
}

/** One disclosure of an SD-JWT (RFC 9901 section 4.2): `[salt, name, value]`, or `[salt, value]` in an array. */
export interface Disclosure {
  /** The disclosure exactly as sent (base64url). */
  encoded: string;
  salt: string;
  /** Claim name; absent for an array element disclosure. */
  name?: string;
  value: JsonValue;
}

export interface DecodedSdJwt {
  /** The issuer-signed JWT, raw and decoded. */
  issuerJwt: { raw: string; decoded: DecodedJwt };
  disclosures: Disclosure[];
  /** Disclosures that could not be decoded, kept so nothing sent is hidden. */
  invalidDisclosures: string[];
  /** Key-binding JWT of a presentation (RFC 9901 section 4.3), when present. */
  keyBinding?: { raw: string; decoded: DecodedJwt };
  /** `iss~d1~d2~` is a credential as issued; with a KB-JWT or as sent to a verifier it is a presentation. */
  hasKeyBinding: boolean;
}

export function decodeDisclosure(encoded: string): Disclosure | undefined {
  const text = base64UrlToText(encoded);
  const array = text === undefined ? undefined : tryParseJson(text);
  if (!Array.isArray(array) || typeof array[0] !== 'string') return undefined;
  if (array.length === 3 && typeof array[1] === 'string') {
    return { encoded, salt: array[0], name: array[1], value: array[2]! };
  }
  if (array.length === 2) return { encoded, salt: array[0], value: array[1]! };
  return undefined;
}

/**
 * Decodes an SD-JWT in the compact `~` serialization: `<issuer JWT>~<disclosure>~...~[<KB-JWT>]`.
 * Returns undefined when the text has no `~` or its first part is not a JWT.
 */
export function decodeSdJwt(serialized: string): DecodedSdJwt | undefined {
  const text = serialized.trim();
  if (!text.includes('~')) return undefined;
  const parts = text.split('~');
  const issuerRaw = parts[0]!;
  const issuerDecoded = decodeJwt(issuerRaw);
  if (!issuerDecoded) return undefined;
  const last = parts[parts.length - 1]!;
  const middle = parts.slice(1, -1);
  const keyBindingDecoded = last ? decodeJwt(last) : undefined;
  const disclosures: Disclosure[] = [];
  const invalidDisclosures: string[] = [];
  // When the final part is not a JWT it is a disclosure of a serialization missing its trailing `~`.
  for (const part of keyBindingDecoded || !last ? middle : [...middle, last]) {
    if (!part) continue;
    const disclosure = decodeDisclosure(part);
    if (disclosure) disclosures.push(disclosure);
    else invalidDisclosures.push(part);
  }
  return {
    issuerJwt: { raw: issuerRaw, decoded: issuerDecoded },
    disclosures,
    invalidDisclosures,
    ...(keyBindingDecoded ? { keyBinding: { raw: last, decoded: keyBindingDecoded } } : {}),
    hasKeyBinding: keyBindingDecoded !== undefined,
  };
}

/**
 * Digest of a disclosure as the issuer puts it in `_sd` (RFC 9901 section 4.2.3): base64url of the hash of
 * the ASCII bytes of the encoded disclosure. Only SHA-256 and the other SHA-2 sizes are supported, which
 * covers every `_sd_alg` the Inji modules and the reference roles use.
 */
export async function disclosureDigest(encoded: string, sdAlg = 'sha-256'): Promise<string | undefined> {
  const algorithm = { 'sha-256': 'SHA-256', 'sha-384': 'SHA-384', 'sha-512': 'SHA-512' }[sdAlg.toLowerCase()];
  if (!algorithm || !globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest(algorithm, new TextEncoder().encode(encoded));
  return bytesToBase64Url(new Uint8Array(digest));
}

/** Every digest listed in `_sd` arrays and `{ "...": digest }` array entries anywhere in a payload. */
export function collectSdDigests(payload: JsonValue): Set<string> {
  const digests = new Set<string>();
  const walk = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isJsonObject(item) && typeof item['...'] === 'string' && Object.keys(item).length === 1) {
          digests.add(item['...']);
        } else walk(item);
      }
    } else if (isJsonObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === '_sd' && Array.isArray(child)) {
          for (const digest of child) if (typeof digest === 'string') digests.add(digest);
        } else walk(child);
      }
    }
  };
  walk(payload);
  return digests;
}

/** Parses an `application/x-www-form-urlencoded` body into ordered name/value pairs. */
export function parseForm(body: string): Array<[string, string]> | undefined {
  const text = body.trim();
  if (!text || /\s/.test(text) || !text.includes('=')) return undefined;
  try {
    return [...new URLSearchParams(text).entries()];
  } catch {
    return undefined;
  }
}

/** Pretty JSON for display and download. */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Reads `seconds since the epoch` claims (`iat`, `nbf`, `exp`) as ISO dates for the decoded views. */
export function epochToIso(value: JsonValue | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
