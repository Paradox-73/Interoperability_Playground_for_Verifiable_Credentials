// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Reference issuer and wallet client, OpenID4VCI draft 13 profile (what Inji stable speaks).
 * Spec: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-13.html
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDidResolver,
  createDocumentLoader,
  decodeCompactJws,
  signCompactJws,
  verifyLdpVc,
  verifySdJwtVc,
} from '@inji-playground/formats';
import {
  Oid4vciClientError,
  PRE_AUTHORIZED_CODE_GRANT,
  acceptOffer,
  createHolderKey,
  createProofJwt,
} from '../src/index.js';
import { postForm, postJson, startPlayground, type Playground } from './helpers.js';

const documentLoader = createDocumentLoader({ didResolver: createDidResolver({ methods: ['key', 'jwk'] }) });

let pg: Playground;
beforeEach(async () => {
  pg = await startPlayground();
});
afterEach(async () => {
  await pg.app.close();
});

/** Redeems an offer by hand and returns the access token and c_nonce of the token response. */
async function token(configurationId: string): Promise<{ accessToken: string; cNonce: string }> {
  const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId });
  const response = await postForm(pg.app, '/ref/issuer/draft13/token', {
    grant_type: PRE_AUTHORIZED_CODE_GRANT,
    'pre-authorized_code': offer.preAuthorizedCode,
  });
  expect(response.status).toBe(200);
  return { accessToken: response.json.access_token as string, cNonce: response.json.c_nonce as string };
}

const AUDIENCE = 'http://localhost:28100/ref/issuer/draft13';

describe('draft 13 pre-authorized code flow (sections 4.1, 6, 7)', () => {
  it('issues an ldp_vc (VC 1.1, Ed25519Signature2020) without tx_code, offer by value', async () => {
    const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
    expect(offer.offerUri.startsWith('openid-credential-offer://?credential_offer=')).toBe(true);
    const holderKey = createHolderKey();
    const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, holderKey, clock: pg.clock });

    expect(result.profile).toBe('draft13');
    expect(result.credentials).toHaveLength(1);
    const credential = result.credentials[0]!.credential as Record<string, unknown>;
    expect((credential.credentialSubject as Record<string, unknown>).id).toBe(holderKey.did);
    const verification = await verifyLdpVc(credential, { documentLoader });
    expect(verification.proofType).toBe('Ed25519Signature2020');
    expect(verification.issuer).toBe(pg.issuer.dids().ed25519);
    // The token response of draft 13 carries the first c_nonce (section 6.2).
    expect(typeof result.tokenResponse.c_nonce).toBe('string');
  });

  it('issues a vc+sd-jwt with tx_code, offer by reference (credential_offer_uri)', async () => {
    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_vc_sd_jwt',
      txCode: true,
      byReference: true,
    });
    expect(offer.offerUri).toContain('credential_offer_uri=');
    expect(offer.txCode).toMatch(/^\d{6}$/);
    const holderKey = createHolderKey();
    const result = await acceptOffer(offer.offerUri, {
      fetch: pg.fetch,
      holderKey,
      txCode: offer.txCode!,
      clock: pg.clock,
    });

    const sdJwt = result.credentials[0]!.credential as string;
    expect(decodeCompactJws(sdJwt.split('~')[0]!).header.typ).toBe('vc+sd-jwt');
    const verification = await verifySdJwtVc(sdJwt, {
      keyBinding: false,
      didResolver: createDidResolver({ methods: ['key'] }),
    });
    expect(verification.claims.vct).toBe('https://playground.ps02.test/vct/farmer/v1');
    expect(verification.claims.farmerId).toBe('2154189532');
    expect((verification.claims.cnf as { jwk: { x: string } }).jwk.x).toBe(holderKey.keyPair.publicJwk.x);
    // The offer was fetched from the issuer: the recorded exchanges show it.
    expect(pg.exchanges.some((exchange) => exchange.url === offer.offerUrl)).toBe(true);
  });

  it('issues a vc+sd-jwt without tx_code and an ldp_vc with tx_code', async () => {
    const sd = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_vc_sd_jwt' });
    const sdResult = await acceptOffer(sd.offerUri, { fetch: pg.fetch, clock: pg.clock });
    expect(typeof sdResult.credentials[0]!.credential).toBe('string');

    const ldp = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_ldp_vc',
      txCode: '4321',
    });
    const ldpResult = await acceptOffer(ldp.offerUri, { fetch: pg.fetch, txCode: '4321', clock: pg.clock });
    await verifyLdpVc(ldpResult.credentials[0]!.credential, { documentLoader });
  });

  it('accepts a holder key given as jwk and as did:key, and an EdDSA proof', async () => {
    for (const holderKey of [createHolderKey('ES256', 'jwk'), createHolderKey('EdDSA', 'did:key')]) {
      const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
      const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, holderKey, clock: pg.clock });
      const subject = (result.credentials[0]!.credential as { credentialSubject: { id: string } })
        .credentialSubject;
      expect(subject.id).toBe(holderKey.did);
    }
  });
});

