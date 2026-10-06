import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createTestCertificate,
  decodeCbor,
  decodeMdocCredential,
  encodeCbor,
  FormatError,
  generateKeyPair,
  issueMdoc,
  mdocIssuerFacts,
  mdocSessionTranscript,
  mdocToJson,
  presentMdoc,
  verifyMdocDeviceResponse,
  type KeyPair,
  type MdocSessionTranscriptInput,
  type TestCertificate,
  type VerifyMdocOptions,
} from '../src/index.js';
import {
  addUnreferencedMdocElement,
  alterMdocElement,
  firstMdocElement,
  flipMdocIssuerSignature,
  forgeMdocWithSelfSignedX5chain,
  resignMdocDeviceSignature,
} from '../src/tamper/index.js';

const DOCTYPE = 'test.ps02.playground.farmer.1';
const NAMESPACE = 'test.ps02.playground.farmer.1';
const ELEMENTS = { farmerId: '2154189532', givenName: 'Gorge', familyName: 'Cooper', landArea: '3 hectares' };
const DAY = 86_400_000;

let iaca: { keyPair: KeyPair; certificate: TestCertificate };
let signer: { keyPair: KeyPair; certificate: TestCertificate };
let holder: KeyPair;

beforeAll(async () => {
  const iacaKeys = generateKeyPair('ES256');
  iaca = {
    keyPair: iacaKeys,
    certificate: await createTestCertificate({ subject: 'CN=Test IACA', keyPair: iacaKeys, ca: true }),
  };
  const signerKeys = generateKeyPair('ES256');
  signer = {
    keyPair: signerKeys,
    certificate: await createTestCertificate({
      subject: 'CN=Test Document Signer',
      keyPair: signerKeys,
      issuer: iaca,
    }),
  };
  holder = generateKeyPair('ES256');
});

function issue(overrides: Partial<Parameters<typeof issueMdoc>[0]> = {}): string {
  const now = Date.now();
  return issueMdoc({
    docType: DOCTYPE,
    nameSpaces: { [NAMESPACE]: ELEMENTS },
    issuerKey: signer.keyPair,
    x5chain: [signer.certificate.x5c],
    deviceKey: holder.publicJwk,
    validFrom: new Date(now - DAY),
    validUntil: new Date(now + 365 * DAY),
    ...overrides,
  });
}

const annexB: MdocSessionTranscriptInput = {
  kind: 'iso-18013-7-annex-b',
  clientId: 'did:key:z6MkVerifier',
  responseUri: 'https://verifier.ps02.test/response',
  nonce: 'request-nonce',
  mdocGeneratedNonce: 'wallet-nonce',
};
const final: MdocSessionTranscriptInput = {
  kind: 'openid4vp-1.0',
  clientId: 'decentralized_identifier:did:key:z6MkVerifier',
  responseUri: 'https://verifier.ps02.test/response',
  nonce: 'request-nonce',
};

