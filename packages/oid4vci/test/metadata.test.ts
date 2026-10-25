// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Issuer metadata of both profiles, the issuer's own authorization server metadata, the
 * did:web document and SD-JWT VC issuer metadata.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDidResolver, decodeCompactJws, verifySdJwtVc } from '@inji-playground/formats';
import { acceptOffer, VCI_PROFILES } from '../src/index.js';
import { ISSUER_BASE, startPlayground, type Playground } from './helpers.js';

let pg: Playground;
beforeEach(async () => {
  pg = await startPlayground();
});
afterEach(async () => {
  await pg.app.close();
});

async function get(url: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await pg.app.inject({ method: 'GET', url });
  return { status: response.statusCode, json: response.json() };
}

describe('credential issuer metadata (draft 13 section 11.2, 1.0 section 12.2)', () => {
  it('gives every configuration a display name, logo, background_color and text_color (gap G4)', async () => {
    for (const profile of VCI_PROFILES) {
      const { status, json } = await get(`/ref/issuer/${profile}/.well-known/openid-credential-issuer`);
      expect(status).toBe(200);
      const configurations = json.credential_configurations_supported as Record<
        string,
        Record<string, unknown>
      >;
      expect(Object.keys(configurations).sort()).toEqual([
        'FarmerCredential_dc_sd_jwt',
        'FarmerCredential_ldp_vc',
        'FarmerCredential_ldp_vc_es256_proof',
        'FarmerCredential_ldp_vc_v2',
        'FarmerCredential_mso_mdoc',
        'FarmerCredential_vc_sd_jwt',
      ]);
      for (const [id, configuration] of Object.entries(configurations)) {
        // Draft 13 puts display at the top of the configuration; 1.0 under credential_metadata.
        const display = (
          profile === 'draft13'
            ? configuration.display
            : (configuration.credential_metadata as { display: unknown }).display
        ) as Array<Record<string, unknown>>;
        expect(display, `${profile} ${id}`).toHaveLength(1);
        const [entry] = display;
        expect(typeof entry!.name).toBe('string');
        expect(entry!.logo).toMatchObject({ uri: `${ISSUER_BASE}/logo.svg` });
        expect(entry!.background_color).toMatch(/^#[0-9a-f]{6}$/);
        expect(entry!.text_color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('names the Nonce Endpoint only in 1.0 and lists the external authorization server first', async () => {
    const draft13 = (await get('/ref/issuer/draft13/.well-known/openid-credential-issuer')).json;
    const v1 = (await get('/ref/issuer/v1/.well-known/openid-credential-issuer')).json;
    expect(draft13.nonce_endpoint).toBeUndefined();
    expect(v1.nonce_endpoint).toBe(`${ISSUER_BASE}/v1/nonce`);
    expect(draft13.credential_issuer).toBe(`${ISSUER_BASE}/draft13`);
    expect(draft13.authorization_servers).toEqual([
      'http://localhost:28100/ref/as',
      `${ISSUER_BASE}/draft13`,
    ]);
  });

  it('serves the same metadata at the RFC 8615 insert and the draft 13 append location', async () => {
    const append = await get('/ref/issuer/v1/.well-known/openid-credential-issuer');
    const insert = await get('/.well-known/openid-credential-issuer/ref/issuer/v1');
    expect(insert.status).toBe(200);
    expect(insert.json).toEqual(append.json);
    const asInsert = await get('/.well-known/oauth-authorization-server/ref/issuer/draft13');
    expect(asInsert.json).toMatchObject({
      issuer: `${ISSUER_BASE}/draft13`,
      token_endpoint: `${ISSUER_BASE}/draft13/token`,
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    });
  });

  it('serves the logo it points to', async () => {
    const response = await pg.app.inject({ method: 'GET', url: '/ref/issuer/logo.svg' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
  });

  it('publishes SD-JWT VC issuer keys at /.well-known/jwt-vc-issuer', async () => {
    const { json } = await get('/.well-known/jwt-vc-issuer/ref/issuer/draft13');
    const keys = (json.jwks as { keys: Array<Record<string, unknown>> }).keys;
    expect(keys.map((key) => key.alg)).toEqual(['EdDSA', 'ES256']);
    expect(keys.every((key) => !('d' in key))).toBe(true);
  });
});

describe('issuer DID', () => {
  it('serves a did:web document with both keys and signs with it', async () => {
    await pg.app.close();
    pg = await startPlayground({ didMethod: 'did:web' });
    const { status, json } = await get('/ref/issuer/did.json');
    expect(status).toBe(200);
    expect(json.id).toBe('did:web:localhost%3A28100:ref:issuer');
    const methods = (json.verificationMethod as Array<{ id: string; type: string }>).map((m) => [
      m.id,
      m.type,
    ]);
    expect(methods).toEqual([
      ['did:web:localhost%3A28100:ref:issuer#ed25519', 'Ed25519VerificationKey2020'],
      ['did:web:localhost%3A28100:ref:issuer#p256', 'JsonWebKey2020'],
    ]);

    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_vc_sd_jwt',
    });
    const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, clock: pg.clock });
    const sdJwt = result.credentials[0]!.credential as string;
    expect(decodeCompactJws(sdJwt.split('~')[0]!).header.kid).toBe(
      'did:web:localhost%3A28100:ref:issuer#ed25519',
    );
    // did:web resolves through the same in-process fetch (the host override map points at it).
    const resolver = createDidResolver({
      hostOverrides: { 'localhost:28100': 'http://localhost:28100' },
      fetch: async (url) => pg.fetch(url),
    });
    const verification = await verifySdJwtVc(sdJwt, { keyBinding: false, didResolver: resolver });
    expect(verification.claims.iss).toBe('did:web:localhost%3A28100:ref:issuer');
  });

  it('answers 404 for did.json when the issuer DID is not did:web', async () => {
    expect((await get('/ref/issuer/did.json')).status).toBe(404);
  });
});
