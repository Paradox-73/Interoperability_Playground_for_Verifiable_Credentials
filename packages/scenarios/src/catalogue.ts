/**
 * The scenario catalogue: the happy path, the tamper scenarios and the valid probe variants, as data.
 *
 * Each entry is a `ScenarioSpec` (the shape `/api/scenarios` serves, validated against the protocol
 * schema) plus the instructions the reference roles follow to produce it:
 * - `issuer`: what the reference issuer changes when it signs (validity window, type, DID method,
 *   credential configuration, `x5c`). Valid signatures throughout: the credential is wrong, not forged.
 * - `credentialTamper`: what changes in the issued credential before the wallet presents it.
 * - `presentationTamper`: what changes in the encoded `vp_token` just before the wallet posts it.
 * - `wallet`: how the reference wallet behaves differently (holder DID form, presenting a credential
 *   the request did not ask for).
 * The functions that carry these out are in `tamper.ts`, `issuer.ts` and `wallet.ts`.
 *
 * Expected outcomes follow the specifications, not what any implementation does: a cell whose actual
 * outcome differs from the expected one is a finding about the role under test.
 */
import type { CredentialFormat, ScenarioSpec } from '@inji-playground/protocol';

/** Formats the playground's reference roles issue, present and verify. */
export const REFERENCE_FORMATS: readonly CredentialFormat[] = [
  'ldp_vc',
  'vc+sd-jwt',
  'dc+sd-jwt',
  'mso_mdoc',
];
const SD_JWT_FORMATS: CredentialFormat[] = ['vc+sd-jwt', 'dc+sd-jwt'];
/**
 * Formats whose elements are disclosed one by one under an issuer digest: SD-JWT VC disclosures and
 * mdoc IssuerSignedItems (ISO/IEC 18013-5 section 9.1.2.5).
 */
const SELECTIVE_DISCLOSURE_FORMATS: CredentialFormat[] = [...SD_JWT_FORMATS, 'mso_mdoc'];
/** Formats whose issuer key can be named by an X.509 chain: SD-JWT VC `x5c` and the mdoc `x5chain`. */
const X5C_FORMATS: CredentialFormat[] = [...SD_JWT_FORMATS, 'mso_mdoc'];
/**
 * Formats whose issuer is a DID. An mdoc names its issuer by the document signer certificate only
 * (ISO/IEC 18013-5 section 9.1.2.4), so DID-method probes leave it out.
 */
const DID_ISSUER_FORMATS: CredentialFormat[] = ['ldp_vc', ...SD_JWT_FORMATS];

/** Changes the reference issuer applies when it signs (times relative to the moment of issuance). */
export interface IssuerVariant {
  /** Start of validity, in seconds from issuance (negative = in the past). */
  validFromOffsetSeconds?: number;
  /** End of validity, in seconds from issuance. */
  validUntilOffsetSeconds?: number;
  /** ldp_vc: replaces the `type` array. */
  types?: string[];
  /** SD-JWT VC: replaces `vct`. */
  vct?: string;
  /** mso_mdoc: replaces the docType. */
  doctype?: string;
  /** SD-JWT VC: names the issuer key by a test certificate in `x5c` instead of a DID `kid`. */
  useX5c?: boolean;
  /** DID method of the issuer's keys; needs an issuer instance created with that method. */
  didMethod?: 'did:web' | 'did:key' | 'did:jwk';
  /** Credential configuration to issue, per format, instead of the issuer's default for the format. */
  configurationIds?: Partial<Record<CredentialFormat, string>>;
}

/** Changes made to the issued credential while the wallet holds it. */
export type CredentialTamper =
  /** One byte of the issuer signature (JWS, mdoc issuerAuth) or `proofValue` (Data Integrity) inverted. */
  | 'flip-issuer-signature'
  /** SD-JWT or mdoc MSO re-signed by a forger's key named by a self-signed `x5c` / `x5chain` certificate. */
  | 'forge-x5c'
  /** SD-JWT re-signed by a key of the holder's own making; `iss` becomes that key's did:key. */
  | 'self-issue'
  /** SD-JWT re-signed by a key of the holder's own making, named by its did:key; `iss` stays the issuer's. */
  | 'self-issue-keep-iss';

