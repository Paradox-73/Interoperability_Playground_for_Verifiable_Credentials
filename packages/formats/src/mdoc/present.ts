// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Holder side of ISO/IEC 18013-5: a DeviceResponse (section 8.3.2.1.2.2) with the requested elements
 * only and mdoc authentication by DeviceSignature (section 9.1.3.6): a COSE_Sign1 with a detached
 * payload, signed by the device key the MSO names, over
 * `DeviceAuthenticationBytes = #6.24(bstr .cbor ["DeviceAuthentication", SessionTranscript, DocType, DeviceNameSpacesBytes])`
 * (section 9.1.3.4).
 *
 * Selective disclosure is done by leaving IssuerSignedItems out; the issuer's signature over the MSO
 * still covers the ones that remain (section 9.1.2.4).
 */
import { FormatError } from '../errors.js';
import type { KeyPair } from '../keys/keys.js';
import { encodeCbor, encodedCborTag, type CborTag } from './cbor.js';
import { signCoseSign1 } from './cose.js';
import {
  decodeMdocCredential,
  encodeMdocBase64,
  type IssuerSignedItem,
  type MdocCredential,
} from './model.js';

/** A namespace and element identifier, the path DCQL (`[namespace, element]`) and PE fields name. */
export type MdocElementPath = readonly [namespace: string, elementIdentifier: string];

export interface PresentMdocOptions {
  /** The issued credential (base64url, either accepted encoding) or an already decoded one. */
  credential: string | MdocCredential;
  /** Elements to disclose; `all` (default) discloses every element the wallet holds. */
  disclose?: readonly MdocElementPath[] | 'all';
  /** The holder's P-256 key; must be the MSO's device key for the presentation to verify. */
  deviceKey: KeyPair;
  /** From `mdocSessionTranscript()`. */
  sessionTranscript: unknown[];
}

/** DeviceAuthenticationBytes over an empty DeviceNameSpaces (no device-signed elements). */
export function deviceAuthenticationBytes(
  sessionTranscript: unknown[],
  docType: string,
  deviceNameSpacesBytes: InstanceType<typeof CborTag> = encodedCborTag(new Map()),
): Uint8Array {
  return encodeCbor(
    encodedCborTag(['DeviceAuthentication', sessionTranscript, docType, deviceNameSpacesBytes]),
  );
}

/** DeviceSigned with a DeviceSignature by `deviceKey` (detached payload, section 9.1.3.6). */
export function signDeviceSigned(
  sessionTranscript: unknown[],
  docType: string,
  deviceKey: KeyPair,
): Map<string, unknown> {
  const nameSpaces = encodedCborTag(new Map());
  const deviceSignature = signCoseSign1({
    keyPair: deviceKey,
    payload: deviceAuthenticationBytes(sessionTranscript, docType, nameSpaces),
    detached: true,
  });
  return new Map<string, unknown>([
    ['nameSpaces', nameSpaces],
    ['deviceAuth', new Map([['deviceSignature', deviceSignature]])],
  ]);
}

/** Builds a DeviceResponse with one document and returns it base64url-encoded (the `vp_token` value). */
export function presentMdoc(options: PresentMdocOptions): string {
  const credential =
    typeof options.credential === 'string' ? decodeMdocCredential(options.credential) : options.credential;
  const { docType, issuerSigned } = credential;
  const disclose = options.disclose ?? 'all';
  const nameSpaces = new Map<string, unknown[]>();
  const missing: string[] = [];
  if (disclose === 'all') {
    for (const [namespace, items] of issuerSigned.nameSpaces) {
      nameSpaces.set(
        namespace,
        items.map((item) => item.tagged),
      );
    }
  } else {
    for (const [namespace, element] of disclose) {
      const item: IssuerSignedItem | undefined = issuerSigned.nameSpaces
        .get(namespace)
        ?.find((candidate) => candidate.elementIdentifier === element);
      if (!item) {
        missing.push(`${namespace}/${element}`);
        continue;
      }
      const list = nameSpaces.get(namespace) ?? [];
      if (!list.includes(item.tagged)) list.push(item.tagged);
      nameSpaces.set(namespace, list);
    }
  }
  if (missing.length > 0) {
    throw new FormatError('MDOC_ELEMENT_MISSING', `the mdoc holds no ${missing.join(', ')}`, {
      details: { missing },
    });
  }
  const document = new Map<string, unknown>([
    ['docType', docType],
    [
      'issuerSigned',
      new Map<string, unknown>([
        ['nameSpaces', nameSpaces],
        ['issuerAuth', issuerSigned.issuerAuthValue],
      ]),
    ],
    ['deviceSigned', signDeviceSigned(options.sessionTranscript, docType, options.deviceKey)],
  ]);
  const response = new Map<string, unknown>([
    ['version', '1.0'],
    ['documents', [document]],
    ['status', 0],
  ]);
  return encodeMdocBase64(encodeCbor(response));
}
