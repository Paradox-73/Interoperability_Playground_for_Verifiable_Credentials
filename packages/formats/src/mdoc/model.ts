// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Reading ISO/IEC 18013-5 structures: IssuerSigned (section 8.3.2.1.2.2), the Mobile Security Object
 * (section 9.1.2.4) and DeviceResponse (section 8.3.2.1.2.2), from the base64url text OpenID4VCI and
 * OpenID4VP carry.
 *
 * Two credential encodings are accepted:
 * - OpenID4VCI 1.0 Appendix A.2.4: `credential` is the base64url CBOR of `IssuerSigned`.
 * - Inji Certify 0.14.0: base64url CBOR of a map `{"docType": ..., "issuerSigned": IssuerSigned}`.
 */
import { createHash } from 'node:crypto';
import { FormatError } from '../errors.js';
import type { PublicJwk } from '../keys/keys.js';
import {
  CborTag,
  asArray,
  asBytes,
  asMap,
  asText,
  cborToJson,
  decodeCbor,
  decodeTagged,
  encodeCbor,
  readDate,
  taggedBytes,
} from './cbor.js';
import { certificateSubject } from '../keys/x509.js';
import {
  COSE_ALG_ES256,
  coseAlgorithm,
  coseKeyToJwk,
  parseCoseSign1,
  x5chainOf,
  type CoseSign1,
} from './cose.js';

/** Format identifier of OpenID4VCI 1.0 Appendix A.2 and OpenID4VP 1.0 Appendix B.2. */
export const MSO_MDOC_FORMAT = 'mso_mdoc';

/** One IssuerSignedItem (ISO 18013-5 section 8.3.2.1.2.2) with the tag 24 item it came in. */
export interface IssuerSignedItem {
  digestId: number;
  random: Uint8Array;
  elementIdentifier: string;
  elementValue: unknown;
  /** The `#6.24` item as received; its encoding is what the MSO digest covers. */
  tagged: InstanceType<typeof CborTag>;
}

export interface ValidityInfo {
  signed: Date;
  validFrom: Date;
  validUntil: Date;
  expectedUpdate?: Date;
}

/** MobileSecurityObject (ISO 18013-5 section 9.1.2.4). */
export interface MobileSecurityObject {
  version: string;
  digestAlgorithm: string;
  /** Namespace -> digest id -> digest. */
  valueDigests: Map<string, Map<number, Uint8Array>>;
  deviceKey: PublicJwk;
  docType: string;
  validityInfo: ValidityInfo;
}

export interface ParsedIssuerSigned {
  /** Namespace -> items, in the order received. */
  nameSpaces: Map<string, IssuerSignedItem[]>;
  issuerAuth: CoseSign1;
  /** The COSE_Sign1 array as received, so a presentation can copy it unchanged. */
  issuerAuthValue: unknown;
  mso: MobileSecurityObject;
  /**
   * Where the IssuerSigned departs from ISO/IEC 18013-5 in a way this reader can still read (an MSO without
   * its tag 24, validity dates as plain text, no `signed` date), for example Inji Certify 0.14.0's. A wallet
   * holds and presents such an mdoc; the verifier fails it on these.
   */
  deviations: string[];
}

/** An issued mdoc as a wallet holds it. */
export interface MdocCredential {
  docType: string;
  issuerSigned: ParsedIssuerSigned;
  /** `openid4vci` (bare IssuerSigned) or `inji-certify` (`{docType, issuerSigned}`). */
  encoding: 'openid4vci' | 'inji-certify';
}

/**
 * Decodes base64url (padding and the base64 alphabet tolerated: issuers differ). Anything that is not
 * base64 at all is `MDOC_MALFORMED`.
 */