/** Changes made to the encoded `vp_token` just before the wallet posts it. */
export type PresentationTamper =
  /** One disclosure's (mdoc: element's) value changed, KB-JWT signed again over the result. */
  | 'alter-disclosure'
  /** A disclosure (mdoc: element) the issuer never signed appended, KB-JWT signed again. */
  | 'add-unreferenced-disclosure'
  /** KB-JWT signed again by the holder with a nonce from another request. */
  | 'kb-wrong-nonce'
  /** KB-JWT signed again by the holder with another verifier as `aud`. */
  | 'kb-wrong-aud'
  /** A `vp_token` the wallet sent to an earlier request of the same verifier, sent again unchanged. */
  | 'replay-earlier'
  /** The presentation signed again by a key that is not the one the credential is bound to. */
  | 'present-as-other-holder';

export interface WalletVariant {
  /**
   * `canonical`: present the unpadded did:jwk even when the credential binds a padded one
   * (inji/inji-certify#1054). Default: present the holder DID exactly as bound.
   */
  holderDidForm?: 'as-bound' | 'canonical';
  /** Present the held credential even when it does not match the verifier's query. */
  presentUnmatched?: boolean;
}

export interface ScenarioDefinition extends ScenarioSpec {
  issuer?: IssuerVariant;
  credentialTamper?: CredentialTamper;
  presentationTamper?: PresentationTamper;
  wallet?: WalletVariant;
}

const DAY = 24 * 3600;
const REF_ISSUER = ['ref-issuer'];
const REF_WALLET = ['ref-wallet'];

/** A type, a `vct` and a docType the reference issuer never issues by default and verifiers never ask for. */
export const WRONG_TYPE = 'LandRecordCredential';
export const WRONG_VCT = 'https://playground.ps02.test/vct/land-record/v1';
export const WRONG_DOCTYPE = 'test.ps02.playground.landrecord.1';

