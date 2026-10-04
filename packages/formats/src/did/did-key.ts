/**
 * did:key (https://w3c-ccg.github.io/did-method-key/): the DID is the multibase-encoded public key, so
 * creating and resolving it needs no network.
 *
 * Resolvers disagree on the verification method type they produce for the same did:key (measured
 * 2026-10-04: `key-did-resolver` gives Ed25519VerificationKey2018, `@digitalbazaar/did-method-key`
 * gives Ed25519VerificationKey2020 or Multikey). The type is therefore an option here, so the
 * playground can reproduce what each verifier expects.
 */
import { FormatError } from '../errors.js';
import { toPublicJwk, type PublicJwk } from '../keys/keys.js';
import {
  buildVerificationMethod,
  contextForVerificationMethodType,
  jwkToMultibase,
  multibaseToJwk,
} from './verification-method.js';
import { DID_CONTEXT_V1, type DidResolutionResult, type VerificationMethodType } from './types.js';

export interface DidKeyOptions {
  /** Verification method type for Ed25519 keys. Default `Ed25519VerificationKey2020`. */
  ed25519Type?: Extract<VerificationMethodType, 'Ed25519VerificationKey2020' | 'Multikey' | 'JsonWebKey2020'>;
  /** Verification method type for P-256 keys. Default `JsonWebKey2020`. */
  p256Type?: Extract<VerificationMethodType, 'Multikey' | 'JsonWebKey2020'>;
}

export function createDidKey(jwk: PublicJwk): string {
  return `did:key:${jwkToMultibase(toPublicJwk(jwk))}`;
}

/** Id of the single verification method of a did:key: the DID plus `#` plus the multibase value. */
export function didKeyVerificationMethodId(did: string): string {
  return `${did}#${did.slice('did:key:'.length)}`;
}

export function resolveDidKey(did: string, options: DidKeyOptions = {}): DidResolutionResult {
  const multibase = did.slice('did:key:'.length);
  if (!did.startsWith('did:key:') || multibase.length === 0 || multibase.includes(':')) {
    throw new FormatError('DID_INVALID', `not a did:key: ${did}`);
  }
  let jwk: PublicJwk;
  try {
    jwk = multibaseToJwk(multibase);
  } catch (cause) {
    throw new FormatError('DID_INVALID', `did:key does not encode a supported public key: ${did}`, {
      cause,
      spec: 'did:key "Decode Public Key Algorithm"',
    });
  }
  const type =
    jwk.kty === 'OKP'
      ? (options.ed25519Type ?? 'Ed25519VerificationKey2020')
      : (options.p256Type ?? 'JsonWebKey2020');
  const id = didKeyVerificationMethodId(did);
  const method = buildVerificationMethod(id, did, jwk, type);
  const typeContext = contextForVerificationMethodType(type);
  return {
    didDocument: {
      '@context': typeContext ? [DID_CONTEXT_V1, typeContext] : [DID_CONTEXT_V1],
      id: did,
      verificationMethod: [method],
      // Signature keys only; the X25519 key agreement key some resolvers derive is not needed here.
      authentication: [id],
      assertionMethod: [id],
      capabilityInvocation: [id],
      capabilityDelegation: [id],
    },
    didResolutionMetadata: { method: 'key' },
  };
}
