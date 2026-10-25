// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Verifier side of ISO/IEC 18013-5 for a DeviceResponse received over OpenID4VP. For each document,
 * in this order (section 9.3.1, "Inspection procedure for issuer data authentication", and 9.1.3,
 * "mdoc authentication"):
 * 1. the document's docType equals the MSO's docType (and the expected one, when given);
 * 2. the `x5chain` in issuerAuth is a valid chain that ends at a trust anchor, and its leaf key
 *    verifies the issuerAuth COSE_Sign1 (ES256);
 * 3. every presented IssuerSignedItem's digest equals the MSO's value digest of its namespace and
 *    digest id;
 * 4. `validityInfo`: validFrom <= now <= validUntil (an expired mdoc is `MDOC_EXPIRED`, checked after
 *    the signature so a report can say "valid but expired");
 * 5. the DeviceSignature verifies with the MSO's deviceKey over DeviceAuthenticationBytes built from
 *    the verifier's own SessionTranscript, which binds the response to this request's nonce, client_id
 *    and response_uri.
 * The first failing check throws a `FormatError`.
 */
import { FormatError } from '../errors.js';
import type { PublicJwk } from '../keys/keys.js';
import { validateX5c } from '../keys/x509.js';
import { asArray, asMap, asText, decodeCbor, taggedBytes } from './cbor.js';
import { coseAlgorithm, parseCoseSign1, verifyCoseSign1, x5chainOf, COSE_ALG_ES256 } from './cose.js';
import {
  decodeMdocBase64,
  issuerSignedItemDigest,
  mdocClaims,
  parseIssuerSigned,
  type ValidityInfo,
} from './model.js';
import { deviceAuthenticationBytes } from './present.js';

export interface VerifyMdocOptions {
  /** The SessionTranscript the verifier computed for its own request (`mdocSessionTranscript()`). */
  sessionTranscript: unknown[];
  /** Trust anchors (IACA or document signer certificates), base64 DER or PEM. */
  trustAnchors?: readonly string[];
  /** Reject a chain that does not end at a trust anchor. Default true. */
  requireTrusted?: boolean;
  /** Accepted docTypes; default any. */
  expectedDocType?: string | readonly string[];
  now?: Date;
  /** Tolerance for clock differences, in seconds. Default 60. */
  clockSkewSeconds?: number;
}

export interface MdocDocumentVerification {
  docType: string;
  /** Disclosed elements by namespace, as JSON. */
  claims: Record<string, Record<string, unknown>>;
  /** Subject of the document signer certificate (leaf of x5chain). */
  issuer: string;
  /** Whether the chain ends at a configured trust anchor. */
  trusted: boolean;
  issuerJwk: PublicJwk;
  deviceKey: PublicJwk;
  validity: ValidityInfo;
  /** COSE algorithm name of the issuer signature. */
  alg: 'ES256';
}

export interface MdocVerification {
  documents: MdocDocumentVerification[];
  warnings: string[];
}

const spec = (section: string): string => `ISO/IEC 18013-5 section ${section}`;

/** Verifies a base64url DeviceResponse (the `vp_token` value of an mso_mdoc presentation). */
export async function verifyMdocDeviceResponse(
  encoded: string,
  options: VerifyMdocOptions,
): Promise<MdocVerification> {
  const response = asMap(decodeCbor(decodeMdocBase64(encoded), 'DeviceResponse'), 'DeviceResponse');
  const warnings: string[] = [];
  const status = response.get('status');
  if (status !== 0) {
    throw new FormatError('MDOC_MALFORMED', `DeviceResponse status is ${String(status)}, not 0 (OK)`, {
      spec: spec('8.3.2.1.2.3'),
      details: { status },
    });
  }
  const documents = asArray(response.get('documents') ?? [], 'DeviceResponse documents');
  if (documents.length === 0) {
    throw new FormatError('MDOC_MALFORMED', 'DeviceResponse holds no document', {
      spec: spec('8.3.2.1.2.2'),
    });
  }
  const verified: MdocDocumentVerification[] = [];
  for (const document of documents) {
    verified.push(await verifyDocument(asMap(document, 'Document'), options, warnings));
  }
  return { documents: verified, warnings };
}

