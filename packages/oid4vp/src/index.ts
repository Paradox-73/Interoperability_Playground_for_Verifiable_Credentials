/**
 * @inji-playground/oid4vp: reference OpenID4VP verifier (Presentation Exchange and DCQL) and the
 * wallet's presentation client.
 *
 * Skeleton: only the protocol constants and request URI parsing exist so far; the verifier and the
 * client are added by the OpenID4VP work package.
 */

/** URI scheme wallets register for cross-device and same-device presentation requests. */
export const OPENID4VP_SCHEME = 'openid4vp:';

/** Parameters of an `openid4vp://authorize?...` request URI, as strings exactly as received. */
export function parseRequestUri(uri: string): Record<string, string> {
  const url = new URL(uri);
  if (url.protocol !== OPENID4VP_SCHEME) {
    throw new Error(`not an OpenID4VP request URI: scheme is ${url.protocol}`);
  }
  return Object.fromEntries(url.searchParams.entries());
}
