// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packages that compile these sources need the declarations too (vendor.d.ts)
/// <reference path="../vendor.d.ts" />
/**
 * The two Data Integrity proof suites the playground issues and verifies, both over Ed25519 keys:
 * - `Ed25519Signature2020` (W3C CCG report; Inji Certify's main ldp_vc suite), used with VC 1.1;
 * - `DataIntegrityProof` with cryptosuite `eddsa-rdfc-2022` (W3C vc-di-eddsa 1.0 section 3.2), used with VC 2.0.
 */
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
import { cryptosuite as eddsaRdfc2022 } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import type { LinkedDataSuite } from '@digitalbazaar/vc';
import { FormatError } from '../errors.js';
import { parseDidUrl } from '../did/resolver.js';
import type { KeyPair } from '../keys/keys.js';

export type LdpProofSuite = 'Ed25519Signature2020' | 'eddsa-rdfc-2022';
export const LDP_PROOF_SUITES: readonly LdpProofSuite[] = ['Ed25519Signature2020', 'eddsa-rdfc-2022'];

/** A signing key and the DID URL that names it in the proof's `verificationMethod`. */
export interface LdpSigningKey {
  keyPair: KeyPair;
  /** DID URL of the verification method, for example `did:key:z6Mk...#z6Mk...`. */
  verificationMethod: string;
}

export async function signingSuite(
  suite: LdpProofSuite,
  key: LdpSigningKey,
  date?: Date,
): Promise<LinkedDataSuite> {
  if (key.keyPair.alg !== 'EdDSA') {
    throw new FormatError('KEY_UNSUPPORTED', `${suite} needs an Ed25519 key, got ${key.keyPair.alg}`);
  }
  const keyPair = await Ed25519Multikey.fromJwk({
    jwk: { ...key.keyPair.privateJwk },
    secretKey: true,
    id: key.verificationMethod,
    controller: parseDidUrl(key.verificationMethod).did,
  });
  const signer = keyPair.signer();
  return suite === 'Ed25519Signature2020'
    ? new Ed25519Signature2020({ signer, ...(date ? { date } : {}) })
    : new DataIntegrityProof({ signer, cryptosuite: eddsaRdfc2022, ...(date ? { date } : {}) });
}

/** Verifiers for every supported suite; the library picks the one whose type matches the proof. */
export function verificationSuites(): LinkedDataSuite[] {
  return [new Ed25519Signature2020(), new DataIntegrityProof({ cryptosuite: eddsaRdfc2022 })];
}

/** Proof suite name as reports show it: `Ed25519Signature2020` or `DataIntegrityProof/eddsa-rdfc-2022`. */
export function describeProof(proof: Record<string, unknown>): string {
  const type = typeof proof.type === 'string' ? proof.type : 'unknown';
  return type === 'DataIntegrityProof' && typeof proof.cryptosuite === 'string'
    ? `${type}/${proof.cryptosuite}`
    : type;
}
