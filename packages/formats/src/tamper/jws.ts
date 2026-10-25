// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Tamper primitives for compact JWS (RFC 7515 section 7.1): corrupt a signature, or sign changed
 * content again with another key. Used by the replay-and-tamper scenarios to build inputs a correct
 * verifier must reject; nothing here is used on the happy path.
 *
 * Misuse (input that is not the shape a primitive works on) throws a `TypeError`: it is a bug in the
 * scenario, not a finding about the role under test.
 */
import { decodeCompactJws, signCompactJws, type JwtPayload } from '../keys/jws.js';
import type { KeyPair } from '../keys/keys.js';
import { base64UrlDecode, base64UrlEncode } from '../util/encoding.js';

/**
 * Returns a copy of `bytes` with every bit of one byte inverted (default: the middle byte).
 *
 * The flip is done on the decoded bytes, not on the text: changing the last base64url character
 * can alter only padding bits, which some decoders ignore, so a character flip does not always
 * change the signature.
 */
export function flipByte(bytes: Uint8Array, index = Math.floor(bytes.length / 2)): Uint8Array {
  if (bytes.length === 0) throw new TypeError('cannot flip a byte of an empty value');
  const position = ((index % bytes.length) + bytes.length) % bytes.length;
  const copy = new Uint8Array(bytes);
  copy[position] = copy[position]! ^ 0xff;
  return copy;
}

/** A compact JWS whose signature has one byte flipped; header and payload are unchanged. */
export function flipJwsSignature(compact: string, index?: number): string {
  const parts = compact.split('.');
  if (parts.length !== 3) {
    throw new TypeError(`a compact JWS has 3 parts, got ${parts.length}`);
  }
  const [header, payload, signature] = parts as [string, string, string];
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(signature);
  } catch (cause) {
    throw new TypeError('JWS signature is not base64url', { cause });
  }
  return `${header}.${payload}.${base64UrlEncode(flipByte(bytes, index))}`;
}

export interface ResignJwsChanges {
  /** Header members to set; `undefined` values remove the member. `alg` always follows the key. */
  header?: Record<string, unknown>;
  /** Payload members to set; `undefined` values remove the member. */
  payload?: Record<string, unknown>;
}

/**
 * Decodes a compact JWS, applies `changes` and signs the result with `keyPair`. With the original
 * signer's key this changes content while keeping a valid signature (for example a KB-JWT bound to
 * another nonce); with any other key it is a forgery.
 */
export function resignJws(compact: string, changes: ResignJwsChanges, keyPair: KeyPair): string {
  const decoded = decodeCompactJws(compact);
  return signCompactJws(
    applyChanges(decoded.header, changes.header),
    applyChanges(decoded.payload, changes.payload),
    keyPair,
  );
}

function applyChanges(base: JwtPayload, changes: Record<string, unknown> = {}): JwtPayload {
  const result: JwtPayload = { ...base };
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) delete result[name];
    else result[name] = value;
  }
  return result;
}
