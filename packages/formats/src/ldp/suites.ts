// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packages that compile these sources need the declarations too (vendor.d.ts)
/// <reference path="../vendor.d.ts" />
/**
 * The Data Integrity proof suites the playground issues and verifies:
 * - `Ed25519Signature2020` (W3C CCG report; Inji Certify's main ldp_vc suite), used with VC 1.1;
 * - `DataIntegrityProof` with cryptosuite `eddsa-rdfc-2022` (W3C vc-di-eddsa 1.0 section 3.2), used with VC 2.0;
 * - `DataIntegrityProof` with cryptosuite `ecdsa-rdfc-2019` over P-256 (W3C vc-di-ecdsa 1.0 section 3.2). The
 *   wallet signs presentations with it when the credential is bound to a P-256 key: Inji Certify 0.14.0
 *   accepts only ES256 and RS256 holder proofs (an EdDSA proof is refused, gap G9), so its ldp_vc is bound
 *   to a P-256 key, and only that key can prove holder binding.
 */
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
import { cryptosuite as eddsaRdfc2022 } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import { cryptosuite as ecdsaRdfc2019 } from '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite';
import type { LinkedDataSuite } from '@digitalbazaar/vc';
import { FormatError } from '../errors.js';
import { parseDidUrl } from '../did/resolver.js';
import type { KeyPair } from '../keys/keys.js';

export type LdpProofSuite = 'Ed25519Signature2020' | 'eddsa-rdfc-2022' | 'ecdsa-rdfc-2019';
export const LDP_PROOF_SUITES: readonly LdpProofSuite[] = [
  'Ed25519Signature2020',
  'eddsa-rdfc-2022',
  'ecdsa-rdfc-2019',
];

/** The suite that can sign with a key of this algorithm, for presentations of `dataModel`. */
export function suiteForKey(alg: KeyPair['alg'], dataModel: '1.1' | '2.0'): LdpProofSuite {
  if (alg === 'ES256') return 'ecdsa-rdfc-2019';
  return dataModel === '1.1' ? 'Ed25519Signature2020' : 'eddsa-rdfc-2022';
}

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
  const controller = parseDidUrl(key.verificationMethod).did;
  if (suite === 'ecdsa-rdfc-2019') {
    if (key.keyPair.alg !== 'ES256') {
      throw new FormatError('KEY_UNSUPPORTED', `${suite} needs a P-256 key, got ${key.keyPair.alg}`);
    }
    const ecdsaKey = await EcdsaMultikey.fromJwk({
      jwk: { ...key.keyPair.privateJwk },
      secretKey: true,
      id: key.verificationMethod,
      controller,
    });
    return new DataIntegrityProof({
      signer: ecdsaKey.signer(),
      cryptosuite: ecdsaRdfc2019,
      ...(date ? { date } : {}),
    });
  }
  if (key.keyPair.alg !== 'EdDSA') {
    throw new FormatError('KEY_UNSUPPORTED', `${suite} needs an Ed25519 key, got ${key.keyPair.alg}`);
  }
  const keyPair = await Ed25519Multikey.fromJwk({
    jwk: { ...key.keyPair.privateJwk },
    secretKey: true,
    id: key.verificationMethod,
    controller,
  });
  const signer = keyPair.signer();
  return suite === 'Ed25519Signature2020'
    ? new Ed25519Signature2020({ signer, ...(date ? { date } : {}) })
    : new DataIntegrityProof({ signer, cryptosuite: eddsaRdfc2022, ...(date ? { date } : {}) });
}

/** Verifiers for every supported suite; the library picks the one whose type matches the proof. */
export function verificationSuites(): LinkedDataSuite[] {
  return [
    new Ed25519Signature2020(),
    new DataIntegrityProof({ cryptosuite: eddsaRdfc2022 }),
    new DataIntegrityProof({ cryptosuite: ecdsaRdfc2019 }),
  ];
}

/** Proof suite name as reports show it: `Ed25519Signature2020` or `DataIntegrityProof/eddsa-rdfc-2022`. */
export function describeProof(proof: Record<string, unknown>): string {
  const type = typeof proof.type === 'string' ? proof.type : 'unknown';
  return type === 'DataIntegrityProof' && typeof proof.cryptosuite === 'string'
    ? `${type}/${proof.cryptosuite}`
    : type;
}
