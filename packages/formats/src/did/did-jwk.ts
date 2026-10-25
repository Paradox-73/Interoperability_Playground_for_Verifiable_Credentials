// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * did:jwk (https://github.com/quartzjer/did-jwk/blob/main/spec.md): the DID is the base64url-encoded
 * JWK. The single verification method is always `#0`.
 *
 * The specification uses base64url as in RFC 4648 section 5 and the ABNF `[A-Za-z0-9_-]+`, which has
 * no `=`; padded DIDs are therefore not canonical. Inji Certify writes them padded
 * (`DIDjwkProofManager.java:72` uses `Base64.getUrlEncoder()` without `.withoutPadding()`,
 * inji/inji-certify#1054), so resolution accepts padding and reports it as `nonCanonical`.
 */
import { FormatError } from '../errors.js';
import { toPublicJwk, type PublicJwk } from '../keys/keys.js';
import { base64UrlDecodeToString, base64UrlEncode, isRecord } from '../util/encoding.js';
import { DID_CONTEXT_V1, JWS_2020_CONTEXT_V1, type DidDocument, type DidResolutionResult } from './types.js';

export const DID_JWK_PADDING_ISSUE = 'inji/inji-certify#1054';

/**
 * Creates a did:jwk from the key members of a JWK, serialised with members in lexicographic order
 * (the order RFC 7638 uses), so the same key always gives the same DID.
 */
export function createDidJwk(jwk: PublicJwk, { padded = false } = {}): string {
  const key = toPublicJwk(jwk);
  const json =
    key.kty === 'EC'
      ? JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })
      : JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x });
  const encoded = base64UrlEncode(json);
  // `padded` exists to reproduce Inji Certify's form in tests and tamper scenarios.
  return `did:jwk:${padded ? encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=') : encoded}`;
}

export function resolveDidJwk(did: string): DidResolutionResult {
  if (!did.startsWith('did:jwk:')) throw new FormatError('DID_INVALID', `not a did:jwk: ${did}`);
  const value = did.slice('did:jwk:'.length);
  const padded = /=+$/.test(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecodeToString(value, { allowPadding: true }));
  } catch (cause) {
    throw new FormatError('DID_INVALID', 'did:jwk value is not base64url-encoded JSON', {
      cause,
      spec: 'did:jwk "Read" step 2-3 (decode base64url, parse the JWK)',
    });
  }
  if (!isRecord(parsed)) throw new FormatError('DID_INVALID', 'did:jwk value is not a JSON object');
  if ('d' in parsed) {
    throw new FormatError('DID_INVALID', 'did:jwk contains a private key member "d"', {
      spec: 'did:jwk "Create" step 1 (the JWK MUST NOT contain private key material)',
    });
  }
  let jwk: PublicJwk;
  try {
    jwk = toPublicJwk(parsed);
  } catch (cause) {
    throw new FormatError('DID_INVALID', 'did:jwk does not hold a supported public JWK', { cause });
  }
  const { kid: _kid, ...keyOnly } = jwk;
  const id = `${did}#0`;
  const relationships = relationshipsForUse(parsed.use);
  const didDocument: DidDocument = {
    '@context': [DID_CONTEXT_V1, JWS_2020_CONTEXT_V1],
    id: did,
    verificationMethod: [{ id, type: 'JsonWebKey2020', controller: did, publicKeyJwk: { ...keyOnly } }],
  };
  for (const relationship of relationships) didDocument[relationship] = [id];
  const canonicalDid = `did:jwk:${value.replace(/=+$/, '')}`;
  return {
    didDocument,
    didResolutionMetadata: padded
      ? {
          method: 'jwk',
          nonCanonical: true,
          canonicalDid,
          warnings: [
            `did:jwk carries base64 padding; the canonical form is ${canonicalDid} (${DID_JWK_PADDING_ISSUE})`,
          ],
        }
      : { method: 'jwk' },
  };
}

/** did:jwk "Create the DID Document": `use: sig` drops keyAgreement, `use: enc` keeps only it. */
function relationshipsForUse(
  use: unknown,
): (
  'authentication' | 'assertionMethod' | 'capabilityInvocation' | 'capabilityDelegation' | 'keyAgreement'
)[] {
  if (use === 'enc') return ['keyAgreement'];
  const signing = [
    'authentication',
    'assertionMethod',
    'capabilityInvocation',
    'capabilityDelegation',
  ] as const;
  return use === 'sig' ? [...signing] : [...signing, 'keyAgreement'];
}
