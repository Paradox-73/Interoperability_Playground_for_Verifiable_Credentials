// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Reference issuer and wallet client, OpenID4VCI 1.0 profile.
 * Spec: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDidResolver,
  createDocumentLoader,
  decodeCompactJws,
  verifyLdpVc,
  verifySdJwtVc,
} from '@inji-playground/formats';
import { PRE_AUTHORIZED_CODE_GRANT, acceptOffer, createHolderKey, createProofJwt } from '../src/index.js';
import { postForm, postJson, startPlayground, type Playground } from './helpers.js';

const documentLoader = createDocumentLoader({ didResolver: createDidResolver({ methods: ['key', 'jwk'] }) });
const AUDIENCE = 'http://localhost:28100/ref/issuer/v1';

let pg: Playground;
beforeEach(async () => {
  pg = await startPlayground();
});
afterEach(async () => {
  await pg.app.close();
});

async function token(configurationId: string): Promise<string> {
  const offer = pg.issuer.createOffer({ profile: 'v1', configurationId });
  const response = await postForm(pg.app, '/ref/issuer/v1/token', {
    grant_type: PRE_AUTHORIZED_CODE_GRANT,
    'pre-authorized_code': offer.preAuthorizedCode,
  });
  expect(response.status).toBe(200);
  // Section 6.2: 1.0 token responses carry no c_nonce; the Nonce Endpoint gives it.
  expect(response.json.c_nonce).toBeUndefined();
  return response.json.access_token as string;
}

async function nonce(): Promise<string> {
  const response = await pg.app.inject({ method: 'POST', url: '/ref/issuer/v1/nonce' });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  return response.json<{ c_nonce: string }>().c_nonce;
}

describe('1.0 pre-authorized code flow (sections 4.1, 6, 7, 8)', () => {
  it('issues an ldp_vc without tx_code (offer by value), with the Nonce Endpoint and proofs.jwt[]', async () => {
    const offer = pg.issuer.createOffer({ profile: 'v1', configurationId: 'FarmerCredential_ldp_vc' });
    const steps: string[] = [];
    const result = await acceptOffer(offer.offerUri, {
      fetch: pg.fetch,
      clock: pg.clock,
      onStep: (step) => steps.push(step),
    });
    expect(result.profile).toBe('v1');
    expect(steps).toEqual(['issuer.offer', 'issuer.metadata', 'as.metadata', 'token', 'nonce', 'credential']);
    await verifyLdpVc(result.credentials[0]!.credential, { documentLoader });
    const request = pg.exchanges.find((exchange) => exchange.url.endsWith('/v1/credential'))!;
    const body = JSON.parse(request.requestBody!) as Record<string, unknown>;
    expect(body.credential_configuration_id).toBe('FarmerCredential_ldp_vc');
    expect(Array.isArray((body.proofs as { jwt: unknown }).jwt)).toBe(true);
    expect(body.format).toBeUndefined();
    const response = JSON.parse(request.responseBody) as { credentials: unknown[] };
    expect(response.credentials).toHaveLength(1);
  });

  it('issues an ldp_vc with tx_code, offer by reference', async () => {
    const offer = pg.issuer.createOffer({
      profile: 'v1',
      configurationId: 'FarmerCredential_ldp_vc',
      txCode: true,
      byReference: true,
    });
    const result = await acceptOffer(offer.offerUri, {
      fetch: pg.fetch,
      txCode: offer.txCode!,
      clock: pg.clock,
    });
    await verifyLdpVc(result.credentials[0]!.credential, { documentLoader });
  });

  it('issues a vc+sd-jwt with and without tx_code', async () => {
    for (const txCode of [undefined, '2468']) {
      const offer = pg.issuer.createOffer({
        profile: 'v1',
        configurationId: 'FarmerCredential_vc_sd_jwt',
        ...(txCode ? { txCode } : {}),
      });
      const holderKey = createHolderKey();
      const result = await acceptOffer(offer.offerUri, {
        fetch: pg.fetch,
        holderKey,
        clock: pg.clock,
        ...(txCode ? { txCode } : {}),
      });
      const verification = await verifySdJwtVc(result.credentials[0]!.credential as string, {
        keyBinding: false,
        didResolver: createDidResolver({ methods: ['key'] }),
      });
      expect((verification.claims.cnf as { jwk: { x: string } }).jwk.x).toBe(holderKey.keyPair.publicJwk.x);
    }
  });

  it('issues dc+sd-jwt (ES256 issuer key) and VC 2.0 eddsa-rdfc-2022', async () => {
    const sd = pg.issuer.createOffer({ profile: 'v1', configurationId: 'FarmerCredential_dc_sd_jwt' });
    const sdResult = await acceptOffer(sd.offerUri, { fetch: pg.fetch, clock: pg.clock });
    const header = decodeCompactJws((sdResult.credentials[0]!.credential as string).split('~')[0]!).header;
    expect(header).toMatchObject({ typ: 'dc+sd-jwt', alg: 'ES256' });
    await verifySdJwtVc(sdResult.credentials[0]!.credential as string, {
      keyBinding: false,
      didResolver: createDidResolver({ methods: ['key'] }),
    });

    const ldp = pg.issuer.createOffer({ profile: 'v1', configurationId: 'FarmerCredential_ldp_vc_v2' });
    const ldpResult = await acceptOffer(ldp.offerUri, { fetch: pg.fetch, clock: pg.clock });
    const verification = await verifyLdpVc(ldpResult.credentials[0]!.credential, { documentLoader });
    expect(verification.dataModel).toBe('2.0');
    expect(verification.proofType).toContain('eddsa-rdfc-2022');
  });

  it('keeps the profiles apart: a draft 13 code is refused by the 1.0 token endpoint', async () => {
    const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
    const response = await postForm(pg.app, '/ref/issuer/v1/token', {
      grant_type: PRE_AUTHORIZED_CODE_GRANT,
      'pre-authorized_code': offer.preAuthorizedCode,
    });
    expect(response.json.error).toBe('invalid_grant');
  });
});