function verifyOptions(transcript: MdocSessionTranscriptInput, extra: Partial<VerifyMdocOptions> = {}) {
  return {
    sessionTranscript: mdocSessionTranscript(transcript),
    trustAnchors: [iaca.certificate.x5c],
    ...extra,
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy((error) => error instanceof FormatError && error.code === code);
}

describe('SessionTranscript (ISO/IEC TS 18013-7 Annex B.4.4; OpenID4VP 1.0 Appendix B.2.6.1)', () => {
  const sha = (value: unknown) => new Uint8Array(createHash('sha256').update(encodeCbor(value)).digest());

  it('Annex B: OID4VPHandover = [SHA-256(cbor([client_id, mdocGeneratedNonce])), SHA-256(cbor([response_uri, mdocGeneratedNonce])), nonce]', () => {
    const transcript = mdocSessionTranscript(annexB);
    expect(transcript[0]).toBeNull();
    expect(transcript[1]).toBeNull();
    expect(transcript[2]).toEqual([
      sha([annexB.clientId, 'wallet-nonce']),
      sha([annexB.responseUri, 'wallet-nonce']),
      'request-nonce',
    ]);
  });

  it('OpenID4VP 1.0: ["OpenID4VPHandover", SHA-256(cbor([client_id, nonce, null, response_uri]))] when not encrypted', () => {
    const transcript = mdocSessionTranscript(final);
    expect(transcript).toEqual([
      null,
      null,
      ['OpenID4VPHandover', sha([final.clientId, 'request-nonce', null, final.responseUri])],
    ]);
    const thumbprint = new Uint8Array(32).fill(7);
    expect(mdocSessionTranscript({ ...final, jwkThumbprint: thumbprint })[2]).toEqual([
      'OpenID4VPHandover',
      sha([final.clientId, 'request-nonce', thumbprint, final.responseUri]),
    ]);
  });

  it('the CBOR encoding is the RFC 8949 preferred one: SessionTranscript of the 1.0 profile starts f6 f6 82', () => {
    expect(Buffer.from(encodeCbor(mdocSessionTranscript(final))).toString('hex')).toMatch(
      /^83f6f682714f70656e494434565048616e646f7665725820/,
    );
  });
});

describe('IssuerSigned (ISO/IEC 18013-5 section 8.3.2.1.2.2; OpenID4VCI 1.0 Appendix A.2.4)', () => {
  it('decodes to the doctype, the namespace elements, the device key and the validity of the issuance', () => {
    const validFrom = new Date('2026-01-01T00:00:00Z');
    const validUntil = new Date('2027-01-01T00:00:00Z');
    const decoded = decodeMdocCredential(issue({ validFrom, validUntil }));
    expect(decoded.encoding).toBe('openid4vci');
    expect(decoded.docType).toBe(DOCTYPE);
    expect(decoded.issuerSigned.mso.deviceKey).toEqual(holder.publicJwk);
    expect(decoded.issuerSigned.mso.validityInfo).toMatchObject({ validFrom, validUntil });
    expect(decoded.issuerSigned.mso.digestAlgorithm).toBe('SHA-256');
    const items = decoded.issuerSigned.nameSpaces.get(NAMESPACE)!;
    expect(items.map((item) => item.elementIdentifier).sort()).toEqual(Object.keys(ELEMENTS).sort());
    expect(new Set(items.map((item) => item.digestId)).size).toBe(items.length);
    for (const item of items) expect(item.random.length).toBeGreaterThanOrEqual(16);
  });

  it("Inji Certify 0.14.0's {docType, issuerSigned} encoding is read too", () => {
    const decoded = decodeMdocCredential(issue({ encoding: 'inji-certify' }));
    expect(decoded).toMatchObject({ encoding: 'inji-certify', docType: DOCTYPE });
  });

  it('report facts: docType, ES256 and the document signer subject, without checking signatures', () => {
    expect(mdocIssuerFacts(issue({ encoding: 'inji-certify' }))).toEqual({
      docType: DOCTYPE,
      alg: 'ES256',
      issuer: 'CN=Test Document Signer',
    });
  });

  it('the inspector view decodes tag 24 items and the MSO', () => {
    const json = mdocToJson(issue()) as Record<string, unknown>;
    expect(json.mobileSecurityObject).toMatchObject({ docType: DOCTYPE, version: '1.0' });
    const items = (json.nameSpaces as Record<string, unknown[]>)[NAMESPACE]!;
    expect(items).toContainEqual(
      expect.objectContaining({ elementIdentifier: 'givenName', elementValue: 'Gorge' }),
    );
  });

  it('text that is not base64url CBOR is MDOC_MALFORMED', () => {
    expect(() => decodeMdocCredential('not base64 !')).toThrow(
      expect.objectContaining({ code: 'MDOC_MALFORMED' }),
    );
    expect(() => decodeMdocCredential(Buffer.from(encodeCbor([1, 2])).toString('base64url'))).toThrow(
      expect.objectContaining({ code: 'MDOC_MALFORMED' }),
    );
  });

  it('a non-P-256 device key is refused at issuance', () => {
    expect(() => issue({ deviceKey: generateKeyPair('EdDSA').publicJwk })).toThrow(
      expect.objectContaining({ code: 'KEY_UNSUPPORTED' }),
    );
  });
});

describe.each([
  ['iso-18013-7-annex-b', annexB],
  ['openid4vp-1.0', final],
] as const)('DeviceResponse with SessionTranscript %s', (_name, transcript) => {
  it('ISO 18013-5 section 9.3.1 and 9.1.3: a genuine presentation verifies, with only the requested elements', async () => {
    const vpToken = presentMdoc({
      credential: issue(),
      disclose: [
        [NAMESPACE, 'givenName'],
        [NAMESPACE, 'farmerId'],
      ],
      deviceKey: holder,
      sessionTranscript: mdocSessionTranscript(transcript),
    });
    const result = await verifyMdocDeviceResponse(
      vpToken,
      verifyOptions(transcript, { expectedDocType: DOCTYPE }),
    );
    expect(result.documents).toHaveLength(1);
    const [document] = result.documents;
    expect(document).toMatchObject({
      docType: DOCTYPE,
      trusted: true,
      alg: 'ES256',
      issuer: 'CN=Test Document Signer',
    });
    expect(document!.claims).toEqual({ [NAMESPACE]: { givenName: 'Gorge', farmerId: '2154189532' } });
    expect(document!.deviceKey).toEqual(holder.publicJwk);
  });

  it('the Inji Certify encoding presents and verifies the same way', async () => {
    const vpToken = presentMdoc({
      credential: issue({ encoding: 'inji-certify' }),
      deviceKey: holder,
      sessionTranscript: mdocSessionTranscript(transcript),
    });
    const result = await verifyMdocDeviceResponse(vpToken, verifyOptions(transcript));
    expect(Object.keys(result.documents[0]!.claims[NAMESPACE]!)).toHaveLength(4);
  });

  it('section 9.1.3.6: a SessionTranscript with another nonce fails the device signature', async () => {
    const vpToken = presentMdoc({
      credential: issue(),
      deviceKey: holder,
      sessionTranscript: mdocSessionTranscript(transcript),
    });
    await expectCode(
      verifyMdocDeviceResponse(vpToken, verifyOptions({ ...transcript, nonce: 'another-nonce' })),
      'MDOC_DEVICE_SIGNATURE_INVALID',
    );
    await expectCode(
      verifyMdocDeviceResponse(
        vpToken,
        verifyOptions({ ...transcript, clientId: 'redirect_uri:https://other.ps02.test' }),
      ),
      'MDOC_DEVICE_SIGNATURE_INVALID',
    );
  });

  it('section 9.1.3.6: a device signature by another key than the MSO deviceKey fails', async () => {
    const vpToken = presentMdoc({
      credential: issue(),
      deviceKey: generateKeyPair('ES256'),
      sessionTranscript: mdocSessionTranscript(transcript),
    });
    await expectCode(
      verifyMdocDeviceResponse(vpToken, verifyOptions(transcript)),
      'MDOC_DEVICE_SIGNATURE_INVALID',
    );
  });
});

describe('DeviceResponse verification failures (ISO/IEC 18013-5 section 9.3.1)', () => {
  const sessionTranscript = mdocSessionTranscript(final);
  const present = (credential: string) => presentMdoc({ credential, deviceKey: holder, sessionTranscript });

  it('step 2: a flipped issuer signature is MDOC_ISSUER_SIGNATURE_INVALID', async () => {
    await expectCode(
      verifyMdocDeviceResponse(present(flipMdocIssuerSignature(issue())), verifyOptions(final)),
      'MDOC_ISSUER_SIGNATURE_INVALID',
    );
    // On a DeviceResponse too, and on the Inji Certify encoding.
    await expectCode(
      verifyMdocDeviceResponse(
        flipMdocIssuerSignature(present(issue({ encoding: 'inji-certify' }))),
        verifyOptions(final),
      ),
      'MDOC_ISSUER_SIGNATURE_INVALID',
    );
  });

  it('step 4: an altered element value is MDOC_DIGEST_MISMATCH (the device signature does not cover it)', async () => {
    const vpToken = present(issue());
    const first = firstMdocElement(vpToken)!;
    const altered = alterMdocElement(vpToken, first.elementIdentifier, 'altered');
    await expectCode(verifyMdocDeviceResponse(altered, verifyOptions(final)), 'MDOC_DIGEST_MISMATCH');
    expect(() => alterMdocElement(vpToken, 'noSuchElement', 1)).toThrow(TypeError);
  });

  it('step 4: an element the issuer never signed is MDOC_DIGEST_MISMATCH', async () => {
    const vpToken = addUnreferencedMdocElement(present(issue()), 'injected', true);
    await expectCode(verifyMdocDeviceResponse(vpToken, verifyOptions(final)), 'MDOC_DIGEST_MISMATCH');
  });

  it('step 6: validUntil in the past is MDOC_EXPIRED; validFrom in the future MDOC_NOT_YET_VALID', async () => {
    const now = Date.now();
    await expectCode(
      verifyMdocDeviceResponse(
        present(issue({ validFrom: new Date(now - 30 * DAY), validUntil: new Date(now - DAY) })),
        verifyOptions(final),
      ),
      'MDOC_EXPIRED',
    );
    await expectCode(
      verifyMdocDeviceResponse(
        present(issue({ validFrom: new Date(now + DAY), validUntil: new Date(now + 30 * DAY) })),
        verifyOptions(final),
      ),
      'MDOC_NOT_YET_VALID',
    );
  });

  it('step 1: a chain without a trust anchor is X5C_UNTRUSTED; accepted only when requireTrusted is false', async () => {
    const vpToken = present(issue());
    await expectCode(
      verifyMdocDeviceResponse(vpToken, { sessionTranscript, trustAnchors: [] }),
      'X5C_UNTRUSTED',
    );
    const relaxed = await verifyMdocDeviceResponse(vpToken, { sessionTranscript, requireTrusted: false });
    expect(relaxed.documents[0]!.trusted).toBe(false);
    expect(relaxed.warnings[0]).toContain('not anchored');
    // The document signer certificate itself works as a trust anchor too.
    const direct = await verifyMdocDeviceResponse(vpToken, {
      sessionTranscript,
      trustAnchors: [signer.certificate.pem],
    });
    expect(direct.documents[0]!.trusted).toBe(true);
  });

  it('step 1: an MSO signed again by a forger with a self-signed x5chain is X5C_UNTRUSTED', async () => {
    const forged = await forgeMdocWithSelfSignedX5chain(issue());
    await expectCode(
      verifyMdocDeviceResponse(present(forged.credential), verifyOptions(final)),
      'X5C_UNTRUSTED',
    );
  });

  it('step 5: a docType other than the expected one is MDOC_DOCTYPE_MISMATCH', async () => {
    await expectCode(
      verifyMdocDeviceResponse(
        present(issue({ docType: 'test.ps02.playground.landrecord.1' })),
        verifyOptions(final, { expectedDocType: DOCTYPE }),
      ),
      'MDOC_DOCTYPE_MISMATCH',
    );
  });

  it('step 5: a document docType that differs from the MSO docType is MDOC_DOCTYPE_MISMATCH', async () => {
    const response = decodeCbor(Buffer.from(present(issue()), 'base64url')) as Map<string, unknown>;
    (response.get('documents') as Map<string, unknown>[])[0]!.set('docType', 'org.iso.18013.5.1.mDL');
    await expectCode(
      verifyMdocDeviceResponse(Buffer.from(encodeCbor(response)).toString('base64url'), verifyOptions(final)),
      'MDOC_DOCTYPE_MISMATCH',
    );
  });

  it('section 9.1.3.6: DeviceAuth signed again by another key, or over another transcript, fails', async () => {
    const vpToken = present(issue());
    await expectCode(
      verifyMdocDeviceResponse(
        resignMdocDeviceSignature(vpToken, sessionTranscript, generateKeyPair('ES256')),
        verifyOptions(final),
      ),
      'MDOC_DEVICE_SIGNATURE_INVALID',
    );
    const otherNonce = mdocSessionTranscript({ ...final, nonce: 'other' });
    await expectCode(
      verifyMdocDeviceResponse(resignMdocDeviceSignature(vpToken, otherNonce, holder), verifyOptions(final)),
      'MDOC_DEVICE_SIGNATURE_INVALID',
    );
    // Signed again correctly, it verifies: the primitive changes only what it is asked to.
    const resigned = resignMdocDeviceSignature(vpToken, sessionTranscript, holder);
    await expect(verifyMdocDeviceResponse(resigned, verifyOptions(final))).resolves.toBeDefined();
  });

  it('section 8.3.2.1.2.3: a DeviceResponse with an error status or no document is MDOC_MALFORMED', async () => {
    const empty = Buffer.from(
      encodeCbor(
        new Map<string, unknown>([
          ['version', '1.0'],
          ['documents', []],
          ['status', 0],
        ]),
      ),
    ).toString('base64url');
    await expectCode(verifyMdocDeviceResponse(empty, verifyOptions(final)), 'MDOC_MALFORMED');
    const failed = Buffer.from(
      encodeCbor(
        new Map<string, unknown>([
          ['version', '1.0'],
          ['status', 10],
        ]),
      ),
    ).toString('base64url');
    await expectCode(verifyMdocDeviceResponse(failed, verifyOptions(final)), 'MDOC_MALFORMED');
  });

  it('asking to disclose an element the mdoc does not hold is MDOC_ELEMENT_MISSING', () => {
    expect(() =>
      presentMdoc({
        credential: issue(),
        disclose: [[NAMESPACE, 'noSuchElement']],
        deviceKey: holder,
        sessionTranscript,
      }),
    ).toThrow(expect.objectContaining({ code: 'MDOC_ELEMENT_MISSING' }));
  });
});
