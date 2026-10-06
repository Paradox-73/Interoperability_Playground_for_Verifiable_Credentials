/**
 * OpenID4VP over the W3C Digital Credentials API (OpenID4VP 1.0 Appendix A; W3C Digital Credentials,
 * Editor's Draft): the verifier's web page passes the request to `navigator.credentials.get({ digital: {
 * requests: [{ protocol, data }] } })`, the browser hands it to a wallet on the device, and the wallet's
 * answer comes back to the page as the `data` of a `DigitalCredential`. There is no `response_uri`: the page
 * posts the answer to its own backend.
 *
 * The reference roles use the unsigned request (protocol `openid4vp-v1-unsigned`, Appendix A.3.1). Without a
 * signed request the wallet takes the verifier's identity from the browser: the effective client id is the
 * calling origin prefixed with `origin:` (Appendix A.2 and A.4), and that value is the audience of every
 * holder binding (the KB-JWT `aud`, the ldp_vp `domain`).
 */
import type { JsonObject } from '@inji-playground/formats';

/** Protocol identifiers of OpenID4VP 1.0 Appendix A.1. The reference roles implement the unsigned one. */
export const DC_API_PROTOCOL_UNSIGNED = 'openid4vp-v1-unsigned';
export const DC_API_PROTOCOL_SIGNED = 'openid4vp-v1-signed';
export const DC_API_PROTOCOLS = [DC_API_PROTOCOL_UNSIGNED, DC_API_PROTOCOL_SIGNED] as const;

/** `response_mode` of a request sent through the Digital Credentials API (Appendix A.2). */
export const DC_API_RESPONSE_MODE = 'dc_api';

/** One entry of `digital.requests` in `navigator.credentials.get()`. */
export interface DcApiRequest {
  protocol: string;
  data: JsonObject;
}

/** What the browser returns: a `DigitalCredential`'s `protocol` and `data` (the authorization response). */
export interface DcApiResponse {
  protocol: string;
  data: JsonObject;
}

/** The client id a wallet uses for an unsigned request from `origin` (Appendix A.4). */
export function originClientId(origin: string): string {
  return `origin:${new URL(origin).origin}`;
}
