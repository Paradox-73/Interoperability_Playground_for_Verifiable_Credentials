// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * OpenID4VP over the Digital Credentials API (OpenID4VP 1.0 Appendix A): the unsigned request, the wallet
 * answering for the calling origin, and the verifier checking the answer it gets from the page.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeCompactJws, splitSdJwt } from '@inji-playground/formats';
import {
  DC_API_PROTOCOL_SIGNED,
  DC_API_PROTOCOL_UNSIGNED,
  dcApiResponse,
  originClientId,
  resolveDcApiRequest,
  type StoredCredential,
} from '../src/index.js';
import {
  FARMER_VCT,
  VERIFIER_BASE_URL,
  farmerLdpVc,
  farmerSdJwtVc,
  flipSdJwtSignature,
  harness,
} from './helpers.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

const ORIGIN = 'https://playground.ps02.test';
type Format = 'ldp_vc' | 'vc+sd-jwt';
const credentialFor = (format: Format): Promise<StoredCredential> =>
  format === 'ldp_vc' ? farmerLdpVc() : farmerSdJwtVc();
const queryFor = (format: Format) =>
  format === 'ldp_vc'
    ? { type: 'FarmerCredential', claims: ['credentialSubject.givenName'] }
    : { type: FARMER_VCT, claims: ['given_name'] };

/** What the page does: ask the "browser" (here the wallet directly) and hand the answer to the verifier. */
const SECOND = 'http://localhost:28100';

async function answer(
  format: Format,
  walletOrigin = ORIGIN,
  credential?: StoredCredential,
  postOrigin?: string,
) {
  const { verifier, wallet } = harness();
  const created = verifier.createDcApiRequest({ format, origins: [ORIGIN, SECOND], query: queryFor(format) });
  const request = resolveDcApiRequest(created.request, walletOrigin);
  const matches = wallet.selectCredentials(request, [credential ?? (await credentialFor(format))]);
  const response = dcApiResponse(await wallet.buildResponse(request, matches));
  const report = await verifier.handleDcApiResponse(created.handle, response, {
    origin: postOrigin ?? walletOrigin,
  });
  return { verifier, created, request, response, report };
}

describe.each<Format>(['ldp_vc', 'vc+sd-jwt'])('Digital Credentials API, %s', (format) => {
  it('the request is unsigned OpenID4VP 1.0 with response_mode dc_api and no client_id or response_uri', () => {
    const { verifier } = harness();
    const created = verifier.createDcApiRequest({
      format,
      origins: [`${ORIGIN}/path?x=1`, 'http://localhost:28100'],
      query: queryFor(format),
    });
    expect(created.request.protocol).toBe(DC_API_PROTOCOL_UNSIGNED);
    expect(created.clientIds).toEqual([
      'origin:https://playground.ps02.test',
      'origin:http://localhost:28100',
    ]);
    expect(created.request.data).toMatchObject({ response_type: 'vp_token', response_mode: 'dc_api' });
    for (const name of ['client_id', 'response_uri', 'state', 'presentation_definition']) {
      expect(created.request.data[name]).toBeUndefined();
    }
    expect(verifier.dcApiRequest(created.handle)).toEqual(created.request);
  });

  it('a wallet answering for the same origin is VALID, bound to origin:<origin>', async () => {
    const { report, response, request } = await answer(format);
    expect(report.outcome).toBe('VALID');
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'dc_api', status: 'pass' }));
    expect(request.clientId).toBe(originClientId(ORIGIN));
    const [presentation] = Object.values(response.data.vp_token as Record<string, unknown[]>)[0]!;
    if (format === 'vc+sd-jwt') {
      const kb = splitSdJwt(presentation as string).kbJwt!;
      expect(decodeCompactJws(kb).payload.aud).toBe('origin:https://playground.ps02.test');
    } else {
      expect((presentation as { proof: { domain: string } }).proof.domain).toBe(
        'origin:https://playground.ps02.test',
      );
    }
  });

  it('the second origin of the verifier works when the page posting the answer has it', async () => {
    const { report } = await answer(format, SECOND, undefined, `${SECOND}/runs/1`);
    expect(report.outcome).toBe('VALID');
  });

  it('an answer posted from a page outside the verifier is INVALID, even when bound to that page', async () => {
    const { report } = await answer(
      format,
      'https://attacker.example',
      undefined,
      'https://attacker.example',
    );
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('CLIENT_ID_MISMATCH');
  });

  it('an answer bound to one origin of the verifier but posted from the other is INVALID', async () => {
    const { report } = await answer(format, ORIGIN, undefined, SECOND);
    expect(report.outcome).toBe('INVALID');
  });

  it('an answer bound to another origin is INVALID (a page cannot replay a presentation made for another site)', async () => {
    const { report } = await answer(format, 'https://attacker.example', undefined, ORIGIN);
    expect(report.outcome).toBe('INVALID');
  });
});

