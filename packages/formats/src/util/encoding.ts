// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Byte encodings used by JOSE (base64url, RFC 4648 section 5) and by did:key / Data Integrity
 * (multibase base58btc, the `z` prefix).
 */
import { createHash } from 'node:crypto';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export function utf8Encode(text: string): Uint8Array {
  return textEncoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? utf8Encode(data) : data;
  return Buffer.from(bytes).toString('base64url');
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/**
 * Decodes base64url. Node's decoder silently skips characters outside the alphabet, so the input is
 * checked first: a credential with a stray character must fail, not decode to something else.
 * Trailing `=` padding is accepted only when `allowPadding` is set.
 */
export function base64UrlDecode(text: string, { allowPadding = false } = {}): Uint8Array {
  const body = allowPadding ? text.replace(/={1,2}$/, '') : text;
  if (!BASE64URL_PATTERN.test(body) || body.length % 4 === 1) {
    throw new TypeError('not a base64url string');
  }
  return new Uint8Array(Buffer.from(body, 'base64url'));
}

export function base64UrlDecodeToString(text: string, options?: { allowPadding?: boolean }): string {
  return utf8Decode(base64UrlDecode(text, options));
}

export function sha256(data: Uint8Array | string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((char, index) => [char, BigInt(index)]));

/** Bitcoin base58 alphabet (multibase `z`), as used by did:key and Ed25519Signature2020 proofs. */
export function base58btcEncode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = '';
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)]! + out;
    value /= 58n;
  }
  // Each leading zero byte is written as a leading '1'.
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out;
}

export function base58btcDecode(text: string): Uint8Array {
  let value = 0n;
  for (const char of text) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) throw new TypeError(`not a base58btc string (character "${char}")`);
    value = value * 58n + digit;
  }
  const body: number[] = [];
  while (value > 0n) {
    body.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  let leadingZeros = 0;
  while (text[leadingZeros] === '1') leadingZeros += 1;
  return new Uint8Array([...new Array<number>(leadingZeros).fill(0), ...body]);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
