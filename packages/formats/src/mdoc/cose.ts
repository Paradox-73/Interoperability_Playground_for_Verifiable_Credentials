// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The COSE subset ISO/IEC 18013-5 needs: COSE_Sign1 with ES256 (RFC 9052 section 4.2, RFC 9053
 * section 2.1), an X.509 chain in header label 33 (`x5chain`, RFC 9360 section 2), and EC2 P-256
 * COSE_Key (RFC 9053 section 7.1) converted to and from JWK.
 *
 * Signatures are the 64-byte r||s form, which is what `signBytes` / `verifyBytes` produce for P-256.
 */
import { FormatError } from '../errors.js';
import { signBytes, toPublicJwk, verifyBytes, type KeyPair, type PublicJwk } from '../keys/keys.js';
import { CborTag, asArray, asBytes, asMap, decodeCbor, encodeCbor } from './cbor.js';

/** COSE header labels (RFC 9052 section 3.1, RFC 9360 section 2). */
export const COSE_HEADER = { alg: 1, kid: 4, x5chain: 33 } as const;
/** COSE algorithm identifier of ES256 (RFC 9053 section 2.1). */
export const COSE_ALG_ES256 = -7;
/** Tag 18: COSE_Sign1 (RFC 9052 section 2). ISO 18013-5 sends it untagged; a tagged one is accepted. */
export const COSE_SIGN1_TAG = 18;

/** A COSE_Sign1 as four parts; `protectedBytes` and `payload` are the bytes as received. */
export interface CoseSign1 {
  protectedBytes: Uint8Array;
  protectedHeader: Map<unknown, unknown>;
  unprotectedHeader: Map<unknown, unknown>;
  /** `undefined` for a detached payload (`nil`), as in DeviceSignature. */
  payload: Uint8Array | undefined;
  signature: Uint8Array;
}

/** Sig_structure for COSE_Sign1 (RFC 9052 section 4.4), with an empty external_aad. */
function sigStructure(protectedBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeCbor(['Signature1', protectedBytes, new Uint8Array(0), payload]);
}

export interface SignCoseSign1Input {
  keyPair: KeyPair;
  payload: Uint8Array;
  /** Leave the payload out of the structure (`nil`), as DeviceSignature does (ISO 18013-5 section 9.1.3.6). */
  detached?: boolean;
  /** Unprotected header members, for example `x5chain`. */
  unprotected?: Map<number, unknown>;
}

/** Signs a COSE_Sign1 with ES256 and returns it as the CBOR array (untagged). */
export function signCoseSign1(input: SignCoseSign1Input): unknown[] {
  if (input.keyPair.alg !== 'ES256') {
    throw new FormatError('MDOC_ALG_REJECTED', `mdoc signatures use ES256, not ${input.keyPair.alg}`, {
      spec: 'ISO/IEC 18013-5 section 9.1.3.6 (ES256 for P-256 keys)',
    });
  }
  const protectedBytes = encodeCbor(new Map([[COSE_HEADER.alg, COSE_ALG_ES256]]));
  const signature = signBytes(input.keyPair.privateJwk, sigStructure(protectedBytes, input.payload));
  return [protectedBytes, input.unprotected ?? new Map(), input.detached ? null : input.payload, signature];
}

/** Reads the four parts of a COSE_Sign1 (tagged or not). */
export function parseCoseSign1(value: unknown, what: string): CoseSign1 {
  const array = asArray(value instanceof CborTag && value.tag === COSE_SIGN1_TAG ? value.value : value, what);
  if (array.length !== 4) {
    throw new FormatError('MDOC_MALFORMED', `${what} must be a COSE_Sign1 array of 4 items`, {
      spec: 'RFC 9052 section 4.2',
    });
  }
  const protectedBytes = asBytes(array[0], `${what} protected header`);
  const protectedHeader =
    protectedBytes.length === 0
      ? new Map<unknown, unknown>()
      : asMap(decodeCbor(protectedBytes, `${what} protected header`), `${what} protected header`);
  return {
    protectedBytes,
    protectedHeader,
    unprotectedHeader: asMap(array[1], `${what} unprotected header`),
    payload: array[2] === null || array[2] === undefined ? undefined : asBytes(array[2], `${what} payload`),
    signature: asBytes(array[3], `${what} signature`),
  };
}