describe('Digital Credentials API, verifier', () => {
  it('rejects a tampered credential, a second answer and an unknown handle', async () => {
    const { report, verifier, created, response } = await answer(
      'vc+sd-jwt',
      ORIGIN,
      flipSdJwtSignature(await farmerSdJwtVc()),
    );
    expect(report.outcome).toBe('INVALID');
    await expect(verifier.handleDcApiResponse(created.handle, response, { origin: ORIGIN })).rejects.toThrow(
      /already received/,
    );
    await expect(verifier.handleDcApiResponse('nope', response, { origin: ORIGIN })).rejects.toThrow(
      /no Digital Credentials API/,
    );
    expect(() => verifier.dcApiRequest('nope')).toThrow(/no Digital Credentials API/);
  });

  it('reports a wallet error as ERROR and a missing vp_token or a foreign protocol as INVALID', async () => {
    const { verifier } = harness();
    const ask = () => verifier.createDcApiRequest({ format: 'ldp_vc', origins: [ORIGIN] });
    const declined = await verifier.handleDcApiResponse(
      ask().handle,
      { protocol: DC_API_PROTOCOL_UNSIGNED, data: { error: 'access_denied' } },
      { origin: ORIGIN },
    );
    expect(declined.outcome).toBe('ERROR');
    const empty = await verifier.handleDcApiResponse(
      ask().handle,
      { protocol: DC_API_PROTOCOL_UNSIGNED, data: {} },
      { origin: ORIGIN },
    );
    expect(empty.outcome).toBe('INVALID');
    expect(empty.checks[0]?.detail).toMatch(/vp_token is missing/);
    const foreign = await verifier.handleDcApiResponse(
      ask().handle,
      { protocol: 'org-iso-mdoc', data: {} },
      { origin: ORIGIN },
    );
    expect(foreign.checks[0]?.detail).toMatch(/was not requested/);
  });

  it('refuses an answer without an Origin header, and the request stays open for the real page', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createDcApiRequest({ format: 'ldp_vc', origins: [ORIGIN] });
    const request = resolveDcApiRequest(created.request, ORIGIN);
    const matches = wallet.selectCredentials(request, [await farmerLdpVc()]);
    const response = dcApiResponse(await wallet.buildResponse(request, matches));
    await expect(verifier.handleDcApiResponse(created.handle, response, {})).rejects.toMatchObject({
      code: 'CLIENT_ID_MISMATCH',
      status: 400,
    });
    const report = await verifier.handleDcApiResponse(created.handle, response, { origin: ORIGIN });
    expect(report.outcome).toBe('VALID');
  });

  it('a direct_post with the state of no request does not reach a Digital Credentials API request', async () => {
    const { verifier } = harness();
    verifier.createDcApiRequest({ format: 'ldp_vc', origins: [ORIGIN] });
    const result = await verifier.handleResponse({ state: 'x', vp_token: '{}' });
    expect(result.status).toBe(400);
  });

  it('serves request and response over HTTP', async () => {
    const { verifier, fetch, wallet } = harness();
    const created = verifier.createDcApiRequest({
      format: 'vc+sd-jwt',
      origins: [ORIGIN],
      query: queryFor('vc+sd-jwt'),
    });
    const served = (await (
      await fetch(`${VERIFIER_BASE_URL}/dc-api/requests/${created.handle}`)
    ).json()) as never;
    const request = resolveDcApiRequest(served, ORIGIN);
    const matches = wallet.selectCredentials(request, [await farmerSdJwtVc()]);
    const body = dcApiResponse(await wallet.buildResponse(request, matches));
    const posted = await fetch(`${VERIFIER_BASE_URL}/dc-api/responses/${created.handle}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body),
    });
    expect(await posted.json()).toEqual({ outcome: 'VALID' });

    const unsent = verifier.createDcApiRequest({ format: 'vc+sd-jwt', origins: [ORIGIN] });
    const noOrigin = await fetch(`${VERIFIER_BASE_URL}/dc-api/responses/${unsent.handle}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(noOrigin.status).toBe(400);
    expect(((await noOrigin.json()) as { error_description: string }).error_description).toMatch(/Origin/);
    const missing = await fetch(`${VERIFIER_BASE_URL}/dc-api/requests/unknown`);
    expect(missing.status).toBe(404);
  });
});

describe('Digital Credentials API, wallet', () => {
  const valid = {
    protocol: DC_API_PROTOCOL_UNSIGNED,
    data: { response_type: 'vp_token', response_mode: 'dc_api', nonce: 'n', dcql_query: { credentials: [] } },
  };

  it('refuses signed, unknown and malformed requests', () => {
    expect(() => resolveDcApiRequest({ ...valid, protocol: DC_API_PROTOCOL_SIGNED }, ORIGIN)).toThrow(
      /signed/,
    );
    expect(() => resolveDcApiRequest({ ...valid, protocol: 'openid4vp' }, ORIGIN)).toThrow(/unknown/);
    const without = (patch: Record<string, unknown>) =>
      resolveDcApiRequest({ ...valid, data: { ...valid.data, ...patch } }, ORIGIN);
    expect(() => without({ response_mode: 'direct_post' })).toThrow(/response_mode/);
    expect(() => without({ response_type: 'code' })).toThrow(/response_type/);
    expect(() => without({ client_id: 'x' })).toThrow(/no client_id/);
    expect(() => without({ response_uri: 'https://x' })).toThrow(/no response_uri/);
    expect(() => without({ nonce: '' })).toThrow(/nonce/);
    expect(() => without({ dcql_query: undefined })).toThrow(/dcql_query/);
  });

  it('uses the origin the browser reports as client id', () => {
    const request = resolveDcApiRequest(valid, 'http://localhost:28100/run/1');
    expect(request.clientId).toBe('origin:http://localhost:28100');
    expect(request.client.scheme).toBe('origin');
  });
});
