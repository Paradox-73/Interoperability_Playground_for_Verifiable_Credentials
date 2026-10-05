/**
 * @inji-playground/formats: keys, DIDs and credential formats for the reference issuer, wallet and
 * verifier. Everything here works offline; network access (did:web, remote JSON-LD contexts) happens
 * only through a fetch function the caller passes in.
 */
import type { CredentialFormat } from '@inji-playground/protocol';

export * from './errors.js';
export * from './util/encoding.js';

export * from './keys/keys.js';
export * from './keys/jws.js';
export * from './keys/store.js';
export * from './keys/x509.js';

export * from './did/types.js';
export * from './did/verification-method.js';
export * from './did/did-key.js';
export * from './did/did-jwk.js';
export * from './did/did-web.js';
export * from './did/document.js';
export * from './did/resolver.js';

export * from './jsonld/contexts.js';
export * from './jsonld/document-loader.js';

// The suite objects and library result types stay internal: they come from untyped libraries.
export {
  LDP_PROOF_SUITES,
  describeProof,
  suiteForKey,
  type LdpProofSuite,
  type LdpSigningKey,
} from './ldp/suites.js';
export {
  checkValidityPeriod,
  dataModelVersion,
  firstProof,
  issueLdpVc,
  issuerId,
  verifyLdpVc,
  withContext,
  type IssueLdpVcOptions,
  type JsonObject,
  type LdpVcVerification,
  type VcDataModelVersion,
  type VerifyLdpOptions,
} from './ldp/credential.js';
export * from './ldp/presentation.js';

export * from './sd-jwt/common.js';
export * from './sd-jwt/issue.js';
export * from './sd-jwt/present.js';
export * from './sd-jwt/verify.js';

export * from './size/qr.js';

/** True for both names of the SD-JWT VC format (`vc+sd-jwt` is the old one, `dc+sd-jwt` the new one). */
export function isSdJwtFormat(format: CredentialFormat): format is 'vc+sd-jwt' | 'dc+sd-jwt' {
  return format === 'vc+sd-jwt' || format === 'dc+sd-jwt';
}