describe('draft 13 token endpoint errors (section 6.3)', () => {
  it('asks for tx_code: the client stops before the token request, a wrong code is invalid_grant', async () => {
    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_ldp_vc',
      txCode: '123456',
    });
    await expect(acceptOffer(offer.offerUri, { fetch: pg.fetch })).rejects.toMatchObject({
      code: 'TX_CODE_REQUIRED',
    });

    const missing = await postForm(pg.app, '/ref/issuer/draft13/token', {
      grant_type: PRE_AUTHORIZED_CODE_GRANT,
      'pre-authorized_code': offer.preAuthorizedCode,
    });
    expect(missing).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
    const wrong = await postForm(pg.app, '/ref/issuer/draft13/token', {
      grant_type: PRE_AUTHORIZED_CODE_GRANT,
      'pre-authorized_code': offer.preAuthorizedCode,
      tx_code: '000000',
    });
    expect(wrong).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });
  });

  it('revokes the pre-authorized code after 5 wrong tx_code values, so the code cannot be guessed', async () => {
    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_ldp_vc',
      txCode: '123456',
    });
    const attempt = (txCode: string) =>
      postForm(pg.app, '/ref/issuer/draft13/token', {
        grant_type: PRE_AUTHORIZED_CODE_GRANT,
        'pre-authorized_code': offer.preAuthorizedCode,
        tx_code: txCode,
      });
    for (const guess of ['000000', '000001', '000002', '000003']) {
      expect((await attempt(guess)).json.error_description).toBe('tx_code is wrong');
    }
    const fifth = await attempt('000004');
    expect(fifth).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });
    expect(fifth.json.error_description).toMatch(/too many wrong tx_code/);
    const right = await attempt('123456');
    expect(right).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });
  });

  it('rejects a reused pre-authorized code with invalid_grant', async () => {
    const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
    const form = { grant_type: PRE_AUTHORIZED_CODE_GRANT, 'pre-authorized_code': offer.preAuthorizedCode };
    expect((await postForm(pg.app, '/ref/issuer/draft13/token', form)).status).toBe(200);
    const again = await postForm(pg.app, '/ref/issuer/draft13/token', form);
    expect(again).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });
    expect(again.json.error_description).toMatch(/already used/);
  });

  it('rejects an expired pre-authorized code with invalid_grant', async () => {
    const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
    pg.advance(301);
    const expired = await postForm(pg.app, '/ref/issuer/draft13/token', {
      grant_type: PRE_AUTHORIZED_CODE_GRANT,
      'pre-authorized_code': offer.preAuthorizedCode,
    });
    expect(expired).toMatchObject({ status: 400, json: { error: 'invalid_grant' } });
    expect(expired.json.error_description).toMatch(/expired/);
  });

  it('rejects other grant types with unsupported_grant_type', async () => {
    const response = await postForm(pg.app, '/ref/issuer/draft13/token', {
      grant_type: 'client_credentials',
    });
    expect(response).toMatchObject({ status: 400, json: { error: 'unsupported_grant_type' } });
  });
});

