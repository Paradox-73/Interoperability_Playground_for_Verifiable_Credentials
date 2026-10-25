// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `final-1.0` profile end to end: DCQL, client id prefixes `decentralized_identifier:` and
 * `redirect_uri:`, `vp_token` keyed by credential query id (OpenID4VP 1.0).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeCompactJws, decodeSdJwt, presentSdJwtVc } from '@inji-playground/formats';
import { parseRequestUri, type ClientIdScheme, type StoredCredential } from '../src/index.js';
import {
  FARMER_VCT,
  VERIFIER_BASE_URL,
  farmerLdpVc,
  farmerSdJwtVc,
  flipLdpSignature,
  flipSdJwtSignature,
  harness,
  holder,
  postForm,
} from './helpers.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

type Format = 'ldp_vc' | 'vc+sd-jwt';
const credentialFor = (format: Format): Promise<StoredCredential> =>
  format === 'ldp_vc' ? farmerLdpVc() : farmerSdJwtVc();
const queryFor = (format: Format) =>
  format === 'ldp_vc'
    ? { type: 'FarmerCredential', claims: ['credentialSubject.givenName'] }
    : { type: FARMER_VCT, claims: ['given_name'] };

describe.each<[Format, ClientIdScheme]>([
  ['ldp_vc', 'did'],
  ['ldp_vc', 'redirect_uri'],
  ['vc+sd-jwt', 'did'],
  ['vc+sd-jwt', 'redirect_uri'],
])('final-1.0, %s, %s client id', (format, scheme) => {
  it('DCQL request -> VALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format,
      query: queryFor(format),
      clientIdScheme: scheme,
    });
    const expectedClientId =
      scheme === 'did'
        ? `decentralized_identifier:${verifier.did}`
        : `redirect_uri:${VERIFIER_BASE_URL}/response`;
    expect(created.clientId).toBe(expectedClientId);
    expect(created.ref.queryKind).toBe('dcql_query');

    const outer = parseRequestUri(created.uri);
    expect(outer.client_id).toBe(expectedClientId);
    if (scheme === 'did') {
      expect(Object.keys(outer).sort()).toEqual(['client_id', 'request_uri']);
      const { header, payload } = decodeCompactJws(created.requestObject!);
      expect(header).toMatchObject({ typ: 'oauth-authz-req+jwt', alg: 'EdDSA' });
      expect(payload.dcql_query).toMatchObject({ credentials: [{ id: 'credential', format }] });
      expect(payload.presentation_definition).toBeUndefined();
    } else {
      // redirect_uri requests are unsigned and travel by value (section 5.9.3).
      expect(created.requestObject).toBeUndefined();
      expect(JSON.parse(outer.dcql_query!)).toMatchObject({ credentials: [{ id: 'credential' }] });
    }

    const result = await wallet.respond(created.uri, [await credentialFor(format)]);
    expect(result.status).toBe(200);
    expect(result.form.presentation_submission).toBeUndefined();
    const vpToken = JSON.parse(result.form.vp_token!) as Record<string, unknown[]>;
    expect(Object.keys(vpToken)).toEqual(['credential']);
    expect(vpToken.credential).toHaveLength(1);
    if (format === 'vc+sd-jwt') {
      // KB-JWT aud is the full client_id, prefix included (Appendix B.3.6).
      expect(decodeSdJwt(vpToken.credential![0] as string).kb?.payload.aud).toBe(expectedClientId);
    } else {
      expect((vpToken.credential![0] as { proof: { domain: string } }).proof.domain).toBe(expectedClientId);
    }

    const report = await verifier.awaitResult(created.handle);
    expect(report.errors).toEqual([]);
    expect(report.outcome).toBe('VALID');
    expect(report.checks.find((check) => check.id === 'query')?.status).toBe('pass');
  });

  it('expired credential -> EXPIRED', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'final-1.0', format, clientIdScheme: scheme });
    const credential =
      format === 'ldp_vc' ? await farmerLdpVc({ expired: true }) : await farmerSdJwtVc({ expired: true });
    await wallet.respond(created.uri, [credential]);
    expect((await verifier.awaitResult(created.handle)).outcome).toBe('EXPIRED');
  });

  it('flipped issuer signature -> INVALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'final-1.0', format, clientIdScheme: scheme });
    const credential = await credentialFor(format);
    await wallet.respond(created.uri, [
      format === 'ldp_vc' ? flipLdpSignature(credential) : flipSdJwtSignature(credential),
    ]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.checks.find((check) => check.id === 'signature')?.status).toBe('fail');
    expect(report.checks.find((check) => check.id === 'query')?.status).toBe('skipped');
  });

  it('resubmitted vp_token with the same state -> rejected', async () => {
    const { verifier, wallet, fetch } = harness();
    const created = verifier.createRequest({ profile: 'final-1.0', format, clientIdScheme: scheme });
    const first = await wallet.respond(created.uri, [await credentialFor(format)]);
    const replay = await postForm(fetch, created.responseUri, first.form);
    expect(replay.status).toBe(400);
    expect((await verifier.awaitResult(created.handle)).outcome).toBe('VALID');
  });
});

