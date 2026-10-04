/**
 * `inji-draft` profile end to end: reference verifier <-> wallet presentation client, in-process.
 * Presentation Exchange, DID client id with a signed request object by reference, `redirect_uri`
 * scheme by value, `direct_post` with `presentation_submission`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeCompactJws, presentSdJwtVc } from '@inji-playground/formats';
import { parseRequestUri, toVerificationResult, type StoredCredential } from '../src/index.js';
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

describe.each<Format>(['ldp_vc', 'vc+sd-jwt'])('inji-draft, %s', (format) => {
  it('DID client id, signed request object (EdDSA) by reference -> VALID', async () => {
    const { verifier, wallet, requests } = harness();
    const created = verifier.createRequest({
      profile: 'inji-draft',
      format,
      query: queryFor(format),
      clientIdScheme: 'did',
    });

    // The URI carries only client_id and request_uri, like Inji Verify's (RequestServiceImpl.java:103-105).
    expect(created.uri.startsWith('openid4vp://authorize?')).toBe(true);
    const outer = parseRequestUri(created.uri);
    expect(Object.keys(outer).sort()).toEqual(['client_id', 'request_uri']);
    expect(outer.client_id).toBe(verifier.did);
    expect(verifier.did.startsWith('did:key:z6Mk')).toBe(true);

    const decoded = decodeCompactJws(created.requestObject!);
    expect(decoded.header).toMatchObject({ typ: 'oauth-authz-req+jwt', alg: 'EdDSA', kid: verifier.kid });
    expect(decoded.payload).toMatchObject({
      client_id: verifier.did,
      response_type: 'vp_token',
      response_mode: 'direct_post',
      response_uri: `${VERIFIER_BASE_URL}/response`,
      nonce: created.nonce,
      state: created.state,
    });
    expect(decoded.payload.presentation_definition).toBeDefined();

    const result = await wallet.respond(created.uri, [await credentialFor(format)]);
    expect(result.status).toBe(200);
    expect(result.request.signed).toBe(true);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${VERIFIER_BASE_URL}/requests/${created.handle}`,
      `POST ${VERIFIER_BASE_URL}/response`,
    ]);

    const submission = JSON.parse(result.form.presentation_submission!) as {
      definition_id: string;
      descriptor_map: { format: string; path: string }[];
    };
    expect(submission.definition_id).toBe((decoded.payload.presentation_definition as { id: string }).id);
    expect(submission.descriptor_map[0]).toMatchObject({
      format: format === 'ldp_vc' ? 'ldp_vp' : 'vc+sd-jwt',
      path: '$',
    });

    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('VALID');
    expect(report.errors).toEqual([]);
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
    expect(report.claims).toMatchObject(format === 'ldp_vc' ? { givenName: 'Asha' } : { given_name: 'Asha' });
    expect(toVerificationResult(report).outcome).toBe('VALID');
  });

  it('redirect_uri client id scheme, unsigned presentation definition by value -> VALID', async () => {
    const { verifier, wallet, requests } = harness();
    const created = verifier.createRequest({
      profile: 'inji-draft',
      format,
      query: queryFor(format),
      clientIdScheme: 'redirect_uri',
    });
    const outer = parseRequestUri(created.uri);
    expect(outer).toMatchObject({
      client_id: `${VERIFIER_BASE_URL}/response`,
      client_id_scheme: 'redirect_uri',
      response_uri: `${VERIFIER_BASE_URL}/response`,
    });
    expect(JSON.parse(outer.presentation_definition!)).toMatchObject({
      input_descriptors: [{ id: 'credential' }],
    });
    expect(created.requestObject).toBeUndefined();

    const result = await wallet.respond(created.uri, [await credentialFor(format)]);
    expect(result.request.signed).toBe(false);
    expect(requests).toHaveLength(1);
    expect((await verifier.awaitResult(created.handle)).outcome).toBe('VALID');
  });

  it('expired credential -> EXPIRED', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format });
    const credential =
      format === 'ldp_vc' ? await farmerLdpVc({ expired: true }) : await farmerSdJwtVc({ expired: true });
    await wallet.respond(created.uri, [credential]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('EXPIRED');
    expect(report.checks.find((check) => check.id === 'validity')?.status).toBe('fail');
    expect(report.errors[0]?.code).toBe(format === 'ldp_vc' ? 'LDP_EXPIRED' : 'SDJWT_EXPIRED');
  });

  it('flipped issuer signature -> INVALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format });
    const credential = await credentialFor(format);
    const tampered = format === 'ldp_vc' ? flipLdpSignature(credential) : flipSdJwtSignature(credential);
    await wallet.respond(created.uri, [tampered]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.checks.find((check) => check.id === 'signature')?.status).toBe('fail');
  });

  it('resubmitted vp_token with the same state -> rejected, first result kept', async () => {
    const { verifier, wallet, fetch } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format });
    const first = await wallet.respond(created.uri, [await credentialFor(format)]);
    expect(first.status).toBe(200);
    const replay = await postForm(fetch, created.responseUri, first.form);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({
      error: 'invalid_request',
      error_description: expect.stringMatching(/already received/) as unknown,
    });
    expect((await verifier.awaitResult(created.handle)).outcome).toBe('VALID');
  });
});

describe('inji-draft, response checks', () => {
  it('a response without presentation_submission is rejected (as Inji Verify does)', async () => {
    const { verifier, wallet, fetch } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const request = await wallet.resolveRequest(created.uri);
    const response = await wallet.buildResponse(
      request,
      wallet.selectCredentials(request, [await farmerLdpVc()]),
    );
    const { presentation_submission: _omitted, ...form } = response.form;
    const answer = await postForm(fetch, created.responseUri, form);
    expect(answer.status).toBe(400);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('SUBMISSION_INVALID');
  });

  it('an unknown state is rejected', async () => {
    const { verifier, fetch } = harness();
    verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const answer = await postForm(fetch, verifier.responseUri, {
      state: 'not-issued',
      vp_token: '{}',
      presentation_submission: '{}',
    });
    expect(answer.status).toBe(400);
  });

  it('beforeSubmit sees the encoded vp_token and its format, and what it returns is posted', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'vc+sd-jwt' });
    const seen: string[] = [];
    await wallet.respond(created.uri, [await farmerSdJwtVc()], {
      beforeSubmit: (vpToken, { format }) => {
        seen.push(format);
        return vpToken.replace(/~[^~]*"$/, '~"'); // drop the KB-JWT
      },
    });
    expect(seen).toEqual(['vc+sd-jwt']);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('KB_JWT_MISSING');
  });

  it.each([
    ['nonce', { nonce: 'another-nonce' }, 'KB_JWT_NONCE_MISMATCH', 'nonce'],
    ['aud', { audience: 'did:key:z6MkSomeOtherVerifier' }, 'KB_JWT_AUDIENCE_MISMATCH', 'audience'],
  ] as const)('KB-JWT with a wrong %s -> INVALID', async (_name, override, code, check) => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'vc+sd-jwt' });
    const credential = await farmerSdJwtVc();
    await wallet.respond(created.uri, [credential], {
      // A presentation made for another request or another verifier, replayed here.
      beforeSubmit: async () =>
        JSON.stringify(
          await presentSdJwtVc({
            sdJwt: credential.raw,
            disclose: 'all',
            holderKey: holder.keyPair,
            audience: created.clientId,
            nonce: created.nonce,
            ...override,
          }),
        ),
    });
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe(code);
    expect(report.checks.find((entry) => entry.id === check)?.status).toBe('fail');
  });

  it('ldp_vp with a wrong challenge -> INVALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const other = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    // Answer `created` with the presentation built for `other` (its nonce), but `created`'s state.
    const otherRequest = await wallet.resolveRequest(other.uri);
    const otherResponse = await wallet.buildResponse(
      otherRequest,
      wallet.selectCredentials(otherRequest, [await farmerLdpVc()]),
    );
    await wallet.respond(created.uri, [await farmerLdpVc()], {
      beforeSubmit: () => otherResponse.form.vp_token!,
    });
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('LDP_CHALLENGE_MISMATCH');
  });

  it('a request object is served once per handle and an unknown handle answers 404', async () => {
    const { verifier, fetch } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const ok = await fetch(created.requestUri!);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/oauth-authz-req+jwt');
    expect((await fetch(`${VERIFIER_BASE_URL}/requests/unknown`)).status).toBe(404);
  });

  it('selective disclosure: limit_disclosure sends only the requested SD-JWT claims', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'inji-draft',
      format: 'vc+sd-jwt',
      query: { claims: ['given_name'] },
    });
    await wallet.respond(created.uri, [await farmerSdJwtVc()]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('VALID');
    expect(report.claims.given_name).toBe('Asha');
    expect(report.claims.family_name).toBeUndefined();
  });

  it('a credential of another type does not match and the wallet refuses', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'inji-draft',
      format: 'ldp_vc',
      query: { type: 'DriverLicence' },
    });
    await expect(wallet.respond(created.uri, [await farmerLdpVc()])).rejects.toMatchObject({
      code: 'NO_MATCHING_CREDENTIAL',
    });
  });
});
