/**
 * Ed25519 and P-256 key pairs held as JWKs (RFC 7517), the one representation every other module of
 * this package accepts. JOSE signing (EdDSA, ES256) and Data Integrity signing (Ed25519) both start
 * from these JWKs, so a role keeps one key file per key whatever format it issues.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from 'node:crypto';
import { FormatError } from '../errors.js';
import { base64UrlDecode, base64UrlEncode, isRecord, sha256 } from '../util/encoding.js';

/**
 * JOSE algorithm names (RFC 7518 section 3.4 for ES256, RFC 8037 section 3.1 for EdDSA). Inji and
 * most wallets still send `EdDSA`; the fully specified `Ed25519` (RFC 9864) is accepted on input.
 */
export type KeyAlgorithm = 'EdDSA' | 'ES256';
export const KEY_ALGORITHMS: readonly KeyAlgorithm[] = ['EdDSA', 'ES256'];

export interface PublicJwk {
  kty: 'OKP' | 'EC';
  crv: 'Ed25519' | 'P-256';
  x: string;
  /** Present for EC keys only. */
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

export interface PrivateJwk extends PublicJwk {
  d: string;
}

export interface KeyPair {
  alg: KeyAlgorithm;
  publicJwk: PublicJwk;
  privateJwk: PrivateJwk;
}

/** Creates a fresh key pair. Keys are never derived from fixed seeds, so no test key repeats. */
export function generateKeyPair(alg: KeyAlgorithm): KeyPair {
  const { privateKey } =
    alg === 'EdDSA' ? generateKeyPairSync('ed25519') : generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return keyPairFromPrivateJwk(privateKey.export({ format: 'jwk' }));
}

/** Rebuilds a key pair from a private JWK (for example one loaded from disk). */
export function keyPairFromPrivateJwk(jwk: unknown): KeyPair {
  const publicJwk = toPublicJwk(jwk);
  if (!isRecord(jwk) || typeof jwk.d !== 'string') {
    throw new FormatError('KEY_INVALID', 'private JWK has no "d" member');
  }
  const privateJwk: PrivateJwk = { ...publicJwk, d: jwk.d };
  // Importing proves that d belongs to x/y; a mismatched file must fail here, not at signing time.
  const derived = createPublicKey(privateKeyObject(privateJwk)).export({ format: 'jwk' });
  if (derived.x !== publicJwk.x || (publicJwk.y !== undefined && derived.y !== publicJwk.y)) {
    throw new FormatError('KEY_INVALID', 'private JWK "d" does not match its public part');
  }
  return { alg: algorithmForJwk(publicJwk), publicJwk, privateJwk };
}

/**
 * Validates a JWK and returns only its public members (`kty`, `crv`, `x`, `y`, plus `kid`/`alg`/`use`
 * when present). Anything else, including `d`, is dropped, so the result is safe to publish.
 */
export function toPublicJwk(jwk: unknown): PublicJwk {
  if (!isRecord(jwk)) throw new FormatError('KEY_INVALID', 'JWK is not a JSON object');
  const { kty, crv, x, y } = jwk;
  if (kty === 'OKP' && crv === 'Ed25519' && typeof x === 'string') {
    checkCoordinate(x, 32, 'x');
    return withOptionalMembers({ kty, crv, x }, jwk);
  }
  if (kty === 'EC' && crv === 'P-256' && typeof x === 'string' && typeof y === 'string') {
    checkCoordinate(x, 32, 'x');
    checkCoordinate(y, 32, 'y');
    return withOptionalMembers({ kty, crv, x, y }, jwk);
  }
  throw new FormatError(
    'KEY_UNSUPPORTED',
    `unsupported JWK (kty=${String(kty)}, crv=${String(crv)}); only Ed25519 (OKP) and P-256 (EC) are supported`,
  );
}

function checkCoordinate(value: string, length: number, name: string): void {
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(value);
  } catch {
    throw new FormatError('KEY_INVALID', `JWK "${name}" is not base64url`);
  }
  if (bytes.length !== length) {
    throw new FormatError('KEY_INVALID', `JWK "${name}" must be ${length} bytes, got ${bytes.length}`);
  }
}

function withOptionalMembers(base: PublicJwk, source: Record<string, unknown>): PublicJwk {
  const out: PublicJwk = { ...base };
  if (typeof source.kid === 'string') out.kid = source.kid;
  if (typeof source.alg === 'string') out.alg = source.alg;
  if (typeof source.use === 'string') out.use = source.use;
  return out;
}

export function algorithmForJwk(jwk: Pick<PublicJwk, 'kty' | 'crv'>): KeyAlgorithm {
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA';
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256';
  throw new FormatError('KEY_UNSUPPORTED', `no signature algorithm for kty=${jwk.kty} crv=${jwk.crv}`);
}

/** True when a JOSE `alg` header value may be verified with this key. */
export function algorithmMatchesKey(alg: unknown, jwk: Pick<PublicJwk, 'kty' | 'crv'>): boolean {
  const keyAlg = algorithmForJwk(jwk);
  return keyAlg === 'EdDSA' ? alg === 'EdDSA' || alg === 'Ed25519' : alg === keyAlg;
}

/**
 * JWK thumbprint (RFC 7638 section 3): SHA-256 over the required members in lexicographic order,
 * base64url encoded. Used as the default `kid` and in `cnf.jkt`.
 */
export function jwkThumbprint(jwk: PublicJwk): string {
  const members =
    jwk.kty === 'EC'
      ? `{"crv":"${jwk.crv}","kty":"EC","x":"${jwk.x}","y":"${jwk.y ?? ''}"}`
      : `{"crv":"${jwk.crv}","kty":"OKP","x":"${jwk.x}"}`;
  return base64UrlEncode(sha256(members));
}

function privateKeyObject(jwk: PrivateJwk): KeyObject {
  try {
    return createPrivateKey({
      key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d },
      format: 'jwk',
    });
  } catch (cause) {
    throw new FormatError('KEY_INVALID', 'private JWK cannot be imported', { cause });
  }
}

function publicKeyObject(jwk: PublicJwk): KeyObject {
  try {
    return createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
  } catch (cause) {
    throw new FormatError('KEY_INVALID', 'public JWK cannot be imported', { cause });
  }
}

/**
 * Raw signature over `data`: Ed25519 (RFC 8032) or ECDSA P-256 with SHA-256 in the 64-byte r||s form
 * that JWS requires (RFC 7518 section 3.4), not DER.
 */
export function signBytes(privateJwk: PrivateJwk, data: Uint8Array): Uint8Array {
  const key = privateKeyObject(privateJwk);
  const signature =
    privateJwk.kty === 'OKP'
      ? nodeSign(null, data, key)
      : nodeSign('sha256', data, { key, dsaEncoding: 'ieee-p1363' });
  return new Uint8Array(signature);
}

export function verifyBytes(publicJwk: PublicJwk, data: Uint8Array, signature: Uint8Array): boolean {
  const key = publicKeyObject(publicJwk);
  try {
    return publicJwk.kty === 'OKP'
      ? nodeVerify(null, data, key, signature)
      : nodeVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    // A signature of the wrong length makes node:crypto throw; for a verifier that is just "invalid".
    return false;
  }
}