export function decodeMdocBase64(text: string): Uint8Array {
  const body = text.trim().replace(/=+$/, '');
  if (body.length === 0 || !/^[A-Za-z0-9+/_-]+$/.test(body) || body.length % 4 === 1) {
    throw new FormatError('MDOC_MALFORMED', 'an mdoc must be base64url-encoded CBOR', {
      spec: 'OpenID4VCI 1.0 Appendix A.2.4; OpenID4VP 1.0 Appendix B.2.6',
    });
  }
  return new Uint8Array(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

export function encodeMdocBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** Reads an issued mdoc in either accepted encoding. */
export function decodeMdocCredential(text: string): MdocCredential {
  const top = asMap(decodeCbor(decodeMdocBase64(text), 'mdoc credential'), 'mdoc credential');
  if (top.has('issuerSigned')) {
    const issuerSigned = parseIssuerSigned(top.get('issuerSigned'));
    const docType = top.has('docType') ? asText(top.get('docType'), 'docType') : issuerSigned.mso.docType;
    return { docType, issuerSigned, encoding: 'inji-certify' };
  }
  const issuerSigned = parseIssuerSigned(top);
  return { docType: issuerSigned.mso.docType, issuerSigned, encoding: 'openid4vci' };
}

/** Parses IssuerSigned and the MSO inside its issuerAuth (no signature or digest check here). */
export function parseIssuerSigned(value: unknown): ParsedIssuerSigned {
  const map = asMap(value, 'IssuerSigned');
  const issuerAuthValue = map.get('issuerAuth');
  if (issuerAuthValue === undefined) {
    throw new FormatError('MDOC_MALFORMED', 'IssuerSigned has no issuerAuth', {
      spec: 'ISO/IEC 18013-5 section 8.3.2.1.2.2',
    });
  }
  const issuerAuth = parseCoseSign1(issuerAuthValue, 'issuerAuth');
  if (issuerAuth.payload === undefined) {
    throw new FormatError('MDOC_MALFORMED', 'issuerAuth has no payload (MobileSecurityObjectBytes)', {
      spec: 'ISO/IEC 18013-5 section 9.1.2.4',
    });
  }
  // The payload is MobileSecurityObjectBytes = #6.24(bstr .cbor MobileSecurityObject).
  const deviations: string[] = [];
  const payload = decodeCbor(issuerAuth.payload, 'MSO');
  let msoValue: unknown;
  if (payload instanceof CborTag) {
    msoValue = decodeTagged(payload, 'MobileSecurityObjectBytes');
  } else if (payload instanceof Map) {
    deviations.push(
      'the issuerAuth payload is the MobileSecurityObject itself, not MobileSecurityObjectBytes #6.24(bstr .cbor MobileSecurityObject) (ISO/IEC 18013-5 section 9.1.2.4)',
    );
    msoValue = payload;
  } else {
    msoValue = decodeTagged(payload, 'MobileSecurityObjectBytes');
  }
  const mso = parseMso(msoValue, deviations);
  const nameSpaces = new Map<string, IssuerSignedItem[]>();
  const rawNameSpaces = map.get('nameSpaces');
  if (rawNameSpaces !== undefined) {
    for (const [namespace, items] of asMap(rawNameSpaces, 'IssuerNameSpaces')) {
      nameSpaces.set(
        asText(namespace, 'namespace'),
        asArray(items, `IssuerNameSpaces[${String(namespace)}]`).map(parseIssuerSignedItem),
      );
    }
  }
  return { nameSpaces, issuerAuth, issuerAuthValue, mso, deviations };
}

function parseIssuerSignedItem(value: unknown): IssuerSignedItem {
  if (!(value instanceof CborTag)) taggedBytes(value, 'IssuerSignedItemBytes');
  const item = asMap(decodeTagged(value, 'IssuerSignedItemBytes'), 'IssuerSignedItem');
  const digestId = item.get('digestID');
  if (typeof digestId !== 'number' || !Number.isInteger(digestId) || digestId < 0) {
    throw new FormatError('MDOC_MALFORMED', 'IssuerSignedItem digestID must be an unsigned integer', {
      spec: 'ISO/IEC 18013-5 section 8.3.2.1.2.2',
    });
  }
  return {
    digestId,
    random: asBytes(item.get('random'), 'IssuerSignedItem random'),
    elementIdentifier: asText(item.get('elementIdentifier'), 'elementIdentifier'),
    elementValue: item.get('elementValue'),
    tagged: value as InstanceType<typeof CborTag>,
  };
}

/** A tdate, or a plain RFC 3339 text (recorded as a deviation). */
function readValidityDate(value: unknown, what: string, deviations: string[]): Date {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      deviations.push(`${what} is a text string, not a tdate #6.0(tstr) (ISO/IEC 18013-5 section 9.1.2.4)`);
      return date;
    }
  }
  return readDate(value, what);
}