describe('1.0 credential endpoint errors (section 8.3.1.2)', () => {
  const request = (jwt: string) => ({
    credential_configuration_id: 'FarmerCredential_ldp_vc',
    proofs: { jwt: [jwt] },
  });

  it('missing nonce -> invalid_nonce', async () => {
    const accessToken = await token('FarmerCredential_ldp_vc');
    const jwt = createProofJwt({ holderKey: createHolderKey(), audience: AUDIENCE, nowMs: pg.clock() });
    const response = await postJson(pg.app, '/ref/issuer/v1/credential', request(jwt), accessToken);
    expect(response).toMatchObject({ status: 400, json: { error: 'invalid_nonce' } });
    // 1.0 sends no c_nonce with the error: the wallet asks the Nonce Endpoint again.
    expect(response.json.c_nonce).toBeUndefined();
  });

  it('stale nonce (used, expired or unknown) -> invalid_nonce', async () => {
    const accessToken = await token('FarmerCredential_ldp_vc');
    const holderKey = createHolderKey();
    const used = await nonce();
    const proof = (value: string) =>
      createProofJwt({ holderKey, audience: AUDIENCE, nonce: value, nowMs: pg.clock() });
    expect(
      (await postJson(pg.app, '/ref/issuer/v1/credential', request(proof(used)), accessToken)).status,
    ).toBe(200);
    const reused = await postJson(pg.app, '/ref/issuer/v1/credential', request(proof(used)), accessToken);
    expect(reused.json).toMatchObject({ error: 'invalid_nonce' });

    const unknown = await postJson(
      pg.app,
      '/ref/issuer/v1/credential',
      request(proof('made-up')),
      accessToken,
    );
    expect(unknown.json).toMatchObject({ error: 'invalid_nonce' });

    const old = await nonce();
    pg.advance(301);
    const lateToken = await token('FarmerCredential_ldp_vc');
    const late = await postJson(pg.app, '/ref/issuer/v1/credential', request(proof(old)), lateToken);
    expect(late.json).toMatchObject({ error: 'invalid_nonce' });
  });

  it('the client fetches a new nonce and retries once after invalid_nonce', async () => {
    const offer = pg.issuer.createOffer({ profile: 'v1', configurationId: 'FarmerCredential_ldp_vc' });
    let nonceCalls = 0;
    // The first nonce the wallet receives is used up before it reaches the issuer.
    const racing: typeof pg.fetch = async (url, init) => {
      const response = await pg.fetch(url, init);
      if (url.endsWith('/v1/nonce') && nonceCalls++ === 0) {
        const { c_nonce } = (await response.clone().json()) as { c_nonce: string };
        const stolen = createProofJwt({
          holderKey: createHolderKey(),
          audience: AUDIENCE,
          nonce: c_nonce,
          nowMs: pg.clock(),
        });
        await postJson(
          pg.app,
          '/ref/issuer/v1/credential',
          request(stolen),
          await token('FarmerCredential_ldp_vc'),
        );
      }
      return response;
    };
    const result = await acceptOffer(offer.offerUri, { fetch: racing, clock: pg.clock });
    expect(result.credentials).toHaveLength(1);
    expect(nonceCalls).toBe(2);
  });

  it('answers invalid_proof, invalid_credential_request and unknown_credential_configuration', async () => {
    const accessToken = await token('FarmerCredential_ldp_vc');
    const holderKey = createHolderKey();
    const good = createProofJwt({ holderKey, audience: AUDIENCE, nonce: await nonce(), nowMs: pg.clock() });
    const wrongAudience = createProofJwt({
      holderKey,
      audience: 'http://localhost:28100/ref/issuer/draft13',
      nonce: await nonce(),
      nowMs: pg.clock(),
    });
    const badProof = await postJson(pg.app, '/ref/issuer/v1/credential', request(wrongAudience), accessToken);
    expect(badProof.json).toMatchObject({ error: 'invalid_proof' });
    expect(badProof.json.c_nonce).toBeUndefined();

    const singular = await postJson(
      pg.app,
      '/ref/issuer/v1/credential',
      { credential_configuration_id: 'FarmerCredential_ldp_vc', proof: { proof_type: 'jwt', jwt: good } },
      accessToken,
    );
    expect(singular.json).toMatchObject({ error: 'invalid_credential_request' });

    const unknown = await postJson(
      pg.app,
      '/ref/issuer/v1/credential',
      { credential_configuration_id: 'DriverLicence', proofs: { jwt: [good] } },
      accessToken,
    );
    expect(unknown.json).toMatchObject({ error: 'unknown_credential_configuration' });

    const noId = await postJson(
      pg.app,
      '/ref/issuer/v1/credential',
      { proofs: { jwt: [good] } },
      accessToken,
    );
    expect(noId.json).toMatchObject({ error: 'invalid_credential_request' });
  });
});
