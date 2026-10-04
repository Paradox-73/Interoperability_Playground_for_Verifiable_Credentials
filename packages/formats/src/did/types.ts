/**
 * DID Core 1.0 shapes (https://www.w3.org/TR/did-core/), limited to what credential verification
 * reads. Own types instead of the `did-resolver` package's, whose `any`-typed extension members
 * would switch off type checking wherever a document is read.
 */

export const DID_CONTEXT_V1 = 'https://www.w3.org/ns/did/v1';
export const ED25519_2020_CONTEXT_V1 = 'https://w3id.org/security/suites/ed25519-2020/v1';
export const MULTIKEY_CONTEXT_V1 = 'https://w3id.org/security/multikey/v1';
export const JWS_2020_CONTEXT_V1 = 'https://w3id.org/security/suites/jws-2020/v1';

export type VerificationRelationship =
  'authentication' | 'assertionMethod' | 'keyAgreement' | 'capabilityInvocation' | 'capabilityDelegation';

export const VERIFICATION_RELATIONSHIPS: readonly VerificationRelationship[] = [
  'authentication',
  'assertionMethod',
  'keyAgreement',
  'capabilityInvocation',
  'capabilityDelegation',
];

/** Verification method types this package writes; documents from elsewhere may contain others. */
export type VerificationMethodType =
  'Ed25519VerificationKey2020' | 'Multikey' | 'JsonWebKey2020' | 'Ed25519VerificationKey2018';

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: Record<string, unknown>;
  publicKeyMultibase?: string;
  publicKeyBase58?: string;
  '@context'?: unknown;
}

export interface DidDocument {
  '@context'?: string | (string | Record<string, unknown>)[];
  id: string;
  controller?: string | string[];
  alsoKnownAs?: string[];
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: Record<string, unknown>[];
}

export interface DidResolutionMetadata {
  /** DID method name, for example `key`, `jwk`, `web`. */
  method: string;
  /**
   * Set when the DID was accepted although it is not written the way its method specification says,
   * for example a did:jwk with base64 padding (inji/inji-certify#1054). The run report shows it.
   */
  nonCanonical?: boolean;
  /** The DID written canonically, when `nonCanonical` is set. */
  canonicalDid?: string;
  /** For did:web: the URL the document was fetched from (after the host override map). */
  retrievedFrom?: string;
  warnings?: string[];
}

export interface DidResolutionResult {
  didDocument: DidDocument;
  didResolutionMetadata: DidResolutionMetadata;
}

export interface ParsedDidUrl {
  did: string;
  method: string;
  methodSpecificId: string;
  fragment?: string;
}
