/**
 * Holder keys of the wallet client and the key proof JWT that binds a credential to them
 * (OpenID4VCI draft 13 section 7.2.1.1, 1.0 Appendix F.1).
 *
 * Default: ES256 with a did:jwk `kid`, the combination Inji Certify 0.14.0 accepted in the local trial
 * (an EdDSA proof may be refused by the sample configuration, gap G9).
 */
import {
  createDidJwk,
  createDidKey,
  didKeyVerificationMethodId,
  generateKeyPair,
  signCompactJws,
  type KeyAlgorithm,
  type KeyPair,
} from '@inji-playground/formats';
import { PROOF_JWT_TYP } from '../common/constants.js';
import { epochSeconds } from '../common/util.js';

export type HolderBindingMethod = 'did:jwk' | 'did:key' | 'jwk';

export interface HolderKey {
  keyPair: KeyPair;
  binding: HolderBindingMethod;
  /** DID of the holder (for `jwk` binding: the did:jwk of the key). */
  did: string;
  /** `kid` header value: a DID URL; absent for `jwk` binding. */
  kid?: string;
}

/**
 * The name to put in `alg` for an Ed25519 key: `Ed25519` when the issuer lists it and not `EdDSA`
 * (`proof_types_supported.jwt.proof_signing_alg_values_supported`), `EdDSA` otherwise.
 */
export function ed25519AlgNameFor(configuration: unknown): 'EdDSA' | 'Ed25519' {
  const algs = (
    configuration as { proof_types_supported?: { jwt?: { proof_signing_alg_values_supported?: unknown } } }
  )?.proof_types_supported?.jwt?.proof_signing_alg_values_supported;
  if (!Array.isArray(algs)) return 'EdDSA';
  return algs.includes('Ed25519') && !algs.includes('EdDSA') ? 'Ed25519' : 'EdDSA';
}

export function createHolderKey(
  alg: KeyAlgorithm = 'ES256',
  binding: HolderBindingMethod = 'did:jwk',
): HolderKey {
  return holderKeyFrom(generateKeyPair(alg), binding);
}

export function holderKeyFrom(keyPair: KeyPair, binding: HolderBindingMethod = 'did:jwk'): HolderKey {
  if (binding === 'did:key') {
    const did = createDidKey(keyPair.publicJwk);
    return { keyPair, binding, did, kid: didKeyVerificationMethodId(did) };
  }
  const did = createDidJwk(keyPair.publicJwk);
  return binding === 'jwk' ? { keyPair, binding, did } : { keyPair, binding, did, kid: `${did}#0` };
}

export interface ProofJwtInput {
  holderKey: HolderKey;
  /** The credential issuer identifier. */
  audience: string;
  nonce?: string;
  /** `client_id`; must be left out for anonymous pre-authorized access. */
  issuer?: string;
  nowMs: number;
  /**
   * JOSE algorithm name for an Ed25519 holder key: `EdDSA` (default) or `Ed25519` (RFC 9864), for
   * issuers that list only the fully specified name (Inji Certify 0.14.0, gap G9).
   */
  ed25519AlgName?: 'EdDSA' | 'Ed25519';
  /** Header and payload members to change after the defaults are set (tamper scenarios). */
  overrides?: { header?: Record<string, unknown>; payload?: Record<string, unknown> };
}

export function createProofJwt(input: ProofJwtInput): string {
  const { holderKey } = input;
  const header: Record<string, unknown> = {
    ...(input.ed25519AlgName === 'Ed25519' ? { alg: 'Ed25519' } : {}),
    typ: PROOF_JWT_TYP,
    ...(holderKey.kid === undefined ? { jwk: holderKey.keyPair.publicJwk } : { kid: holderKey.kid }),
    ...input.overrides?.header,
  };
  const payload: Record<string, unknown> = {
    aud: input.audience,
    iat: epochSeconds(input.nowMs),
    ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
    ...(input.issuer === undefined ? {} : { iss: input.issuer }),
    ...input.overrides?.payload,
  };
  return signCompactJws(header, payload, holderKey.keyPair);
}
