import { decode } from '@injistack/pixelpass';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { credentialSize, pixelPassText, QR_V40_ALPHANUMERIC, qrLevelsThatFit } from '../src/index.js';

const credential = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential'],
  issuer: 'did:example:issuer',
  issuanceDate: '2026-10-04T00:00:00Z',
  credentialSubject: { id: 'did:example:holder', givenName: 'Asha' },
};

describe('credential size and PixelPass QR length', () => {
  it('PixelPass text decodes back to the credential (Inji QR encoding: CBOR, zlib, base45)', () => {
    const text = pixelPassText(credential);
    expect(text).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
    expect(JSON.parse(decode(text))).toEqual(credential);
  });

  it('a small credential fits a version 40 QR code at level L', () => {
    const size = credentialSize(credential);
    expect(size.bytes).toBe(Buffer.byteLength(JSON.stringify(credential)));
    expect(size.pixelpassChars).toBe(pixelPassText(credential).length);
    expect(size.fitsQrV40).toBe(true);
  });

  it('a credential with an embedded photo does not fit (ISO/IEC 18004 version 40 capacity)', () => {
    // 8 KB of random bytes stands in for a face photo; random data does not compress.
    const withPhoto = {
      ...credential,
      credentialSubject: { ...credential.credentialSubject, face: randomBytes(8192).toString('base64') },
    };
    const size = credentialSize(withPhoto);
    expect(size.pixelpassChars).toBeGreaterThan(QR_V40_ALPHANUMERIC.L);
    expect(size.fitsQrV40).toBe(false);
    expect(qrLevelsThatFit(size.pixelpassChars)).toEqual([]);
  });

  it('an SD-JWT string is measured without PixelPass logging "Data is not JSON"', () => {
    const errors = vi.spyOn(console, 'error');
    const size = credentialSize('eyJhbGciOiJFUzI1NiJ9.eyJ2Y3QiOiJ4In0.c2ln~WyJzYWx0IiwibmFtZSIsIkFzaGEiXQ~');
    expect(size.pixelpassChars).toBeGreaterThan(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('error correction levels that still fit, from largest capacity down', () => {
    expect(qrLevelsThatFit(2000)).toEqual(['L', 'M', 'Q']);
    expect(qrLevelsThatFit(4296)).toEqual(['L']);
  });
});
