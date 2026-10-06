import { decodeCompactJws } from '@inji-playground/formats';
import { describe, expect, it } from 'vitest';
import {
  configurationMetadata,
  createHolderKey,
  createProofJwt,
  DEFAULT_CONFIGURATIONS,
  ed25519AlgNameFor,
  PROOF_SIGNING_ALGS,
  validateProofJwt,
} from '../src/index.js';

const AUDIENCE = 'https://ref.ps02.test/ref/issuer';
const NOW_MS = Date.UTC(2026, 9, 6, 12, 0, 0);
const options = { audience: AUDIENCE, nowSeconds: NOW_MS / 1000, maxAgeSeconds: 300, skewSeconds: 60 };
const branding = {
  name: 'Reference issuer',
  logoUri: 'https://ref.ps02.test/logo.png',
  backgroundColor: '#ffffff',
  textColor: '#000000',
  locale: 'en',
};

describe('key proof algorithm names (RFC 9864, gaps G9 and G22)', () => {
  it('the issuer lists EdDSA and the fully specified Ed25519, so Mimoto picks its Ed25519 key', () => {
    expect(PROOF_SIGNING_ALGS).toEqual(['ES256', 'EdDSA', 'Ed25519']);
  });

  it('accepts a proof whose alg is Ed25519, as Mimoto 0.22.0 sends it', async () => {
    const holderKey = createHolderKey('EdDSA', 'jwk');
    const jwt = createProofJwt({ holderKey, audience: AUDIENCE, nowMs: NOW_MS, ed25519AlgName: 'Ed25519' });
    expect(decodeCompactJws(jwt).header.alg).toBe('Ed25519');
    const validated = await validateProofJwt(jwt, options);
    expect(validated.holder.alg).toBe('Ed25519');
    expect(validated.holder.did).toBe(holderKey.did);
  });

  it('keeps EdDSA by default and never puts Ed25519 on a P-256 key', () => {
    const ed = createProofJwt({ holderKey: createHolderKey('EdDSA'), audience: AUDIENCE, nowMs: NOW_MS });
    expect(decodeCompactJws(ed).header.alg).toBe('EdDSA');
    const p256 = createProofJwt({
      holderKey: createHolderKey('ES256'),
      audience: AUDIENCE,
      nowMs: NOW_MS,
      ed25519AlgName: 'Ed25519',
    });
    expect(decodeCompactJws(p256).header.alg).toBe('ES256');
  });

  it('a configuration may narrow the accepted algorithms', async () => {
    const jwt = createProofJwt({ holderKey: createHolderKey('EdDSA'), audience: AUDIENCE, nowMs: NOW_MS });
    await expect(validateProofJwt(jwt, { ...options, algorithms: ['ES256'] })).rejects.toThrow(
      /proof alg EdDSA is not accepted; use one of ES256/,
    );
  });

  it('the ES256-only probe configuration advertises only ES256', () => {
    const configuration = DEFAULT_CONFIGURATIONS.find((c) => c.id === 'FarmerCredential_ldp_vc_es256_proof')!;
    const metadata = configurationMetadata(configuration, 'draft13', branding);
    expect(metadata.proof_types_supported).toEqual({
      jwt: { proof_signing_alg_values_supported: ['ES256'] },
    });
  });

  it('ed25519AlgNameFor picks Ed25519 only when the issuer lists it and not EdDSA (Inji Certify)', () => {
    const withAlgs = (algs: unknown) => ({
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: algs } },
    });
    expect(ed25519AlgNameFor(withAlgs(['RS256', 'ES256', 'Ed25519']))).toBe('Ed25519');
    expect(ed25519AlgNameFor(withAlgs(['ES256', 'EdDSA', 'Ed25519']))).toBe('EdDSA');
    expect(ed25519AlgNameFor(withAlgs(['ES256']))).toBe('EdDSA');
    expect(ed25519AlgNameFor({})).toBe('EdDSA');
  });
});