/** Every scenario, in the order the UI lists them. */
export const scenarioCatalog: readonly ScenarioDefinition[] = [
  {
    id: 'happy',
    title: 'Happy path',
    description:
      'The issuer issues a valid credential, the wallet presents it unchanged, and the verifier must accept it.',
    expected: 'VALID',
    target: 'none',
    category: 'happy',
  },
  {
    id: 'expired',
    title: 'Expired credential ("Valid but expired")',
    description:
      'The issuer signs a credential whose validity ended yesterday. The signature is genuine, so the verifier must report it as expired (Inji Verify shows "Valid but expired"), not as invalid.',
    expected: 'EXPIRED',
    target: 'credential',
    category: 'tamper',
    formats: [...REFERENCE_FORMATS],
    requires: { issuer: REF_ISSUER },
    reference:
      'VC Data Model 1.1 section 4.8 (expirationDate); VC Data Model 2.0 section 4.9 (validUntil); RFC 9901 section 7.1 step 6 with RFC 7519 section 4.1.4 (exp); ISO/IEC 18013-5 section 9.3.1 step 6 (validityInfo.validUntil)',
    issuer: { validFromOffsetSeconds: -365 * DAY, validUntilOffsetSeconds: -DAY },
  },
  {
    id: 'not-yet-valid',
    title: 'Credential not valid yet',
    description:
      'The issuer signs a credential whose validity starts tomorrow. A verifier must not accept a credential before its validity period begins.',
    expected: 'INVALID',
    target: 'credential',
    category: 'tamper',
    formats: [...REFERENCE_FORMATS],
    requires: { issuer: REF_ISSUER },
    reference:
      'VC Data Model 1.1 section 4.6 (issuanceDate); VC Data Model 2.0 section 4.9 (validFrom); RFC 9901 section 7.1 step 6 with RFC 7519 section 4.1.5 (nbf); ISO/IEC 18013-5 section 9.3.1 step 6 (validityInfo.validFrom)',
    issuer: { validFromOffsetSeconds: DAY, validUntilOffsetSeconds: 365 * DAY },
  },
  {
    id: 'wrong-type',
    title: 'Credential of the wrong type',
    description: `The issuer signs a valid ${WRONG_TYPE} and the wallet presents it although the verifier asked for a FarmerCredential. The verifier must check that what it received is what it asked for.`,
    expected: 'INVALID',
    target: 'credential',
    category: 'tamper',
    formats: [...REFERENCE_FORMATS],
    requires: { issuer: REF_ISSUER, wallet: REF_WALLET },
    reference:
      'DIF Presentation Exchange 2.0 section 8 (input evaluation) for the draft profile, with ISO/IEC TS 18013-7 Annex B.3.1.1 (the input descriptor id is the docType); OpenID4VP 1.0 section 6 (DCQL credential query meta: type_values, vct_values, doctype_value)',
    issuer: { types: ['VerifiableCredential', WRONG_TYPE], vct: WRONG_VCT, doctype: WRONG_DOCTYPE },
    wallet: { presentUnmatched: true },
  },
  {
    id: 'bad-signature',
    title: 'Bad issuer signature',
    description:
      'One byte of the issuer signature is inverted after issuance, so the credential no longer matches what the issuer signed. The verifier must reject it.',
    expected: 'INVALID',
    target: 'credential',
    category: 'tamper',
    formats: [...REFERENCE_FORMATS],
    requires: { wallet: REF_WALLET },
    reference:
      'VC Data Integrity 1.0 section 4.4 (verify proof); RFC 9901 section 7.1 step 2b (issuer signature); ISO/IEC 18013-5 section 9.3.1 step 2 (issuerAuth signature)',
    credentialTamper: 'flip-issuer-signature',
  },
  {
    id: 'altered-disclosure',
    title: 'Altered selective disclosure',
    description:
      'The wallet changes the value of one disclosed claim and, for SD-JWT VC, signs its key binding JWT again (an mdoc device signature does not cover issuer-signed elements). The issuer never signed that value, so the verifier must reject the presentation.',
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: SELECTIVE_DISCLOSURE_FORMATS,
    requires: { wallet: REF_WALLET },
    reference:
      'RFC 9901 section 7.1 step 3 (every disclosure must match a digest in the issuer-signed JWT); ISO/IEC 18013-5 section 9.3.1 step 4 (IssuerSignedItem digest must match the MSO)',
    presentationTamper: 'alter-disclosure',
  },
  {
    id: 'unreferenced-disclosure',
    title: 'Extra disclosure the issuer never signed',
    description:
      'The wallet adds a disclosure of its own (a new claim; for an mdoc, an element under a digest id the MSO does not list) and, for SD-JWT VC, signs its key binding JWT again. No digest in the credential refers to it, so the verifier must reject the presentation.',
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: SELECTIVE_DISCLOSURE_FORMATS,
    requires: { wallet: REF_WALLET },
    reference:
      'RFC 9901 section 7.1 step 3 (unreferenced disclosures are rejected); ISO/IEC 18013-5 section 9.3.1 step 4 (every element needs its MSO digest)',
    presentationTamper: 'add-unreferenced-disclosure',
  },
  {
    id: 'kb-wrong-nonce',
    title: 'Key binding with the wrong nonce',
    description:
      "The holder's key binding JWT is signed correctly but carries a nonce from another request. The verifier must reject it, or a captured presentation could be reused.",
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: SD_JWT_FORMATS,
    requires: { wallet: REF_WALLET },
    reference: 'RFC 9901 section 7.3 step 5f (nonce); OpenID4VP 1.0 Appendix B.3.6',
    gap: 'inji/inji-verify#2059',
    presentationTamper: 'kb-wrong-nonce',
  },
  {
    id: 'kb-wrong-aud',
    title: 'Key binding for another verifier',
    description:
      "The holder's key binding JWT is signed correctly but names another verifier as its audience. The verifier must reject a presentation that was made for someone else.",
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: SD_JWT_FORMATS,
    requires: { wallet: REF_WALLET },
    reference: 'RFC 9901 section 7.3 step 5f (aud); OpenID4VP 1.0 Appendix B.3.6 (aud is the client_id)',
    gap: 'inji/inji-verify#2059',
    presentationTamper: 'kb-wrong-aud',
  },
  {
    id: 'vp-replay',
    title: 'Replayed presentation',
    description:
      'The wallet answers a new request with the vp_token it sent to an earlier request of the same verifier. That token is bound to the earlier nonce, so the verifier must reject it.',
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: [...REFERENCE_FORMATS],
    requires: { wallet: REF_WALLET },
    reference:
      'OpenID4VP 1.0 section 14.1 (preventing replay of the VP Token); Appendix B.1.3.2.5 (ldp_vp challenge), B.3.6 (KB-JWT nonce) and B.2.6 (mdoc SessionTranscript)',
    presentationTamper: 'replay-earlier',
  },
  {
    id: 'holder-mismatch',
    title: 'Presented by someone other than the holder',
    description:
      'Someone who does not hold the key the credential is bound to presents it with a valid signature of their own key. The verifier must check that the presenter is the holder.',
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: [...REFERENCE_FORMATS],
    requires: { wallet: REF_WALLET },
    reference:
      'RFC 9901 section 7.3 step 5c (KB-JWT signed by the key in cnf); VC Data Model 1.1 section 5.8 and OpenID4VP 1.0 Appendix B.1.3.2.5 (ldp_vp holder binding); ISO/IEC 18013-5 section 9.1.3.6 (DeviceSignature by the MSO deviceKey)',
    presentationTamper: 'present-as-other-holder',
  },
  {
    id: 'forged-x5c',
    title: 'Issuer signature forged with a self-signed certificate',
    description:
      "The credential keeps the issuer's name and claims but is signed again by a forger's key, named by a self-signed X.509 certificate (SD-JWT x5c, mdoc x5chain). A verifier must accept a chain only when it ends at a trust anchor it knows.",
    expected: 'INVALID',
    target: 'credential',
    category: 'tamper',
    formats: X5C_FORMATS,
    requires: { wallet: REF_WALLET },
    reference:
      'SD-JWT VC draft 19 section 2.5 (issuer key via x5c must be validated); RFC 7515 section 4.1.6 (x5c); ISO/IEC 18013-5 section 9.3.1 step 1 (document signer chain to a trusted IACA)',
    credentialTamper: 'forge-x5c',
  },
  {
    id: 'self-issued',
    title: 'Credential the holder issued itself',
    description:
      'The holder signs the credential again with a key it made, names that key by its own did:key and puts the same DID in iss. Signature and issuer agree, but no one vouches for that issuer. A verifier must accept only issuers it trusts.',
    expected: 'INVALID',
    target: 'credential',
    category: 'tamper',
    formats: SD_JWT_FORMATS,
    requires: { wallet: REF_WALLET },
    reference:
      'W3C VC Data Model 2.0 (the verifier decides which issuers it trusts); SD-JWT VC draft 19 section 2.5 (issuer key validation)',
    credentialTamper: 'self-issue',
  },
  {
    id: 'issuer-name-borrowed',
    title: "Issuer's name kept, signed with the holder's own did:key",
    description:
      'The holder signs the credential again with a key it made and names that key by its did:key, but keeps the real issuer in iss. A verifier must check that the key belongs to the issuer the credential names.',
    expected: 'INVALID',
    target: 'credential',
    category: 'tamper',
    formats: SD_JWT_FORMATS,
    requires: { wallet: REF_WALLET },
    reference:
      'RFC 9901 section 7.1 step 2c (the key must belong to the issuer); SD-JWT VC draft 19 section 2.5 (a DID key names a DID issuer)',
    credentialTamper: 'self-issue-keep-iss',
  },
  {
    id: 'issuer-did-key',
    title: 'Probe: issuer identified by did:key',
    description:
      'A valid credential from an issuer whose key is a did:key (the default reference issuer uses did:web). Every verifier that resolves did:key must accept it.',
    expected: 'VALID',
    target: 'none',
    category: 'probe',
    formats: DID_ISSUER_FORMATS,
    requires: { issuer: REF_ISSUER },
    reference: 'did:key Method v0.7 (W3C CCG); DID Core 1.0 section 7.1 (DID resolution)',
    issuer: { didMethod: 'did:key' },
  },
  {
    id: 'issuer-did-jwk',
    title: 'Probe: issuer identified by did:jwk',
    description:
      'A valid credential from an issuer whose key is a did:jwk. Verifiers that support did:jwk must accept it; a rejection is a DID method gap.',
    expected: 'VALID',
    target: 'none',
    category: 'probe',
    formats: DID_ISSUER_FORMATS,
    requires: { issuer: REF_ISSUER },
    reference: 'did:jwk method specification (DIF); DID Core 1.0 section 7.1 (DID resolution)',
    issuer: { didMethod: 'did:jwk' },
  },
  {
    id: 'vc2-eddsa-rdfc-2022',
    title: 'Probe: W3C VC 2.0 with eddsa-rdfc-2022',
    description:
      'A valid W3C VC Data Model 2.0 credential with a DataIntegrityProof (cryptosuite eddsa-rdfc-2022) instead of Ed25519Signature2020. A verifier that advertises only the older proof types fails this cell.',
    expected: 'VALID',
    target: 'none',
    category: 'probe',
    formats: ['ldp_vc'],
    requires: { issuer: REF_ISSUER },
    reference: 'VC Data Model 2.0; VC Data Integrity EdDSA Cryptosuites 1.0 section 3.3 (eddsa-rdfc-2022)',
    issuer: { configurationIds: { ldp_vc: 'FarmerCredential_ldp_vc_v2' } },
  },
  {
    id: 'holder-proof-es256',
    title: 'Probe: issuer that takes only ES256 key proofs',
    description:
      'A valid ldp_vc from an issuer whose credential configuration lists only ES256 for key proofs, as the Inji Certify sample does for FarmerCredential. The wallet binds the credential to a P-256 key and must sign the presentation with that same key; a wallet that signs with another key fails holder binding.',
    expected: 'VALID',
    target: 'none',
    category: 'probe',
    formats: ['ldp_vc'],
    requires: { issuer: REF_ISSUER },
    reference:
      'OpenID4VCI draft 13 section 7.2.1.1 (proof binds the credential to the key); VC Data Model 1.1 section 5.8 (holder binding)',
    gap: 'G22',
    issuer: { configurationIds: { ldp_vc: 'FarmerCredential_ldp_vc_es256_proof' } },
  },
  {
    id: 'dc-sd-jwt',
    title: 'Probe: SD-JWT VC under the format id dc+sd-jwt',
    description:
      'A valid SD-JWT VC with typ and format identifier dc+sd-jwt, the name OpenID4VCI 1.0 and OpenID4VP 1.0 use. Verifiers that know only vc+sd-jwt fail this cell.',
    expected: 'VALID',
    target: 'none',
    category: 'probe',
    formats: ['dc+sd-jwt'],
    reference:
      'SD-JWT VC draft 19 section 2.2.1 (typ dc+sd-jwt); OpenID4VP 1.0 Appendix B.3 (format identifier dc+sd-jwt)',
  },
  {
    id: 'holder-did-canonical',
    title: 'Probe: canonical did:jwk for a padded holder binding',
    description:
      'Inji Certify writes the holder did:jwk with base64 padding. The wallet presents the canonical, unpadded form of the same key. Both strings name one key and the did:jwk method forbids padding, so a verifier should accept it.',
    expected: 'VALID',
    target: 'presentation',
    category: 'probe',
    formats: ['ldp_vc'],
    requires: { issuer: ['inji-certify', 'inji-certify-ac'], wallet: REF_WALLET },
    reference: 'did:jwk method specification (base64url without padding, RFC 7515 section 2)',
    gap: 'inji/inji-certify#1054',
    wallet: { holderDidForm: 'canonical' },
  },
];
