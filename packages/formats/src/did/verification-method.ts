/**
 * Conversions between JWKs and the public-key encodings found in DID documents:
 * `publicKeyJwk` (JsonWebKey2020), `publicKeyMultibase` (Ed25519VerificationKey2020 and Multikey,
 * https://www.w3.org/TR/cid-1.0/#Multikey) and `publicKeyBase58` (Ed25519VerificationKey2018).
 */
import { ECDH } from 'node:crypto';
import { FormatError } from '../errors.js';
import { toPublicJwk, type PublicJwk } from '../keys/keys.js';
import {
  base58btcDecode,
  base58btcEncode,
  base64UrlDecode,
  base64UrlEncode,
  concatBytes,
} from '../util/encoding.js';
import {
  ED25519_2020_CONTEXT_V1,
  JWS_2020_CONTEXT_V1,
  MULTIKEY_CONTEXT_V1,
  type VerificationMethod,
  type VerificationMethodType,
} from './types.js';

/** Multicodec prefixes as unsigned varints: ed25519-pub (0xed) and p256-pub (0x1200). */
const ED25519_PUB = new Uint8Array([0xed, 0x01]);
const P256_PUB = new Uint8Array([0x80, 0x24]);

/** Multibase base58btc (`z...`) of a public key with its multicodec prefix, as did:key uses it. */
export function jwkToMultibase(jwk: PublicJwk): string {
  if (jwk.kty === 'OKP') return `z${base58btcEncode(concatBytes(ED25519_PUB, base64UrlDecode(jwk.x)))}`;
  // P-256 keys are multicodec-encoded as 33-byte compressed points (SEC 1 section 2.3.3).
  const y = base64UrlDecode(jwk.y ?? '');
  const prefix = new Uint8Array([(y[y.length - 1]! & 1) === 1 ? 0x03 : 0x02]);
  return `z${base58btcEncode(concatBytes(P256_PUB, prefix, base64UrlDecode(jwk.x)))}`;
}

export function multibaseToJwk(multibase: string): PublicJwk {
  if (!multibase.startsWith('z')) {
    throw new FormatError('KEY_UNSUPPORTED', 'only base58btc multibase values (prefix "z") are supported');
  }
  let bytes: Uint8Array;
  try {
    bytes = base58btcDecode(multibase.slice(1));
  } catch (cause) {
    throw new FormatError('KEY_INVALID', 'multibase value is not base58btc', { cause });
  }
  const prefix = bytes.subarray(0, 2);
  const key = bytes.subarray(2);
  if (prefix[0] === ED25519_PUB[0] && prefix[1] === ED25519_PUB[1]) {
    if (key.length !== 32)
      throw new FormatError('KEY_INVALID', `Ed25519 key must be 32 bytes, got ${key.length}`);
    return { kty: 'OKP', crv: 'Ed25519', x: base64UrlEncode(key) };
  }
  if (prefix[0] === P256_PUB[0] && prefix[1] === P256_PUB[1]) {
    if (key.length !== 33) {
      throw new FormatError('KEY_INVALID', `compressed P-256 key must be 33 bytes, got ${key.length}`);
    }
    let point: Buffer;
    try {
      point = ECDH.convertKey(key, 'prime256v1', undefined, undefined, 'uncompressed') as Buffer;
    } catch (cause) {
      throw new FormatError('KEY_INVALID', 'P-256 point is not on the curve', { cause });
    }
    return {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(point.subarray(1, 33)),
      y: base64UrlEncode(point.subarray(33, 65)),
    };
  }
  throw new FormatError(
    'KEY_UNSUPPORTED',
    `unsupported multicodec key type 0x${Buffer.from(prefix).toString('hex')}; only Ed25519 and P-256 are supported`,
  );
}

/** JSON-LD context that defines a verification method type, for documents that embed it. */
export function contextForVerificationMethodType(type: string): string | undefined {
  switch (type) {
    case 'Ed25519VerificationKey2020':
      return ED25519_2020_CONTEXT_V1;
    case 'Multikey':
      return MULTIKEY_CONTEXT_V1;
    case 'JsonWebKey2020':
      return JWS_2020_CONTEXT_V1;
    default:
      return undefined;
  }
}

/**
 * Writes a verification method for a key. Ed25519VerificationKey2020 is only defined for Ed25519; it
 * is the type Inji Certify publishes and the one the Ed25519Signature2020 suite names.
 */
export function buildVerificationMethod(
  id: string,
  controller: string,
  jwk: PublicJwk,
  type: VerificationMethodType,
): VerificationMethod {
  const publicJwk = toPublicJwk(jwk);
  switch (type) {
    case 'JsonWebKey2020': {
      const { kid: _kid, ...keyOnly } = publicJwk;
      return { id, type, controller, publicKeyJwk: { ...keyOnly } };
    }
    case 'Multikey':
      return { id, type, controller, publicKeyMultibase: jwkToMultibase(publicJwk) };
    case 'Ed25519VerificationKey2020':
    case 'Ed25519VerificationKey2018':
      if (publicJwk.kty !== 'OKP') {
        throw new FormatError('KEY_UNSUPPORTED', `${type} can only hold an Ed25519 key`);
      }
      return type === 'Ed25519VerificationKey2020'
        ? { id, type, controller, publicKeyMultibase: jwkToMultibase(publicJwk) }
        : { id, type, controller, publicKeyBase58: base58btcEncode(base64UrlDecode(publicJwk.x)) };
  }
}

/** Reads the public key of a verification method as a JWK, whichever encoding the document uses. */
export function verificationMethodToJwk(method: VerificationMethod): PublicJwk {
  if (method.publicKeyJwk !== undefined) return toPublicJwk(method.publicKeyJwk);
  if (typeof method.publicKeyMultibase === 'string') return multibaseToJwk(method.publicKeyMultibase);
  if (typeof method.publicKeyBase58 === 'string' && method.type === 'Ed25519VerificationKey2018') {
    const raw = base58btcDecode(method.publicKeyBase58);
    if (raw.length !== 32)
      throw new FormatError('KEY_INVALID', 'Ed25519VerificationKey2018 key must be 32 bytes');
    return { kty: 'OKP', crv: 'Ed25519', x: base64UrlEncode(raw) };
  }
  throw new FormatError(
    'KEY_UNSUPPORTED',
    `verification method ${method.id} (${method.type}) has no supported key encoding`,
  );
}