describe('draft 13 credential endpoint errors (section 7.3.1.2)', () => {
  const ldpRequest = (jwt: string) => ({
    format: 'ldp_vc',
    credential_definition: { type: ['VerifiableCredential', 'FarmerCredential'] },
    proof: { proof_type: 'jwt', jwt },
  });

  it('missing nonce -> invalid_proof with a fresh c_nonce, which then works', async () => {
    const { accessToken } = await token('FarmerCredential_ldp_vc');
    const holderKey = createHolderKey();
    const noNonce = createProofJwt({ holderKey, audience: AUDIENCE, nowMs: pg.clock() });
    const first = await postJson(pg.app, '/ref/issuer/draft13/credential', ldpRequest(noNonce), accessToken);
    expect(first.status).toBe(400);
    expect(first.json.error).toBe('invalid_proof');
    expect(typeof first.json.c_nonce).toBe('string');
    expect(first.json.c_nonce_expires_in).toBe(300);

    const retry = createProofJwt({
      holderKey,
      audience: AUDIENCE,
      nonce: first.json.c_nonce as string,
      nowMs: pg.clock(),
    });
    const second = await postJson(pg.app, '/ref/issuer/draft13/credential', ldpRequest(retry), accessToken);
    expect(second.status).toBe(200);
    expect(second.json.credential).toBeDefined();
    expect(typeof second.json.c_nonce).toBe('string');
  });

  it('stale nonce (already used, or expired) -> invalid_proof with a fresh c_nonce', async () => {
    const { accessToken, cNonce } = await token('FarmerCredential_ldp_vc');
    const holderKey = createHolderKey();
    const proof = () => createProofJwt({ holderKey, audience: AUDIENCE, nonce: cNonce, nowMs: pg.clock() });
    expect(
      (await postJson(pg.app, '/ref/issuer/draft13/credential', ldpRequest(proof()), accessToken)).status,
    ).toBe(200);
    const reused = await postJson(pg.app, '/ref/issuer/draft13/credential', ldpRequest(proof()), accessToken);
    expect(reused.json).toMatchObject({ error: 'invalid_proof' });
    expect(reused.json.c_nonce).not.toBe(cNonce);

    const fresh = await token('FarmerCredential_ldp_vc');
    pg.advance(301);
    const expiredNonce = createProofJwt({
      holderKey,
      audience: AUDIENCE,
      nonce: fresh.cNonce,
      nowMs: pg.clock(),
    });
    const late = await postJson(
      pg.app,
      '/ref/issuer/draft13/credential',
      ldpRequest(expiredNonce),
      fresh.accessToken,
    );
    expect(late.json).toMatchObject({ error: 'invalid_proof' });
    expect(late.json.error_description).toMatch(/expired/);
  });

  it('the client retries once with the c_nonce from invalid_proof', async () => {
    const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
    // A fetch that drops c_nonce from the token response, as an issuer that sends none would.
    const fetchWithoutNonce: typeof pg.fetch = async (url, init) => {
      const response = await pg.fetch(url, init);
      if (!url.endsWith('/token')) return response;
      const { c_nonce: _drop, ...rest } = (await response.json()) as Record<string, unknown>;
      return new Response(JSON.stringify(rest), { status: response.status, headers: response.headers });
    };
    const result = await acceptOffer(offer.offerUri, { fetch: fetchWithoutNonce, clock: pg.clock });
    expect(result.credentials).toHaveLength(1);
    const credentialCalls = pg.exchanges.filter((exchange) => exchange.url.endsWith('/credential'));
    expect(credentialCalls.map((exchange) => exchange.status)).toEqual([400, 200]);
  });

  it('rejects a proof with the wrong typ, the wrong aud or a bad signature with invalid_proof', async () => {
    const { accessToken, cNonce } = await token('FarmerCredential_ldp_vc');
    const holderKey = createHolderKey();
    const now = Math.floor(pg.clock() / 1000);
    const cases = [
      signCompactJws(
        { typ: 'JWT', kid: holderKey.kid },
        { aud: AUDIENCE, iat: now, nonce: cNonce },
        holderKey.keyPair,
      ),
      signCompactJws(
        { typ: 'openid4vci-proof+jwt', kid: holderKey.kid },
        { aud: 'https://other.example', iat: now, nonce: cNonce },
        holderKey.keyPair,
      ),
      signCompactJws(
        { typ: 'openid4vci-proof+jwt', kid: createHolderKey().kid },
        { aud: AUDIENCE, iat: now, nonce: cNonce },
        holderKey.keyPair,
      ),
      signCompactJws(
        { typ: 'openid4vci-proof+jwt', kid: holderKey.kid },
        { aud: AUDIENCE, iat: now - 3600, nonce: cNonce },
        holderKey.keyPair,
      ),
    ];
    const descriptions = [];
    for (const jwt of cases) {
      const response = await postJson(pg.app, '/ref/issuer/draft13/credential', ldpRequest(jwt), accessToken);
      expect(response.json.error).toBe('invalid_proof');
      expect(typeof response.json.c_nonce).toBe('string');
      descriptions.push(response.json.error_description);
    }
    expect(descriptions[0]).toMatch(/typ/);
    expect(descriptions[1]).toMatch(/aud/);
    expect(descriptions[2]).toMatch(/signature/);
    expect(descriptions[3]).toMatch(/iat/);
  });

  it('answers unsupported_credential_format, unsupported_credential_type and invalid_token', async () => {
    const { accessToken, cNonce } = await token('FarmerCredential_ldp_vc');
    const holderKey = createHolderKey();
    const jwt = createProofJwt({ holderKey, audience: AUDIENCE, nonce: cNonce, nowMs: pg.clock() });
    const jwtVc = await postJson(
      pg.app,
      '/ref/issuer/draft13/credential',
      {
        format: 'jwt_vc_json',
        credential_definition: { type: ['VerifiableCredential'] },
        proof: { proof_type: 'jwt', jwt },
      },
      accessToken,
    );
    expect(jwtVc.json.error).toBe('unsupported_credential_format');
    const mdoc = await postJson(
      pg.app,
      '/ref/issuer/draft13/credential',
      { format: 'mso_mdoc', doctype: 'x', proof: { proof_type: 'jwt', jwt } },
      accessToken,
    );
    expect(mdoc.json.error).toBe('unsupported_credential_type');
    const wrongType = await postJson(
      pg.app,
      '/ref/issuer/draft13/credential',
      {
        format: 'ldp_vc',
        credential_definition: { type: ['VerifiableCredential', 'DriverLicense'] },
        proof: { proof_type: 'jwt', jwt },
      },
      accessToken,
    );
    expect(wrongType.json.error).toBe('unsupported_credential_type');
    const noToken = await postJson(pg.app, '/ref/issuer/draft13/credential', ldpRequest(jwt));
    expect(noToken).toMatchObject({ status: 401, json: { error: 'invalid_token' } });
    // A token for ldp_vc does not cover the SD-JWT configuration.
    const otherConfig = await postJson(
      pg.app,
      '/ref/issuer/draft13/credential',
      {
        format: 'vc+sd-jwt',
        vct: 'https://playground.ps02.test/vct/farmer/v1',
        proof: { proof_type: 'jwt', jwt },
      },
      accessToken,
    );
    expect(otherConfig).toMatchObject({ status: 403, json: { error: 'credential_request_denied' } });
  });
});

