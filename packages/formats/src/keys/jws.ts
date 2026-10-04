/**
 * Compact JWS (RFC 7515 section 7.1) signing and verification over the JWK key pairs of `keys.ts`.
 *
 * Written here instead of calling a JOSE library so that the playground controls every byte: the
 * tamper scenarios need to re-sign altered payloads, and the inspector shows exactly what was signed.
 */
import { FormatError, type FormatErrorCode } from '../errors.js';
import {
  base64UrlDecode,
  base64UrlDecodeToString,
  base64UrlEncode,
  isRecord,
  utf8Encode,
} from '../util/encoding.js';
import { algorithmMatchesKey, signBytes, verifyBytes, type KeyPair, type PublicJwk } from './keys.js';

export type JoseHeader = Record<string, unknown> & { alg?: string; typ?: string; kid?: string };
export type JwtPayload = Record<string, unknown>;

export interface DecodedJws {
  header: JoseHeader;
  payload: JwtPayload;
  /** `base64url(header) "." base64url(payload)`, the bytes the signature covers. */
  signingInput: string;
  signature: Uint8Array;
}

/** Signs a JSON payload; `alg` in the header is always set from the key. */
export function signCompactJws(header: JoseHeader, payload: JwtPayload, keyPair: KeyPair): string {
  const fullHeader = { ...header, alg: keyPair.alg };
  const signingInput = `${base64UrlEncode(JSON.stringify(fullHeader))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = signBytes(keyPair.privateJwk, utf8Encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Splits and parses a compact JWS without checking the signature. `code` lets callers report the
 * failure in their own terms (an SD-JWT and a KB-JWT have different error codes).
 */
export function decodeCompactJws(compact: string, code: FormatErrorCode = 'SDJWT_MALFORMED'): DecodedJws {
  const parts = compact.split('.');
  if (parts.length !== 3) throw new FormatError(code, `a compact JWS has 3 parts, got ${parts.length}`);
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  let header: unknown;
  let payload: unknown;
  let signature: Uint8Array;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerPart));
    payload = JSON.parse(base64UrlDecodeToString(payloadPart));
    signature = base64UrlDecode(signaturePart);
  } catch (cause) {
    throw new FormatError(code, 'JWS header, payload or signature is not base64url-encoded JSON', { cause });
  }
  if (!isRecord(header) || !isRecord(payload)) {
    throw new FormatError(code, 'JWS header and payload must be JSON objects');
  }
  return { header, payload, signingInput: `${headerPart}.${payloadPart}`, signature };
}

/**
 * Checks the signature of a decoded JWS with a public key. The header `alg` must fit the key type:
 * accepting any `alg` would let an attacker pick a weaker algorithm (RFC 8725 section 3.1).
 */
export function verifyDecodedJws(decoded: DecodedJws, publicJwk: PublicJwk): boolean {
  if (!algorithmMatchesKey(decoded.header.alg, publicJwk)) return false;
  return verifyBytes(publicJwk, utf8Encode(decoded.signingInput), decoded.signature);
}