describe('final-1.0, key binding and query checks', () => {
  it('KB-JWT aud without the client id prefix -> INVALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format: 'vc+sd-jwt',
      clientIdScheme: 'did',
    });
    const credential = await farmerSdJwtVc();
    await wallet.respond(created.uri, [credential], {
      // The draft habit: aud = the bare DID. 1.0 requires the prefixed client_id.
      beforeSubmit: async () =>
        JSON.stringify({
          credential: [
            await presentSdJwtVc({
              sdJwt: credential.raw,
              disclose: 'all',
              holderKey: holder.keyPair,
              audience: verifier.did,
              nonce: created.nonce,
            }),
          ],
        }),
    });
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('KB_JWT_AUDIENCE_MISMATCH');
  });

  it('KB-JWT with a wrong nonce -> INVALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format: 'vc+sd-jwt',
      clientIdScheme: 'redirect_uri',
    });
    const credential = await farmerSdJwtVc();
    await wallet.respond(created.uri, [credential], {
      beforeSubmit: async () =>
        JSON.stringify({
          credential: [
            await presentSdJwtVc({
              sdJwt: credential.raw,
              disclose: 'all',
              holderKey: holder.keyPair,
              audience: created.clientId,
              nonce: 'stale',
            }),
          ],
        }),
    });
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('KB_JWT_NONCE_MISMATCH');
  });

  it('a vp_token keyed by an unknown query id is rejected', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'final-1.0', format: 'vc+sd-jwt' });
    const result = await wallet.respond(created.uri, [await farmerSdJwtVc()], {
      beforeSubmit: (vpToken) => vpToken.replace('"credential"', '"other"'),
    });
    expect(result.status).toBe(400);
    expect((await verifier.awaitResult(created.handle)).outcome).toBe('INVALID');
  });

  it('a credential that lacks a requested claim does not satisfy the DCQL query in the wallet', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format: 'vc+sd-jwt',
      query: { claims: ['passport_number'] },
    });
    await expect(wallet.respond(created.uri, [await farmerSdJwtVc()])).rejects.toMatchObject({
      code: 'NO_MATCHING_CREDENTIAL',
    });
  });

  it('only the requested claims are disclosed', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format: 'vc+sd-jwt',
      query: { claims: ['family_name'] },
    });
    await wallet.respond(created.uri, [await farmerSdJwtVc()]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('VALID');
    expect(report.claims.family_name).toBe('Rao');
    expect(report.claims.given_name).toBeUndefined();
  });

  it('the same-device redirect_uri is returned in the direct_post response', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format: 'ldp_vc',
      redirectUri: 'https://playground.ps02.test/done',
    });
    const result = await wallet.respond(created.uri, [await farmerLdpVc()]);
    expect(result.redirectUri).toBe('https://playground.ps02.test/done');
  });
});