function parseMso(value: unknown, deviations: string[] = []): MobileSecurityObject {
  const map = asMap(value, 'MobileSecurityObject');
  const valueDigests = new Map<string, Map<number, Uint8Array>>();
  for (const [namespace, digests] of asMap(map.get('valueDigests'), 'valueDigests')) {
    const byId = new Map<number, Uint8Array>();
    for (const [id, digest] of asMap(digests, 'DigestIDs')) {
      byId.set(Number(id), asBytes(digest, 'digest'));
    }
    valueDigests.set(asText(namespace, 'namespace'), byId);
  }
  const deviceKeyInfo = asMap(map.get('deviceKeyInfo'), 'deviceKeyInfo');
  const validity = asMap(map.get('validityInfo'), 'validityInfo');
  return {
    version: asText(map.get('version'), 'MSO version'),
    digestAlgorithm: asText(map.get('digestAlgorithm'), 'digestAlgorithm'),
    valueDigests,
    deviceKey: coseKeyToJwk(deviceKeyInfo.get('deviceKey')),
    docType: asText(map.get('docType'), 'MSO docType'),
    validityInfo: {
      signed: validity.has('signed')
        ? readValidityDate(validity.get('signed'), 'validityInfo.signed', deviations)
        : (deviations.push('validityInfo has no signed date (ISO/IEC 18013-5 section 9.1.2.4)'),
          readValidityDate(validity.get('validFrom'), 'validityInfo.validFrom', [])),
      validFrom: readValidityDate(validity.get('validFrom'), 'validityInfo.validFrom', deviations),
      validUntil: readValidityDate(validity.get('validUntil'), 'validityInfo.validUntil', deviations),
      ...(validity.has('expectedUpdate')
        ? { expectedUpdate: readDate(validity.get('expectedUpdate'), 'validityInfo.expectedUpdate') }
        : {}),
    },
  };
}

const DIGEST_ALGORITHMS: Record<string, string> = {
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
};

/** Digest of an IssuerSignedItemBytes (ISO 18013-5 section 9.1.2.5): over the tag 24 item's encoding. */
export function issuerSignedItemDigest(
  item: Pick<IssuerSignedItem, 'tagged'>,
  algorithm: string,
): Uint8Array {
  const name = DIGEST_ALGORITHMS[algorithm];
  if (name === undefined) {
    throw new FormatError('MDOC_ALG_REJECTED', `digestAlgorithm ${algorithm} is not supported`, {
      spec: 'ISO/IEC 18013-5 section 9.1.2.5 (SHA-256, SHA-384, SHA-512)',
    });
  }
  return new Uint8Array(createHash(name).update(encodeCbor(item.tagged)).digest());
}

/** Element values by namespace, as JSON (the shape DCQL and Presentation Exchange paths address). */
export function mdocClaims(
  nameSpaces: Map<string, IssuerSignedItem[]>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [namespace, items] of nameSpaces) {
    const elements: Record<string, unknown> = {};
    for (const item of items) elements[item.elementIdentifier] = cborToJson(item.elementValue);
    out[namespace] = elements;
  }
  return out;
}

/**
 * A readable JSON view of any mdoc text (IssuerSigned, Inji Certify's wrapper or a DeviceResponse) for
 * the inspector and reports: tag 24 items decoded, byte strings base64url. Throws `MDOC_MALFORMED`
 * when the text is not base64url CBOR.
 */
export function mdocToJson(text: string): unknown {
  const decoded = decodeCbor(decodeMdocBase64(text), 'mdoc');
  const json = cborToJson(decoded);
  // The MSO travels as a byte string inside issuerAuth; decode it too, it is what the issuer signed.
  const expand = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node !== 'object' || node === null) return node;
    const out: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(node)) {
      if (key === 'issuerAuth' && Array.isArray(member) && typeof member[2] === 'string') {
        out[key] = member;
        try {
          out.mobileSecurityObject = cborToJson(
            decodeTagged(decodeCbor(decodeMdocBase64(member[2]), 'MSO'), 'MobileSecurityObjectBytes'),
          );
        } catch {
          // Leave the payload as base64url when it is not an MSO.
        }
      } else {
        out[key] = expand(member);
      }
    }
    return out;
  };
  return expand(json);
}

/** Facts about an issued mdoc for a run report: docType, signature algorithm, document signer subject. */
export interface MdocIssuerFacts {
  docType: string;
  /** `ES256` for COSE alg -7; otherwise the COSE identifier as text. */
  alg: string;
  /** Subject of the first x5chain certificate, when there is one. */
  issuer?: string;
}

/** Reads the facts of an mdoc (either credential encoding) without checking any signature. */
export function mdocIssuerFacts(text: string): MdocIssuerFacts {
  const { docType, issuerSigned } = decodeMdocCredential(text);
  const alg = coseAlgorithm(issuerSigned.issuerAuth);
  const chain = x5chainOf(issuerSigned.issuerAuth);
  return {
    docType,
    alg: alg === COSE_ALG_ES256 ? 'ES256' : String(alg),
    ...(chain?.[0] ? { issuer: certificateSubject(chain[0]) } : {}),
  };
}