async function verifyDocument(
  document: Map<unknown, unknown>,
  options: VerifyMdocOptions,
  warnings: string[],
): Promise<MdocDocumentVerification> {
  const now = options.now ?? new Date();
  const skewMs = (options.clockSkewSeconds ?? 60) * 1000;
  const docType = asText(document.get('docType'), 'Document docType');
  const issuerSigned = parseIssuerSigned(document.get('issuerSigned'));
  const { mso, issuerAuth } = issuerSigned;

  // 1. docType (section 9.3.1 step 5).
  if (mso.docType !== docType) {
    throw new FormatError(
      'MDOC_DOCTYPE_MISMATCH',
      `document docType ${docType} differs from the MSO's ${mso.docType}`,
      {
        spec: spec('9.3.1 step 5'),
        details: { document: docType, mso: mso.docType },
      },
    );
  }
  if (options.expectedDocType !== undefined) {
    const expected =
      typeof options.expectedDocType === 'string' ? [options.expectedDocType] : options.expectedDocType;
    if (!expected.includes(docType)) {
      throw new FormatError(
        'MDOC_DOCTYPE_MISMATCH',
        `docType ${docType} is not one of ${expected.join(', ')}`,
        {
          spec: spec('9.3.1 step 5'),
          details: { docType, expected },
        },
      );
    }
  }

  // 2. Issuer certificate chain and signature (section 9.3.1 steps 1-3).
  if (coseAlgorithm(issuerAuth) !== COSE_ALG_ES256) {
    throw new FormatError(
      'MDOC_ALG_REJECTED',
      `issuerAuth alg ${String(coseAlgorithm(issuerAuth))} is not ES256 (-7)`,
      {
        spec: spec('9.1.2.4'),
      },
    );
  }
  const chain = x5chainOf(issuerAuth);
  if (chain === undefined) {
    throw new FormatError('X5C_INVALID', 'issuerAuth carries no x5chain (header label 33)', {
      spec: `${spec('9.1.2.4')}; RFC 9360 section 2`,
    });
  }
  const validation = await validateX5c(chain, {
    now,
    ...(options.trustAnchors ? { trustAnchors: [...options.trustAnchors] } : {}),
  });
  if ((options.requireTrusted ?? true) && !validation.trusted) {
    throw new FormatError(
      'X5C_UNTRUSTED',
      `x5chain for ${validation.leafSubject} does not end at a trust anchor`,
      {
        spec: spec('9.3.1 step 1'),
      },
    );
  }
  if (!validation.trusted)
    warnings.push(`x5chain for ${validation.leafSubject} is not anchored; accepted by policy`);
  if (!verifyCoseSign1(issuerAuth, validation.leafJwk)) {
    throw new FormatError(
      'MDOC_ISSUER_SIGNATURE_INVALID',
      'issuerAuth signature does not verify with the x5chain leaf key',
      {
        spec: spec('9.3.1 step 2'),
        details: { issuer: validation.leafSubject },
      },
    );
  }

  // 3. Value digests (section 9.3.1 step 4).
  for (const [namespace, items] of issuerSigned.nameSpaces) {
    const digests = mso.valueDigests.get(namespace);
    for (const item of items) {
      const expected = digests?.get(item.digestId);
      const actual = issuerSignedItemDigest(item, mso.digestAlgorithm);
      if (!expected || Buffer.compare(Buffer.from(expected), Buffer.from(actual)) !== 0) {
        throw new FormatError(
          'MDOC_DIGEST_MISMATCH',
          `element ${namespace}/${item.elementIdentifier} does not match the MSO digest ${item.digestId}`,
          {
            spec: spec('9.3.1 step 4'),
            details: {
              namespace,
              elementIdentifier: item.elementIdentifier,
              digestID: item.digestId,
              inMso: expected !== undefined,
            },
          },
        );
      }
    }
  }

  // 4. Validity (section 9.3.1 step 6).
  const { validFrom, validUntil } = mso.validityInfo;
  if (now.getTime() - skewMs > validUntil.getTime()) {
    throw new FormatError('MDOC_EXPIRED', `mdoc expired at ${validUntil.toISOString()}`, {
      spec: spec('9.3.1 step 6 (validityInfo.validUntil)'),
      details: { validUntil: validUntil.toISOString(), now: now.toISOString() },
    });
  }
  if (now.getTime() + skewMs < validFrom.getTime()) {
    throw new FormatError('MDOC_NOT_YET_VALID', `mdoc not valid before ${validFrom.toISOString()}`, {
      spec: spec('9.3.1 step 6 (validityInfo.validFrom)'),
      details: { validFrom: validFrom.toISOString(), now: now.toISOString() },
    });
  }

  // 5. mdoc authentication (section 9.1.3).
  const deviceSigned = document.get('deviceSigned');
  if (deviceSigned === undefined) {
    throw new FormatError(
      'MDOC_DEVICE_SIGNATURE_INVALID',
      'the document has no deviceSigned (no mdoc authentication)',
      {
        spec: spec('9.1.3'),
      },
    );
  }
  const deviceMap = asMap(deviceSigned, 'DeviceSigned');
  const deviceNameSpaces = deviceMap.get('nameSpaces');
  taggedBytes(deviceNameSpaces, 'DeviceNameSpacesBytes');
  const deviceAuth = asMap(deviceMap.get('deviceAuth'), 'DeviceAuth');
  if (!deviceAuth.has('deviceSignature')) {
    throw new FormatError(
      'MDOC_DEVICE_SIGNATURE_INVALID',
      deviceAuth.has('deviceMac')
        ? 'deviceMac needs a session key from proximity engagement; over OpenID4VP only deviceSignature is accepted'
        : 'deviceAuth has no deviceSignature',
      { spec: spec('9.1.3.6') },
    );
  }
  const deviceSignature = parseCoseSign1(deviceAuth.get('deviceSignature'), 'deviceSignature');
  const payload = deviceAuthenticationBytes(
    options.sessionTranscript,
    docType,
    deviceNameSpaces as Parameters<typeof deviceAuthenticationBytes>[2],
  );
  if (deviceSignature.payload !== undefined)
    warnings.push('deviceSignature carries its payload; it should be detached');
  if (!verifyCoseSign1({ ...deviceSignature, payload: undefined }, mso.deviceKey, payload)) {
    throw new FormatError(
      'MDOC_DEVICE_SIGNATURE_INVALID',
      "deviceSignature does not verify with the MSO deviceKey over this request's SessionTranscript (nonce, client_id, response_uri)",
      { spec: `${spec('9.1.3.4 and 9.1.3.6')}; OpenID4VP 1.0 Appendix B.2.6` },
    );
  }

  // Last, so that a run shows every check above passing: the structure ISO/IEC 18013-5 requires. A reader
  // that decodes MobileSecurityObjectBytes and tdate strictly rejects such an mdoc outright.
  if (issuerSigned.deviations.length > 0) {
    throw new FormatError(
      'MDOC_MALFORMED',
      `the mdoc departs from ISO/IEC 18013-5 (issuer signature, value digests, validity and device signature verified): ${issuerSigned.deviations.join('; ')}`,
      { spec: spec('9.1.2.4'), details: { deviations: issuerSigned.deviations } },
    );
  }

  return {
    docType,
    claims: mdocClaims(issuerSigned.nameSpaces),
    issuer: validation.leafSubject,
    trusted: validation.trusted,
    issuerJwk: validation.leafJwk,
    deviceKey: mso.deviceKey,
    validity: mso.validityInfo,
    alg: 'ES256',
  };
}
