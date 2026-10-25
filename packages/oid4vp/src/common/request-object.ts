// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Signed request objects (JWT-Secured Authorization Request, RFC 9101) for the DID client id scheme.
 *
 * The verifier signs with its DID key and names it in `kid` as a DID URL; the wallet resolves that DID
 * URL, checks that it belongs to the DID in `client_id` and verifies the signature (OpenID4VP 1.0
 * section 5.9.3 for `decentralized_identifier:`; inji-openid4vp `DidSchemeAuthorizationRequestHandler.kt`
 * does the same for a bare DID).
 */
import {
  decodeCompactJws,
  errorMessage,
  parseDidUrl,
  signCompactJws,
  verifyDecodedJws,
  type DecodedJws,
  type DidResolver,
  type KeyPair,
} from '@inji-playground/formats';
import { REQUEST_OBJECT_TYP, SUPPORTED_JWS_ALGORITHMS } from './constants.js';
import { Oid4vpError } from './errors.js';

/** Signs the request parameters as a request object with `typ` `oauth-authz-req+jwt`. */
export function signRequestObject(payload: Record<string, unknown>, keyPair: KeyPair, kid: string): string {
  return signCompactJws({ typ: REQUEST_OBJECT_TYP, kid }, payload, keyPair);
}

/** Splits a request object without checking it (the inspector shows both parts). */
export function decodeRequestObject(jwt: string): DecodedJws {
  try {
    return decodeCompactJws(jwt, 'SDJWT_MALFORMED');
  } catch (cause) {
    throw new Oid4vpError(
      'REQUEST_OBJECT_INVALID',
      `request object is not a compact JWS: ${errorMessage(cause)}`,
      {
        cause,
        spec: 'RFC 9101 section 4',
      },
    );
  }
}

/**
 * Verifies a request object signed under a DID: `typ`, `alg`, `kid` inside `did`, and the signature
 * with the key the DID document lists for `kid`. Returns the decoded JWS.
 */
export async function verifyDidSignedRequestObject(
  jwt: string,
  did: string,
  resolver: DidResolver,
): Promise<DecodedJws> {
  const decoded = decodeRequestObject(jwt);
  const { header } = decoded;
  if (header.typ !== REQUEST_OBJECT_TYP) {
    throw new Oid4vpError('REQUEST_OBJECT_INVALID', `request object typ must be "${REQUEST_OBJECT_TYP}"`, {
      spec: 'RFC 9101 section 10.8; OpenID4VP 1.0 section 5.10',
      details: { typ: header.typ },
    });
  }
  if (
    typeof header.alg !== 'string' ||
    !(SUPPORTED_JWS_ALGORITHMS as readonly string[]).includes(header.alg)
  ) {
    throw new Oid4vpError(
      'REQUEST_SIGNATURE_INVALID',
      `request object alg "${String(header.alg)}" is not accepted`,
      {
        spec: 'RFC 8725 section 3.1',
      },
    );
  }
  if (typeof header.kid !== 'string') {
    throw new Oid4vpError('REQUEST_SIGNATURE_INVALID', 'request object has no kid naming the DID key', {
      spec: 'OpenID4VP 1.0 section 5.9.3 (decentralized_identifier)',
    });
  }
  const kid = header.kid.startsWith('#') ? `${did}${header.kid}` : header.kid;
  let kidDid: string;
  try {
    kidDid = parseDidUrl(kid).did;
  } catch (cause) {
    throw new Oid4vpError('REQUEST_SIGNATURE_INVALID', `kid ${kid} is not a DID URL`, { cause });
  }
  if (kidDid !== did) {
    throw new Oid4vpError(
      'CLIENT_ID_MISMATCH',
      'kid of the request object does not belong to the client_id DID',
      {
        spec: 'OpenID4VP 1.0 section 5.9.3 (decentralized_identifier)',
        details: { kid, did },
      },
    );
  }
  let publicJwk;
  try {
    publicJwk = (await resolver.resolveVerificationMethod(kid)).publicJwk;
  } catch (cause) {
    throw new Oid4vpError(
      'REQUEST_SIGNATURE_INVALID',
      `cannot resolve the verifier key ${kid}: ${errorMessage(cause)}`,
      {
        cause,
      },
    );
  }
  if (!verifyDecodedJws(decoded, publicJwk)) {
    throw new Oid4vpError(
      'REQUEST_SIGNATURE_INVALID',
      'request object signature does not verify with the client_id DID key',
      {
        spec: 'RFC 9101 section 6.2; OpenID4VP 1.0 section 5.9.3',
        details: { kid },
      },
    );
  }
  return decoded;
}
