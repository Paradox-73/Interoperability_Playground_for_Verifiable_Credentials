// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateJwkThumbprint } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestCertificate,
  decodeCompactJws,
  generateKeyPair,
  jwkThumbprint,
  keyPairFromPrivateJwk,
  KEY_ALGORITHMS,
  loadKeyPair,
  loadOrCreateKeyPair,
  saveKeyPair,
  signBytes,
  signCompactJws,
  toPublicJwk,
  validateX5c,
  verifyBytes,
  verifyDecodedJws,
} from '../src/index.js';

const data = new TextEncoder().encode('payload');

describe.each(KEY_ALGORITHMS)('%s key pairs', (alg) => {
  it('sign and verify raw bytes; a changed message fails', () => {
    const keyPair = generateKeyPair(alg);
    const signature = signBytes(keyPair.privateJwk, data);
    // RFC 7518 section 3.4: ES256 signatures are the 64-byte r||s form; Ed25519 signatures are 64 bytes too.
    expect(signature).toHaveLength(64);
    expect(verifyBytes(keyPair.publicJwk, data, signature)).toBe(true);
    expect(verifyBytes(keyPair.publicJwk, new TextEncoder().encode('other'), signature)).toBe(false);
  });

  it('RFC 7638 section 3: thumbprint equals the one computed by jose', async () => {
    const { publicJwk } = generateKeyPair(alg);
    expect(jwkThumbprint(publicJwk)).toBe(await calculateJwkThumbprint(publicJwk, 'sha256'));
  });

  it('public JWK carries no private member', () => {
    const { privateJwk } = generateKeyPair(alg);
    expect(toPublicJwk({ ...privateJwk, kid: 'k1', ext: true })).not.toHaveProperty('d');
    expect(toPublicJwk(privateJwk)).not.toHaveProperty('ext');
  });

  it('RFC 7515 section 7.1: compact JWS round trip', () => {
    const keyPair = generateKeyPair(alg);
    const jws = signCompactJws({ typ: 'JWT' }, { sub: 'x' }, keyPair);
    const decoded = decodeCompactJws(jws);
    expect(decoded.header).toEqual({ typ: 'JWT', alg });
    expect(verifyDecodedJws(decoded, keyPair.publicJwk)).toBe(true);
  });
});

describe('key validation', () => {
  it('rejects a private JWK whose d does not belong to x', () => {
    const a = generateKeyPair('EdDSA');
    const b = generateKeyPair('EdDSA');
    expect(() => keyPairFromPrivateJwk({ ...a.privateJwk, d: b.privateJwk.d })).toThrow(
      expect.objectContaining({ code: 'KEY_INVALID' }),
    );
  });

  it('rejects curves other than Ed25519 and P-256', () => {
    expect(() => toPublicJwk({ kty: 'EC', crv: 'P-384', x: 'AA', y: 'AA' })).toThrow(
      expect.objectContaining({ code: 'KEY_UNSUPPORTED' }),
    );
  });

  it('RFC 8725 section 3.1: a JWS whose alg does not fit the key is not accepted', () => {
    const es256 = generateKeyPair('ES256');
    const decoded = decodeCompactJws(signCompactJws({}, { a: 1 }, es256));
    expect(
      verifyDecodedJws({ ...decoded, header: { ...decoded.header, alg: 'EdDSA' } }, es256.publicJwk),
    ).toBe(false);
    expect(
      verifyDecodedJws({ ...decoded, header: { ...decoded.header, alg: 'none' } }, es256.publicJwk),
    ).toBe(false);
  });
});

describe('key store', () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ps02-formats-keys-'));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('saves and loads a key pair', async () => {
    const keyPair = generateKeyPair('ES256');
    await saveKeyPair(directory, 'issuer-es256', keyPair);
    expect(await loadKeyPair(directory, 'issuer-es256')).toEqual(keyPair);
  });

  it('loadOrCreateKeyPair keeps the key across calls', async () => {
    const first = await loadOrCreateKeyPair(directory, 'wallet', 'EdDSA');
    const second = await loadOrCreateKeyPair(directory, 'wallet', 'EdDSA');
    expect(second.publicJwk).toEqual(first.publicJwk);
    await expect(loadOrCreateKeyPair(directory, 'wallet', 'ES256')).rejects.toMatchObject({
      code: 'KEY_INVALID',
    });
  });

  it('refuses key names that leave the directory', async () => {
    await expect(saveKeyPair(directory, '../escape', generateKeyPair('EdDSA'))).rejects.toMatchObject({
      code: 'KEY_INVALID',
    });
  });

  it('reports a damaged key file', async () => {
    await writeFile(join(directory, 'broken.jwk.json'), '{"alg":"EdDSA","privateJwk":{"kty":"OKP"}}');
    await expect(loadKeyPair(directory, 'broken')).rejects.toMatchObject({ code: 'KEY_UNSUPPORTED' });
    expect(await readFile(join(directory, 'broken.jwk.json'), 'utf8')).toContain('OKP');
  });
});

describe('x5c certificate chains (SD-JWT VC draft 19 section 2.5)', () => {
  it.each(KEY_ALGORITHMS)('%s: a leaf signed by a test CA validates against that CA', async (alg) => {
    const caKeys = generateKeyPair(alg);
    const ca = await createTestCertificate({ subject: 'CN=Playground Test CA', keyPair: caKeys, ca: true });
    const leafKeys = generateKeyPair(alg);
    const leaf = await createTestCertificate({
      subject: 'CN=Reference Issuer',
      keyPair: leafKeys,
      issuer: { keyPair: caKeys, certificate: ca },
      dnsNames: ['issuer.ps02.test'],
    });
    const trusted = await validateX5c([leaf.x5c, ca.x5c], { trustAnchors: [ca.pem] });
    expect(trusted.trusted).toBe(true);
    expect(trusted.leafJwk).toEqual(toPublicJwk(leafKeys.publicJwk));

    const untrusted = await validateX5c([leaf.x5c]);
    expect(untrusted.trusted).toBe(false);
  });

  it('a chain whose certificates do not sign each other is rejected', async () => {
    const one = await createTestCertificate({ subject: 'CN=One', keyPair: generateKeyPair('ES256') });
    const two = await createTestCertificate({ subject: 'CN=Two', keyPair: generateKeyPair('ES256') });
    await expect(validateX5c([one.x5c, two.x5c])).rejects.toMatchObject({ code: 'X5C_INVALID' });
  });

  it('an expired certificate is rejected', async () => {
    const old = await createTestCertificate({
      subject: 'CN=Old',
      keyPair: generateKeyPair('EdDSA'),
      notBefore: new Date('2020-01-01T00:00:00Z'),
      validDays: 1,
    });
    await expect(validateX5c([old.x5c])).rejects.toMatchObject({ code: 'X5C_INVALID' });
  });
});
