// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * SessionTranscript for mdoc presentations over OpenID4VP, the structure the holder's DeviceAuth
 * signature covers (ISO/IEC 18013-5 section 9.1.3.4). DeviceEngagementBytes and EReaderKeyBytes are
 * `null` because there is no proximity engagement; the Handover binds the presentation to the request.
 *
 * - `iso-18013-7-annex-b` (OpenID4VP drafts, the playground's `inji-draft` profile): ISO/IEC TS
 *   18013-7 Annex B.4.4, `OID4VPHandover = [clientIdHash, responseUriHash, nonce]` with
 *   `clientIdHash = SHA-256(cbor([client_id, mdocGeneratedNonce]))` and
 *   `responseUriHash = SHA-256(cbor([response_uri, mdocGeneratedNonce]))`. The mdoc generated nonce is
 *   chosen by the wallet; Annex B carries it in the JWE `apu` header of an encrypted response.
 * - `openid4vp-1.0` (`final-1.0`): OpenID4VP 1.0 Appendix B.2.6.1,
 *   `OpenID4VPHandover = ["OpenID4VPHandover", SHA-256(cbor([client_id, nonce, jwkThumbprint, response_uri]))]`
 *   where `jwkThumbprint` is the SHA-256 JWK thumbprint (RFC 7638) of the verifier's encryption key, or
 *   `null` when the response is not encrypted.
 */
import { createHash } from 'node:crypto';
import { encodeCbor } from './cbor.js';

export type MdocSessionTranscriptInput =
  | {
      kind: 'iso-18013-7-annex-b';
      clientId: string;
      responseUri: string;
      nonce: string;
      mdocGeneratedNonce: string;
    }
  | {
      kind: 'openid4vp-1.0';
      clientId: string;
      responseUri: string;
      nonce: string;
      /** Raw SHA-256 JWK thumbprint of the verifier's encryption key; `null` for an unencrypted response. */
      jwkThumbprint?: Uint8Array | null;
    };

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

/** The SessionTranscript array `[null, null, Handover]`. */
export function mdocSessionTranscript(input: MdocSessionTranscriptInput): unknown[] {
  if (input.kind === 'iso-18013-7-annex-b') {
    const clientIdHash = sha256(encodeCbor([input.clientId, input.mdocGeneratedNonce]));
    const responseUriHash = sha256(encodeCbor([input.responseUri, input.mdocGeneratedNonce]));
    return [null, null, [clientIdHash, responseUriHash, input.nonce]];
  }
  const info = encodeCbor([input.clientId, input.nonce, input.jwkThumbprint ?? null, input.responseUri]);
  return [null, null, ['OpenID4VPHandover', sha256(info)]];
}
