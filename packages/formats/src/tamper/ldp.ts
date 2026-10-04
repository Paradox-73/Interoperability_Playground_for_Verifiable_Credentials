/**
 * Tamper primitives for W3C VC Data Integrity documents (`ldp_vc` credentials and `ldp_vp`
 * presentations). Each returns a new document; the input is never modified.
 */
import type { DocumentLoader } from '../jsonld/document-loader.js';
import type { JsonObject } from '../ldp/credential.js';
import { createLdpVp } from '../ldp/presentation.js';
import type { LdpProofSuite, LdpSigningKey } from '../ldp/suites.js';
import { base58btcDecode, base58btcEncode, isRecord } from '../util/encoding.js';
import { flipByte } from './jws.js';

/**
 * Flips one byte of the first proof's `proofValue` (multibase base58btc, the `z` prefix used by
 * Ed25519Signature2020 and eddsa-rdfc-2022). The proof then no longer verifies (VC Data Integrity 1.0
 * section 4.4, "Verify Proof"). Everything else is unchanged.
 */
export function flipProofValue(document: JsonObject, index?: number): JsonObject {
  const copy = structuredClone(document);
  const proof = Array.isArray(copy.proof) ? (copy.proof as unknown[])[0] : copy.proof;
  if (!isRecord(proof) || typeof proof.proofValue !== 'string' || !proof.proofValue.startsWith('z')) {
    throw new TypeError('the document has no multibase (z...) proofValue to tamper with');
  }
  const bytes = base58btcDecode(proof.proofValue.slice(1));
  proof.proofValue = `z${base58btcEncode(flipByte(bytes, index))}`;
  return copy;
}

/**
 * Flips one byte of the `proofValue` of the first credential embedded in a presentation, leaving the
 * holder's proof untouched (it then covers a credential whose own proof is broken only if the
 * presentation is signed afterwards; use `flipProofValue` on the credential before presenting it).
 */
export function flipEmbeddedCredentialProof(presentation: JsonObject, index?: number): JsonObject {
  const copy = structuredClone(presentation);
  const embedded = copy.verifiableCredential;
  const list = Array.isArray(embedded) ? (embedded as unknown[]) : [embedded];
  const first = list[0];
  if (!isRecord(first)) throw new TypeError('the presentation embeds no credential');
  list[0] = flipProofValue(first, index);
  copy.verifiableCredential = Array.isArray(embedded) ? list : list[0];
  return copy;
}

export interface RepresentOptions {
  /** Key and DID URL of whoever signs the new presentation. */
  key: LdpSigningKey;
  /** `holder` of the new presentation; default the DID of `key.verificationMethod`. */
  holder?: string;
  challenge: string;
  domain?: string;
  suite?: LdpProofSuite;
  documentLoader: DocumentLoader;
}

/**
 * Wraps the credentials of an existing presentation in a new one signed by `options.key`. With a key
 * that is not the credential subject's, this is a stolen credential presented by someone else: the
 * holder proof verifies, but `holder` differs from `credentialSubject.id` (VC Data Model 1.1 section
 * 5.8; OpenID4VP 1.0 Appendix B.1.3.2.5 asks the verifier to check holder binding).
 */
export async function representLdpVp(presentation: JsonObject, options: RepresentOptions): Promise<JsonObject> {
  const embedded = presentation.verifiableCredential;
  const credentials = (Array.isArray(embedded) ? (embedded as unknown[]) : [embedded]).filter(isRecord);
  if (credentials.length === 0) throw new TypeError('the presentation embeds no credential');
  return createLdpVp({
    credentials,
    ...(options.holder === undefined ? {} : { holder: options.holder }),
    suite: options.suite ?? suiteOf(credentials[0]!),
    key: options.key,
    challenge: options.challenge,
    ...(options.domain === undefined ? {} : { domain: options.domain }),
    documentLoader: options.documentLoader,
    // The credentials are presented as they are; judging them is the verifier's job.
    checkCredentials: false,
  });
}

function suiteOf(credential: JsonObject): LdpProofSuite {
  const proof = Array.isArray(credential.proof) ? (credential.proof as unknown[])[0] : credential.proof;
  return isRecord(proof) && proof.type === 'DataIntegrityProof' ? 'eddsa-rdfc-2022' : 'Ed25519Signature2020';
}
