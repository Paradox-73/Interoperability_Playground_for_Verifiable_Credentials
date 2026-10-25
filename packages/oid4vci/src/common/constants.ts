// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Protocol constants shared by the reference issuer, the test authorization server and the wallet
 * client. Section numbers name OpenID4VCI draft 13 ("d13") and the final OpenID4VCI 1.0 ("1.0").
 */

/** Well-known paths read before a credential is requested. */
export const WELL_KNOWN = {
  /** OpenID4VCI "Credential Issuer Metadata" (d13 section 11.2, 1.0 section 12.2). */
  credentialIssuer: '/.well-known/openid-credential-issuer',
  /** RFC 8414 OAuth 2.0 Authorization Server Metadata. */
  oauthAuthorizationServer: '/.well-known/oauth-authorization-server',
  /** OpenID Connect Discovery 1.0, used when the authorization server is also an OpenID provider. */
  openidConfiguration: '/.well-known/openid-configuration',
  /** SD-JWT VC issuer metadata (draft-ietf-oauth-sd-jwt-vc section 5). */
  jwtVcIssuer: '/.well-known/jwt-vc-issuer',
} as const;

/** Grant type of the pre-authorized code flow (d13 section 6.1, 1.0 section 6.1). */
export const PRE_AUTHORIZED_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

/** RFC 6749 authorization code grant. */
export const AUTHORIZATION_CODE_GRANT = 'authorization_code';

/** URI scheme of a credential offer passed by QR code or link (d13 section 4.1, 1.0 section 4.1). */
export const CREDENTIAL_OFFER_SCHEME = 'openid-credential-offer://';

/** `typ` header of a key proof JWT (d13 section 7.2.1.1, 1.0 Appendix F.1). */
export const PROOF_JWT_TYP = 'openid4vci-proof+jwt';

/** RFC 7523 client assertion type used by `private_key_jwt` (OpenID Connect Core section 9). */
export const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/**
 * Builds the URL of a well-known document for an identifier that may have a path.
 *
 * - `insert` (RFC 8615, RFC 8414 section 3, OpenID4VCI 1.0 section 12.2.2): the well-known segment goes
 *   between host and path, `https://host/tenant` -> `https://host/.well-known/openid-credential-issuer/tenant`.
 * - `append` (OpenID4VCI draft 13 section 11.2.2, OpenID Connect Discovery section 4): the segment is
 *   concatenated to the identifier, `https://host/tenant` -> `https://host/tenant/.well-known/openid-credential-issuer`.
 *
 * Both give the same URL when the identifier has no path.
 */
export function wellKnownUrl(
  identifier: string,
  wellKnownPath: string,
  placement: 'insert' | 'append' = 'insert',
): string {
  const url = new URL(identifier);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return placement === 'insert'
    ? `${url.origin}${wellKnownPath}${path}`
    : `${url.origin}${path}${wellKnownPath}`;
}

/** Removes one trailing slash, so identifiers compare equal however they were configured. */
export function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
