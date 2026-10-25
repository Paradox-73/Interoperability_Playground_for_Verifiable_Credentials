// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Tamper primitives for `mso_mdoc` (ISO/IEC 18013-5). Each takes base64url CBOR and returns base64url
 * CBOR a correct verifier must reject. Those that change issuer data work on an issued credential
 * (bare IssuerSigned or Inji Certify's `{docType, issuerSigned}`) and on a DeviceResponse alike.
 *
 * The holder's DeviceSignature covers the SessionTranscript, the docType and the device-signed
 * namespaces, but not the issuer-signed elements (ISO 18013-5 section 9.1.3.4). Changing an element
 * in a DeviceResponse therefore leaves the device signature valid, and only the MSO digest check
 * (section 9.3.1 step 4) can catch it.
 */
import type { KeyPair } from '../keys/keys.js';
import { generateKeyPair } from '../keys/keys.js';
import { createTestCertificate, type TestCertificate } from '../keys/x509.js';
import { asArray, asMap, decodeCbor, decodeTagged, encodeCbor, encodedCborTag } from '../mdoc/cbor.js';
import { COSE_HEADER, parseCoseSign1, signCoseSign1, x5chainHeader } from '../mdoc/cose.js';
import { decodeMdocBase64, encodeMdocBase64 } from '../mdoc/model.js';
import { signDeviceSigned } from '../mdoc/present.js';
import { flipByte } from './jws.js';

type CborMap = Map<unknown, unknown>;

function decodeTop(encoded: string): CborMap {
  return asMap(decodeCbor(decodeMdocBase64(encoded), 'mdoc'), 'mdoc');
}

function encodeTop(top: CborMap): string {
  return encodeMdocBase64(encodeCbor(top));
}

/** The IssuerSigned maps inside a credential (either encoding) or a DeviceResponse. */
function issuerSignedMaps(top: CborMap): CborMap[] {
  if (top.has('documents')) {
    return asArray(top.get('documents'), 'documents').map((document) =>
      asMap(asMap(document, 'Document').get('issuerSigned'), 'IssuerSigned'),
    );
  }
  if (top.has('issuerSigned')) return [asMap(top.get('issuerSigned'), 'IssuerSigned')];
  return [top];
}

/** Flips one byte of the issuerAuth signature (ISO 18013-5 section 9.3.1 step 2 must then fail). */
export function flipMdocIssuerSignature(encoded: string, index?: number): string {
  const top = decodeTop(encoded);
  for (const issuerSigned of issuerSignedMaps(top)) {
    // A tagged COSE_Sign1 (tag 18) loses its tag here; the verifier accepts both forms.
    const sign1 = parseCoseSign1(issuerSigned.get('issuerAuth'), 'issuerAuth');
    issuerSigned.set('issuerAuth', [
      sign1.protectedBytes,
      sign1.unprotectedHeader,
      sign1.payload ?? null,
      flipByte(sign1.signature, index),
    ]);
  }
  return encodeTop(top);
}

/**
 * Replaces the value of the first IssuerSignedItem named `elementIdentifier` (any namespace unless one
 * is given), keeping its digestID and random. Its digest no longer matches the MSO.
 */
export function alterMdocElement(
  encoded: string,
  elementIdentifier: string,
  value: unknown,
  namespace?: string,
): string {
  const top = decodeTop(encoded);
  let changed = false;
  for (const issuerSigned of issuerSignedMaps(top)) {
    for (const [name, items] of asMap(issuerSigned.get('nameSpaces'), 'nameSpaces')) {
      if (changed || (namespace !== undefined && name !== namespace)) continue;
      const list = asArray(items, 'IssuerSignedItems');
      const position = list.findIndex(
        (item) =>
          asMap(decodeTagged(item, 'IssuerSignedItemBytes'), 'item').get('elementIdentifier') ===
          elementIdentifier,
      );
      if (position < 0) continue;
      const item = asMap(decodeTagged(list[position], 'IssuerSignedItemBytes'), 'item');
      item.set('elementValue', value);
      list[position] = encodedCborTag(item);
      changed = true;
    }
  }
  if (!changed) throw new TypeError(`the mdoc has no element "${elementIdentifier}" to alter`);
  return encodeTop(top);
}

/** The element identifier of the first IssuerSignedItem, and its value (for scenarios that alter one). */
export function firstMdocElement(
  encoded: string,
): { namespace: string; elementIdentifier: string; value: unknown } | undefined {
  for (const issuerSigned of issuerSignedMaps(decodeTop(encoded))) {
    for (const [name, items] of asMap(issuerSigned.get('nameSpaces') ?? new Map(), 'nameSpaces')) {
      const first = asArray(items, 'IssuerSignedItems')[0];
      if (first === undefined) continue;
      const item = asMap(decodeTagged(first, 'IssuerSignedItemBytes'), 'item');
      return {
        namespace: String(name),
        elementIdentifier: String(item.get('elementIdentifier')),
        value: item.get('elementValue'),
      };
    }
  }
  return undefined;
}

/**
 * Appends an IssuerSignedItem the issuer never signed, under a digest id the MSO does not list
 * (section 9.3.1 step 4 rejects it). `namespace` defaults to the first one presented.
 */
export function addUnreferencedMdocElement(
  encoded: string,
  elementIdentifier: string,
  value: unknown,
  namespace?: string,
): string {
  const top = decodeTop(encoded);
  for (const issuerSigned of issuerSignedMaps(top)) {
    const nameSpaces = asMap(issuerSigned.get('nameSpaces') ?? new Map(), 'nameSpaces');
    const target = namespace ?? (nameSpaces.keys().next().value as string | undefined);
    if (target === undefined) throw new TypeError('the mdoc presents no namespace to add an element to');
    const items = [...asArray(nameSpaces.get(target) ?? [], 'IssuerSignedItems')];
    const used = items.map((item) =>
      Number(asMap(decodeTagged(item, 'IssuerSignedItemBytes'), 'item').get('digestID')),
    );
    items.push(
      encodedCborTag(
        new Map<string, unknown>([
          ['digestID', Math.max(-1, ...used) + 1000],
          ['random', new Uint8Array(16)],
          ['elementIdentifier', elementIdentifier],
          ['elementValue', value],
        ]),
      ),
    );
    nameSpaces.set(target, items);
    issuerSigned.set('nameSpaces', nameSpaces);
  }
  return encodeTop(top);
}

/**
 * Signs the DeviceAuth of every document of a DeviceResponse again with `deviceKey` over
 * `sessionTranscript`. With the holder's key and another request's transcript this is a presentation
 * bound to another nonce or verifier; with another key, one presented by someone who is not the holder
 * (section 9.1.3.6 then fails either way).
 */
export function resignMdocDeviceSignature(
  deviceResponse: string,
  sessionTranscript: unknown[],
  deviceKey: KeyPair,
): string {
  const top = decodeTop(deviceResponse);
  for (const document of asArray(top.get('documents'), 'documents')) {
    const map = asMap(document, 'Document');
    map.set('deviceSigned', signDeviceSigned(sessionTranscript, String(map.get('docType')), deviceKey));
  }
  return encodeTop(top);
}

export interface ForgedMdoc {
  /** The forged credential, in the encoding of the input. */
  credential: string;
  keyPair: KeyPair;
  certificate: TestCertificate;
}

/**
 * Signs the MSO again with the forger's own key, named by a self-signed certificate in `x5chain`.
 * Elements, docType and deviceKey stay, so the holder can still present it; a verifier must reject
 * it because the chain does not end at a trust anchor (section 9.3.1 step 1).
 */
export async function forgeMdocWithSelfSignedX5chain(
  credential: string,
  options: { keyPair?: KeyPair; subject?: string } = {},
): Promise<ForgedMdoc> {
  const keyPair = options.keyPair ?? generateKeyPair('ES256');
  const certificate = await createTestCertificate({
    subject:
      options.subject ?? 'CN=Forged Document Signer, O=Inji Interop Playground tamper test (test only)',
    keyPair,
  });
  const top = decodeTop(credential);
  for (const issuerSigned of issuerSignedMaps(top)) {
    const original = parseCoseSign1(issuerSigned.get('issuerAuth'), 'issuerAuth');
    issuerSigned.set(
      'issuerAuth',
      signCoseSign1({
        keyPair,
        payload: original.payload!,
        unprotected: new Map([[COSE_HEADER.x5chain, x5chainHeader([certificate.x5c])]]),
      }),
    );
  }
  return { credential: encodeTop(top), keyPair, certificate };
}
