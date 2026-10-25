// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Protocol constants shared by the reference verifier and the wallet presentation client.
 *
 * Two profiles exist because Inji's stable releases and OpenID4VP 1.0 differ on the wire:
 * - `inji-draft`: drafts 21-23 as Inji Verify 0.18 speaks them. Presentation Exchange 2.0
 *   `presentation_definition`; a bare DID as `client_id` with a signed request object by reference, or
 *   the `redirect_uri` client id scheme unsigned by value; `direct_post` with `presentation_submission`.
 * - `final-1.0`: OpenID4VP 1.0. `dcql_query`, client id prefixes `decentralized_identifier:` and
 *   `redirect_uri:`, and `vp_token` as a JSON object keyed by credential query id (section 8.1).
 */
import type { CredentialFormat, VpProfile } from '@inji-playground/protocol';

export const VP_PROFILES: readonly VpProfile[] = ['inji-draft', 'final-1.0'];

/**
 * URI schemes a wallet answers. `openid4vp:` is what Inji Wallet mobile recognises
 * (`inji-wallet/machines/bleShare/scan/scanGuards.ts:28`); the other two are HAIP and EUDI aliases
 * that carry the same parameters.
 */
export const REQUEST_URI_SCHEMES = ['openid4vp:', 'haip-vp:', 'eudi-openid4vp:'] as const;

/** `typ` header of a request object (RFC 9101 section 4) and its media type (section 10.2). */
export const REQUEST_OBJECT_TYP = 'oauth-authz-req+jwt';
export const REQUEST_OBJECT_MEDIA_TYPE = 'application/oauth-authz-req+jwt';

/** `aud` of a request object for a wallet found by static discovery (OpenID4VP 1.0 section 5.8). */
export const SELF_ISSUED_AUDIENCE = 'https://self-issued.me/v2';

/** Client id prefixes of OpenID4VP 1.0 section 5.9.3 that the reference roles implement. */
export const DECENTRALIZED_IDENTIFIER_PREFIX = 'decentralized_identifier:';
export const REDIRECT_URI_PREFIX = 'redirect_uri:';

/** How a verifier identifies itself; the profile decides how it is written into `client_id`. */
export type ClientIdScheme = 'did' | 'redirect_uri';

/** Algorithms the reference roles accept for request objects, SD-JWTs and KB-JWTs. */
export const SUPPORTED_JWS_ALGORITHMS = ['EdDSA', 'ES256'] as const;
export const LDP_PROOF_TYPES = ['Ed25519Signature2020', 'DataIntegrityProof'] as const;

/** True for the two names of the SD-JWT VC format. */
export function isSdJwtVcFormat(format: string): format is 'vc+sd-jwt' | 'dc+sd-jwt' {
  return format === 'vc+sd-jwt' || format === 'dc+sd-jwt';
}

/** Formats the reference roles present and verify. */
export type PresentableFormat = Extract<CredentialFormat, 'ldp_vc' | 'vc+sd-jwt' | 'dc+sd-jwt' | 'mso_mdoc'>;

export function isPresentableFormat(format: string): format is PresentableFormat {
  return format === 'ldp_vc' || format === 'mso_mdoc' || isSdJwtVcFormat(format);
}

/** COSE algorithm identifier of ES256 (RFC 9053 section 2.1), the only one mdoc signatures use here. */
export const COSE_ES256 = -7;

/**
 * Form parameter that carries the wallet's mdoc generated nonce with an unencrypted `direct_post`
 * response in the `inji-draft` profile. ISO/IEC TS 18013-7 Annex B.4.3 puts it in the JWE `apu`
 * header of an encrypted response; the reference roles post unencrypted, so the wallet sends it next
 * to `vp_token` and the verifier reads it from there to rebuild the SessionTranscript (Annex B.4.4).
 */
export const MDOC_GENERATED_NONCE_PARAMETER = 'mdoc_generated_nonce';

/**
 * `mso_mdoc` format metadata: the drafts and ISO/IEC TS 18013-7 Annex B.2.2 list JOSE names in
 * `alg`; OpenID4VP 1.0 Appendix B.2.3 lists COSE algorithm identifiers.
 */
export function mdocFormatMetadata(profile: VpProfile): Record<string, unknown> {
  return profile === 'final-1.0'
    ? { issuerauth_alg_values: [COSE_ES256], deviceauth_alg_values: [COSE_ES256] }
    : { alg: ['ES256'] };
}

/**
 * Client metadata listing the formats the reference verifier accepts: `vp_formats` in the drafts,
 * `vp_formats_supported` in 1.0 (section 11.1). Inji Verify sends the draft form.
 */
export function vpFormatsMetadata(profile: VpProfile = 'inji-draft'): Record<string, unknown> {
  const sdJwt = {
    'sd-jwt_alg_values': [...SUPPORTED_JWS_ALGORITHMS],
    'kb-jwt_alg_values': [...SUPPORTED_JWS_ALGORITHMS],
  };
  return {
    ldp_vp: { proof_type: [...LDP_PROOF_TYPES] },
    ldp_vc: { proof_type: [...LDP_PROOF_TYPES] },
    'vc+sd-jwt': sdJwt,
    'dc+sd-jwt': sdJwt,
    mso_mdoc: mdocFormatMetadata(profile),
  };
}
