/**
 * @inji-playground/oid4vci: reference OpenID4VCI issuer, test authorization server and the wallet's
 * issuance client.
 *
 * Skeleton: only the protocol constants exist so far; the issuer, the test authorization server and
 * the client are added by the OpenID4VCI work package.
 */

/** Well-known paths an OpenID4VCI wallet reads before it asks for a credential. */
export const WELL_KNOWN = {
  /** OpenID4VCI "Credential Issuer Metadata". */
  credentialIssuer: '/.well-known/openid-credential-issuer',
  /** RFC 8414 OAuth 2.0 Authorization Server Metadata. */
  oauthAuthorizationServer: '/.well-known/oauth-authorization-server',
  /** OpenID Connect Discovery, used when the authorization server is an OpenID provider. */
  openidConfiguration: '/.well-known/openid-configuration',
} as const;

/** Grant type of the pre-authorized code flow (OpenID4VCI "Token Request"). */
export const PRE_AUTHORIZED_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

/** URI scheme of a credential offer passed by QR code or link. */
export const CREDENTIAL_OFFER_SCHEME = 'openid-credential-offer://';

/**
 * Builds the URL of a well-known document for an identifier that may have a path.
 *
 * - `insert` (RFC 8615, RFC 8414, OpenID4VCI 1.0): the well-known segment goes between host and path,
 *   `https://host/tenant` -> `https://host/.well-known/openid-credential-issuer/tenant`.
 * - `append` (OpenID4VCI draft 13 "Credential Issuer Metadata"): the segment is concatenated to the
 *   identifier, `https://host/tenant` -> `https://host/tenant/.well-known/openid-credential-issuer`.
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
