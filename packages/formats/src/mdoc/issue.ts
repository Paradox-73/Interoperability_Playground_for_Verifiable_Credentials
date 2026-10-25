// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Issuer side of ISO/IEC 18013-5: an IssuerSigned structure whose Mobile Security Object is signed
 * in a COSE_Sign1 (ES256) with the document signer certificate in `x5chain` (section 9.1.2.4).
 *
 * Every element becomes an IssuerSignedItem with a fresh 16-byte random (section 9.1.2.5 asks for at
 * least 16 bytes) and a digest id; digest ids are a random permutation per namespace so their order
 * reveals nothing about the elements.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { FormatError } from '../errors.js';
import type { KeyPair, PublicJwk } from '../keys/keys.js';
import { encodeCbor, encodedCborTag, tdate } from './cbor.js';
import { COSE_HEADER, jwkToCoseKey, signCoseSign1, x5chainHeader } from './cose.js';
import { encodeMdocBase64, issuerSignedItemDigest } from './model.js';

export interface IssueMdocOptions {
  docType: string;
  /** Namespace -> element identifier -> value (text, numbers, booleans, byte strings, nested maps). */
  nameSpaces: Record<string, Record<string, unknown>>;
  /** Document signer key (P-256, ES256). */
  issuerKey: KeyPair;
  /** Document signer certificate chain, base64 DER, leaf first (the IACA root is left out). */
  x5chain: readonly string[];
  /** The holder's P-256 key, from the key proof (deviceKeyInfo.deviceKey). */
  deviceKey: PublicJwk;
  validFrom: Date;
  validUntil: Date;
  /** Default: now. */
  signed?: Date;
  /** `openid4vci` (default): bare IssuerSigned; `inji-certify`: `{docType, issuerSigned}` as Certify 0.14.0 sends. */
  encoding?: 'openid4vci' | 'inji-certify';
}

/** Issues an mdoc and returns it base64url-encoded, as the `credential` of a credential response. */
export function issueMdoc(options: IssueMdocOptions): string {
  if (options.validUntil.getTime() <= options.validFrom.getTime()) {
    throw new FormatError('MDOC_MALFORMED', 'validUntil must be after validFrom', {
      spec: 'ISO/IEC 18013-5 section 9.1.2.4 (ValidityInfo)',
    });
  }
  const digestAlgorithm = 'SHA-256';
  const issuerNameSpaces = new Map<string, unknown[]>();
  const valueDigests = new Map<string, Map<number, Uint8Array>>();
  for (const [namespace, elements] of Object.entries(options.nameSpaces)) {
    const entries = Object.entries(elements);
    const ids = shuffledIds(entries.length);
    const items: unknown[] = [];
    const digests = new Map<number, Uint8Array>();
    entries.forEach(([elementIdentifier, elementValue], index) => {
      const digestId = ids[index]!;
      const tagged = encodedCborTag(
        new Map<string, unknown>([
          ['digestID', digestId],
          ['random', new Uint8Array(randomBytes(16))],
          ['elementIdentifier', elementIdentifier],
          ['elementValue', elementValue],
        ]),
      );
      items.push(tagged);
      digests.set(digestId, issuerSignedItemDigest({ tagged }, digestAlgorithm));
    });
    issuerNameSpaces.set(namespace, items);
    valueDigests.set(namespace, digests);
  }

  const mso = new Map<string, unknown>([
    ['version', '1.0'],
    ['digestAlgorithm', digestAlgorithm],
    ['valueDigests', valueDigests],
    ['deviceKeyInfo', new Map([['deviceKey', jwkToCoseKey(options.deviceKey)]])],
    ['docType', options.docType],
    [
      'validityInfo',
      new Map([
        ['signed', tdate(options.signed ?? new Date())],
        ['validFrom', tdate(options.validFrom)],
        ['validUntil', tdate(options.validUntil)],
      ]),
    ],
  ]);
  const issuerAuth = signCoseSign1({
    keyPair: options.issuerKey,
    // COSE payload = MobileSecurityObjectBytes = #6.24(bstr .cbor MobileSecurityObject).
    payload: encodeCbor(encodedCborTag(mso)),
    unprotected: new Map([[COSE_HEADER.x5chain, x5chainHeader(options.x5chain)]]),
  });
  const issuerSigned = new Map<string, unknown>([
    ['nameSpaces', issuerNameSpaces],
    ['issuerAuth', issuerAuth],
  ]);
  const top =
    options.encoding === 'inji-certify'
      ? new Map<string, unknown>([
          ['docType', options.docType],
          ['issuerSigned', issuerSigned],
        ])
      : issuerSigned;
  return encodeMdocBase64(encodeCbor(top));
}

function shuffledIds(count: number): number[] {
  const ids = Array.from({ length: count }, (_, index) => index);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
  }
  return ids;
}
