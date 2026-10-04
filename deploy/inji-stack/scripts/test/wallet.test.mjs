// SPDX-License-Identifier: MIT
// Smoke wallet: key, proof JWT, offer parsing and the whole pre-authorized code flow against a fake Certify
// that checks what the real one checks (pre-authorized code, bearer token, proof signature, nonce, audience).
import { createPublicKey, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PRE_AUTH_GRANT,
  claimsForConfiguration,
  createHolderKey,
  envelopeErrors,
  createProofJwt,
  credentialRequestBody,
  issueWithPreAuthorizedCode,
  parseOfferLink,
} from '../lib/wallet.mjs';

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Verifies an ES256 proof JWT with the key in its did:jwk kid; returns header and payload. */
function verifyProof(jwt) {
  const [h, p, s] = jwt.split('.');
  const header = decode(h);
  const jwk = decode(header.kid.replace(/^did:jwk:/, '').replace(/#0$/, ''));
  const ok = verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(s, 'base64url'),
  );
  return { ok, header, payload: decode(p) };
}

describe('holder key and proof (OpenID4VCI draft 13 section 7.2.1.1)', () => {
  it('encodes the public P-256 key as did:jwk with only public members', () => {
    const holder = createHolderKey();
    const jwk = decode(holder.did.slice('did:jwk:'.length));
    expect(Object.keys(jwk)).toEqual(['crv', 'kty', 'x', 'y']);
    expect(jwk.crv).toBe('P-256');
    expect(holder.kid).toBe(`${holder.did}#0`);
  });

  it('signs a proof JWT with typ openid4vci-proof+jwt, aud, nonce and a 5 minute lifetime', () => {
    const holder = createHolderKey();
    const jwt = createProofJwt(holder, { audience: 'http://issuer', nonce: 'n-1', now: 1_000 });
    const { ok, header, payload } = verifyProof(jwt);
    expect(ok).toBe(true);
    expect(header).toEqual({ alg: 'ES256', typ: 'openid4vci-proof+jwt', kid: holder.kid });
    expect(payload).toEqual({ aud: 'http://issuer', iat: 1_000, exp: 1_300, nonce: 'n-1' });
  });

  it('leaves the nonce out when the token response has no c_nonce', () => {
    const jwt = createProofJwt(createHolderKey(), { audience: 'a', now: 1 });
    expect(verifyProof(jwt).payload).not.toHaveProperty('nonce');
  });
});

describe('credential offer link (OpenID4VCI draft 13 section 4.1)', () => {
  it('reads credential_offer_uri by reference', () => {
    const link = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent('http://certify-nginx:80/offer/1')}`;
    expect(parseOfferLink(link)).toEqual({ offerUri: 'http://certify-nginx:80/offer/1', offer: undefined });
  });

  it('reads credential_offer by value', () => {
    const offer = { credential_issuer: 'x', grants: {} };
    const link = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;
    expect(parseOfferLink(link).offer).toEqual(offer);
  });

  it('returns nothing for a link without parameters', () => {
    expect(parseOfferLink('openid-credential-offer://')).toEqual({ offerUri: undefined, offer: undefined });
  });
});

describe('credential request body', () => {
  it('sends credential_definition for ldp_vc', () => {
    const body = credentialRequestBody(
      { format: 'ldp_vc', credential_definition: { type: ['VerifiableCredential', 'X'] } },
      'jwt',
    );
    expect(body).toEqual({
      format: 'ldp_vc',
      proof: { proof_type: 'jwt', jwt: 'jwt' },
      credential_definition: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'X'],
      },
    });
  });

  it('sends vct for vc+sd-jwt', () => {
    expect(credentialRequestBody({ format: 'vc+sd-jwt', vct: 'urn:x' }, 'jwt')).toEqual({
      format: 'vc+sd-jwt',
      proof: { proof_type: 'jwt', jwt: 'jwt' },
      vct: 'urn:x',
    });
  });
});

describe('claimsForConfiguration and envelopeErrors', () => {
  const claims = { fullName: 'A', phone: '1', farmerID: 'F' };

  it('keeps the credentialSubject claims of an ldp_vc configuration', () => {
    const configuration = { credential_definition: { credentialSubject: { fullName: {}, phone: {} } } };
    expect(claimsForConfiguration(configuration, claims)).toEqual({ fullName: 'A', phone: '1' });
  });

  it('keeps the claims of an SD-JWT configuration, and everything when nothing is advertised', () => {
    expect(claimsForConfiguration({ claims: { farmerID: {} } }, claims)).toEqual({ farmerID: 'F' });
    expect(claimsForConfiguration({}, claims)).toEqual(claims);
  });

  it('reads error codes from a MOSIP envelope only', () => {
    expect(envelopeErrors({ errors: [{ errorCode: 'unknown_claims' }] })).toEqual(['unknown_claims']);
    expect(envelopeErrors({ errors: [] })).toEqual([]);
    expect(envelopeErrors({ credential_offer_uri: 'x' })).toEqual([]);
    expect(envelopeErrors('text')).toEqual([]);
  });
});

describe('pre-authorized code flow against a fake Certify', () => {
  const ADVERTISED = 'http://certify-nginx:80';
  let server;
  let base;
  const seen = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        seen.push(`${req.method} ${req.url}`);
        const send = (status, body) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(body));
        };
        const route = `${req.method} ${req.url}`;
        if (route === 'GET /v1/certify/issuance/.well-known/openid-credential-issuer') {
          return send(200, {
            credential_issuer: ADVERTISED,
            authorization_servers: [ADVERTISED],
            credential_endpoint: `${ADVERTISED}/v1/certify/issuance/credential`,
            credential_configurations_supported: {
              FarmerCredential: {
                format: 'ldp_vc',
                credential_definition: {
                  type: ['VerifiableCredential', 'FarmerCredential'],
                  credentialSubject: { fullName: {}, phone: {} },
                },
              },
            },
          });
        }
        if (route === 'POST /v1/certify/pre-authorized-data') {
          const body = JSON.parse(raw);
          // Like Certify 0.14.0: HTTP 200 with an error envelope for claims it does not know or lacks.
          const unknown = Object.keys(body.claims).filter((k) => !['fullName', 'phone'].includes(k));
          if (unknown.length > 0)
            return send(200, { response: null, errors: [{ errorCode: 'unknown_claims' }] });
          if (body.credential_configuration_id !== 'FarmerCredential' || !body.claims.fullName)
            return send(200, { response: null, errors: [{ errorCode: 'invalid_request' }] });
          const uri = `${ADVERTISED}/v1/certify/credential-offer-data/offer-1`;
          return send(200, {
            credential_offer_uri: `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(uri)}`,
          });
        }
        if (route === 'GET /v1/certify/credential-offer-data/offer-1') {
          return send(200, {
            credential_issuer: ADVERTISED,
            grants: { [PRE_AUTH_GRANT]: { 'pre-authorized_code': 'code-1' } },
          });
        }
        if (route === 'GET /.well-known/oauth-authorization-server') {
          return send(200, { issuer: ADVERTISED, token_endpoint: `${ADVERTISED}/v1/certify/oauth/token` });
        }
        if (route === 'POST /v1/certify/oauth/token') {
          const form = new URLSearchParams(raw);
          if (form.get('grant_type') !== PRE_AUTH_GRANT || form.get('pre-authorized_code') !== 'code-1')
            return send(400, { error: 'invalid_grant' });
          return send(200, { access_token: 'token-1', token_type: 'Bearer', c_nonce: 'nonce-1' });
        }
        if (route === 'POST /v1/certify/issuance/credential') {
          if (req.headers.authorization !== 'Bearer token-1') return send(401, {});
          const body = JSON.parse(raw);
          const proof = verifyProof(body.proof.jwt);
          if (!proof.ok || proof.payload.nonce !== 'nonce-1' || proof.payload.aud !== ADVERTISED)
            return send(400, { error: 'invalid_proof' });
          return send(200, {
            credential: { issuer: 'did:web:certify.ps02.test', credentialSubject: { id: proof.header.kid } },
          });
        }
        return send(404, {});
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((r) => server.close(r)));

  it('redeems the offer, proves possession and receives the credential through the network map', async () => {
    const exchanges = [];
    const result = await issueWithPreAuthorizedCode({
      certifyUrl: base,
      configurationId: 'FarmerCredential',
      claims: { fullName: 'Asha Test', farmerID: 'not advertised, so not sent' },
      networkMap: [{ from: ADVERTISED, to: base }],
      exchanges,
    });
    expect(result).toMatchObject({
      ok: true,
      format: 'ldp_vc',
      credential: { issuer: 'did:web:certify.ps02.test' },
    });
    expect(exchanges.map((e) => e.label)).toEqual([
      'issuer metadata',
      'pre-authorized data',
      'credential offer',
      'authorization server metadata',
      'token',
      'credential',
    ]);
    expect(exchanges.every((e) => e.url.startsWith(base))).toBe(true);
  });

  it('reports a refusal sent as HTTP 200 with an error envelope', async () => {
    const result = await issueWithPreAuthorizedCode({
      certifyUrl: base,
      configurationId: 'FarmerCredential',
      claims: { phone: '9000000000' },
      networkMap: [{ from: ADVERTISED, to: base }],
      exchanges: [],
    });
    expect(result).toEqual({ ok: false, step: 'pre-authorized data', detail: 'refused: invalid_request' });
  });

  it('stops at the step that fails and reports it', async () => {
    const result = await issueWithPreAuthorizedCode({
      certifyUrl: base,
      configurationId: 'Unknown',
      claims: {},
      networkMap: [],
      exchanges: [],
    });
    expect(result).toEqual({
      ok: false,
      step: 'issuer metadata',
      detail: 'no credential configuration Unknown',
    });
  });
});