/** The `alg` of a COSE_Sign1 (protected header first, as RFC 9052 section 3.1 requires for alg). */
export function coseAlgorithm(sign1: CoseSign1): unknown {
  return sign1.protectedHeader.get(COSE_HEADER.alg) ?? sign1.unprotectedHeader.get(COSE_HEADER.alg);
}

/**
 * Verifies an ES256 COSE_Sign1. `detachedPayload` is used when the structure carries `nil`. Returns
 * false for a wrong signature; an algorithm other than ES256 is `MDOC_ALG_REJECTED`.
 */
export function verifyCoseSign1(
  sign1: CoseSign1,
  publicJwk: PublicJwk,
  detachedPayload?: Uint8Array,
): boolean {
  const alg = coseAlgorithm(sign1);
  if (alg !== COSE_ALG_ES256) {
    throw new FormatError('MDOC_ALG_REJECTED', `COSE alg ${String(alg)} is not accepted (ES256 = -7 only)`, {
      spec: 'ISO/IEC 18013-5 section 9.1.3.6; RFC 9053 section 2.1',
      details: { alg },
    });
  }
  if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256') return false;
  const payload = sign1.payload ?? detachedPayload;
  if (payload === undefined) {
    throw new FormatError('MDOC_MALFORMED', 'COSE_Sign1 has a detached payload but none was supplied', {
      spec: 'RFC 9052 section 4.1',
    });
  }
  return verifyBytes(publicJwk, sigStructure(sign1.protectedBytes, payload), sign1.signature);
}

/** The `x5chain` header (label 33) as base64 DER strings, leaf first; one certificate may be a single bstr. */
export function x5chainOf(sign1: CoseSign1): string[] | undefined {
  const value =
    sign1.unprotectedHeader.get(COSE_HEADER.x5chain) ?? sign1.protectedHeader.get(COSE_HEADER.x5chain);
  if (value === undefined) return undefined;
  const list = value instanceof Uint8Array ? [value] : asArray(value, 'x5chain');
  return list.map((entry) => Buffer.from(asBytes(entry, 'x5chain entry')).toString('base64'));
}

/** `x5chain` header value from base64 DER certificates: one bstr for one certificate, else an array. */
export function x5chainHeader(certificates: readonly string[]): Uint8Array | Uint8Array[] {
  const bytes = certificates.map((certificate) => new Uint8Array(Buffer.from(certificate, 'base64')));
  return bytes.length === 1 ? bytes[0]! : bytes;
}

/** COSE_Key labels (RFC 9052 section 7.1, RFC 9053 section 7.1). */
const COSE_KEY = { kty: 1, crv: -1, x: -2, y: -3 } as const;
const COSE_KTY_EC2 = 2;
const COSE_CRV_P256 = 1;

/** EC2 P-256 COSE_Key of a public JWK (the mdoc's DeviceKey, ISO 18013-5 section 9.1.2.4). */
export function jwkToCoseKey(jwk: PublicJwk): Map<number, unknown> {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.y === undefined) {
    throw new FormatError('KEY_UNSUPPORTED', 'an mdoc device key must be a P-256 key', {
      spec: 'ISO/IEC 18013-5 section 9.1.5.2 (DeviceKey curves)',
    });
  }
  return new Map<number, unknown>([
    [COSE_KEY.kty, COSE_KTY_EC2],
    [COSE_KEY.crv, COSE_CRV_P256],
    [COSE_KEY.x, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
    [COSE_KEY.y, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
  ]);
}

/** Public JWK of an EC2 P-256 COSE_Key. */
export function coseKeyToJwk(value: unknown): PublicJwk {
  const key = asMap(value, 'COSE_Key');
  if (key.get(COSE_KEY.kty) !== COSE_KTY_EC2 || key.get(COSE_KEY.crv) !== COSE_CRV_P256) {
    throw new FormatError('KEY_UNSUPPORTED', 'only EC2 P-256 COSE keys are supported', {
      spec: 'RFC 9053 section 7.1',
      details: { kty: key.get(COSE_KEY.kty), crv: key.get(COSE_KEY.crv) },
    });
  }
  const coordinate = (label: number, name: string): string =>
    Buffer.from(asBytes(key.get(label), `COSE_Key ${name}`)).toString('base64url');
  return toPublicJwk({
    kty: 'EC',
    crv: 'P-256',
    x: coordinate(COSE_KEY.x, 'x'),
    y: coordinate(COSE_KEY.y, 'y'),
  });
}
