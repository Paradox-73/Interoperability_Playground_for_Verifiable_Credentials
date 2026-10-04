import { describe, expect, it } from 'vitest';
import { isSdJwtFormat } from '../src/index.js';

/**
 * Every library the formats package is built on must load as ESM on Node 24 inside Vitest. The
 * libraries passed sign/verify proofs of concept under plain Node; this catches packaging problems
 * (CommonJS-only builds, missing exports) in the test runner itself.
 */
const libraries = [
  // @peculiar/x509 needs the Reflect metadata API (through tsyringe) to be installed first.
  'reflect-metadata',
  '@digitalbazaar/data-integrity',
  '@digitalbazaar/did-method-key',
  '@digitalbazaar/ed25519-multikey',
  '@digitalbazaar/ed25519-signature-2020',
  '@digitalbazaar/ed25519-verification-key-2020',
  '@digitalbazaar/eddsa-rdfc-2022-cryptosuite',
  '@digitalbazaar/security-document-loader',
  '@digitalbazaar/vc',
  '@injistack/pixelpass',
  '@peculiar/x509',
  '@sd-jwt/core',
  '@sd-jwt/sd-jwt-vc',
  'did-resolver',
  'jose',
  'key-did-resolver',
  'web-did-resolver',
];

// A variable specifier keeps TypeScript from requiring type declarations for untyped libraries.
const load = (specifier: string): Promise<Record<string, unknown>> =>
  import(specifier) as Promise<Record<string, unknown>>;

describe('formats dependencies', () => {
  // Sequential: reflect-metadata must be loaded before @peculiar/x509.
  it.each(libraries)('%s loads', async (name) => {
    const mod = await load(name);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('signs and verifies an EdDSA JWT with jose on this Node version', async () => {
    const jose = await import('jose');
    const { privateKey, publicKey } = await jose.generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const jwt = await new jose.SignJWT({ test: true }).setProtectedHeader({ alg: 'EdDSA' }).sign(privateKey);
    const { payload } = await jose.jwtVerify(jwt, publicKey);
    expect(payload.test).toBe(true);
  });
});

describe('isSdJwtFormat', () => {
  it('recognises both SD-JWT VC names and nothing else', () => {
    expect(isSdJwtFormat('vc+sd-jwt')).toBe(true);
    expect(isSdJwtFormat('dc+sd-jwt')).toBe(true);
    expect(isSdJwtFormat('ldp_vc')).toBe(false);
    expect(isSdJwtFormat('mso_mdoc')).toBe(false);
  });
});