describe('wallet client checks (section 11.2)', () => {
  it('rejects metadata whose credential_issuer differs from the offer', async () => {
    const offer = pg.issuer.createOffer({ profile: 'draft13', configurationId: 'FarmerCredential_ldp_vc' });
    const forging: typeof pg.fetch = async (url, init) => {
      const response = await pg.fetch(url, init);
      if (!url.includes('/.well-known/openid-credential-issuer')) return response;
      const metadata = (await response.json()) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ ...metadata, credential_issuer: 'https://issuer.attacker.test' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };
    const error = await acceptOffer(offer.offerUri, { fetch: forging }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Oid4vciClientError);
    expect(error).toMatchObject({ code: 'ISSUER_MISMATCH', step: 'issuer.metadata' });
  });

  it('rejects an offer that is neither by value nor by reference', async () => {
    await expect(
      acceptOffer('openid-credential-offer://?foo=bar', { fetch: pg.fetch }),
    ).rejects.toMatchObject({
      code: 'OFFER_INVALID',
    });
  });

  it('reports each protocol step through onStep', async () => {
    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_vc_sd_jwt',
      byReference: true,
    });
    const steps: string[] = [];
    await acceptOffer(offer.offerUri, {
      fetch: pg.fetch,
      onStep: (step) => steps.push(step),
      clock: pg.clock,
    });
    expect(steps).toEqual(['issuer.offer', 'issuer.metadata', 'as.metadata', 'token', 'credential']);
  });
});

describe('issuance options (scenario hook)', () => {
  it('issues an already expired credential when the offer asks for it', async () => {
    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_ldp_vc',
      issuance: { validFrom: new Date('2025-01-01T00:00:00Z'), validUntil: new Date('2025-02-01T00:00:00Z') },
    });
    const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, clock: pg.clock });
    await expect(verifyLdpVc(result.credentials[0]!.credential, { documentLoader })).rejects.toMatchObject({
      code: 'LDP_EXPIRED',
    });
  });

  it('names the issuer key by x5c and overrides vct through the hook', async () => {
    await pg.app.close();
    pg = await startPlayground({
      issuanceOptions: () => ({ useX5c: true, vct: 'https://playground.ps02.test/vct/other' }),
    });
    const offer = pg.issuer.createOffer({
      profile: 'draft13',
      configurationId: 'FarmerCredential_vc_sd_jwt',
    });
    const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, clock: pg.clock });
    const decoded = decodeCompactJws((result.credentials[0]!.credential as string).split('~')[0]!);
    expect(Array.isArray(decoded.header.x5c)).toBe(true);
    expect(decoded.header.kid).toBeUndefined();
    expect(decoded.payload.vct).toBe('https://playground.ps02.test/vct/other');
  });
});
