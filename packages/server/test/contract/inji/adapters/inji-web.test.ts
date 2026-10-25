// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The inji-web role against what Mimoto 0.22.0 (and, through it, certify-ac and the test authorization
 * server) really answered, replayed from ../fixtures/inji-web-*.recorded.json (captured from the local stack
 * on 2026-10-05 with scripts/capture-inji-fixtures.ts, redacted). No container is needed.
 */
import { readFileSync } from 'node:fs';
import type {
  IssuanceStart,
  PresentationRequestRef,
  RecordedExchange,
  RunContext,
} from '@inji-playground/protocol';
import { RoleError } from '@inji-playground/protocol';
import { happy } from '@inji-playground/scenarios';
import { describe, expect, it } from 'vitest';
import { InjiWebRole } from '../../../../src/adapters/inji/inji-web.js';
import type { ReferenceHosting } from '../../../../src/hosting/reference-hosting.js';
import { CaptureHub } from '../../../../src/recording/capture-hub.js';

interface Fixture {
  exchanges: RecordedExchange[];
}

const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.recorded.json`, import.meta.url), 'utf8')) as Fixture;

const MIMOTO = 'http://localhost:28099';
const RUN_ID = 'contract-run';
const START: Extract<IssuanceStart, { mode: 'wallet-initiated' }> = {
  mode: 'wallet-initiated',
  credentialIssuer: 'https://ref.ps02.test/proxy/certify-ac',
  credentialConfigurationId: 'FarmerCredential',
};

/**
 * The role's own calls answered from the recording (method and path, in order), and the hub holding what
 * Mimoto's own requests left at the playground's capture points (its credential request to certify-ac).
 */
function replay(name: string) {
  const exchanges = fixture(name).exchanges;
  const own = exchanges.filter((exchange) => exchange.to === 'mimoto' || exchange.to === 'ref-as');
  const sent: Array<{ method: string; path: string; body?: string }> = [];
  const used = new Set<number>();
  const fetch = (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    sent.push({ method, path: url.pathname, ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
    const index = own.findIndex(
      (exchange, i) =>
        !used.has(i) &&
        exchange.request.method === method &&
        new URL(exchange.request.url).pathname === url.pathname,
    );
    if (index === -1) return Promise.reject(new Error(`no recorded exchange for ${method} ${url.pathname}`));
    used.add(index);
    const response = own[index]!.response!;
    return Promise.resolve(
      new Response(response.body ?? null, { status: response.status, headers: response.headers }),
    );
  };
  const steps: string[] = [];
  const ctx = {
    runId: RUN_ID,
    http: { fetch, exchanges: () => [] },
    emit: () => undefined,
    enterStep: (step: string) => steps.push(step),
    waitForPerson: () => Promise.resolve(),
    scenario: happy,
    hooks: {},
    signal: new AbortController().signal,
  } as unknown as RunContext;
  const captured = exchanges.filter((exchange) => exchange.to === 'inji-certify-ac');
  const hub = new CaptureHub({
    recorderFor: () => ({ list: () => captured, record: (draft) => draft as RecordedExchange }),
  });
  const reference = {
    authorizationServer: { issueIdToken: () => Promise.resolve('test-id-token') },
  } as unknown as ReferenceHosting;
  const role = new InjiWebRole({ mimotoUrl: MIMOTO, hub, reference });
  return { role, ctx, sent, steps, exchanges };
}

function requestOf(exchanges: readonly RecordedExchange[]): PresentationRequestRef {
  const created = exchanges.find((exchange) => exchange.request.url.endsWith('/v1/verify/vp-request'));
  const body = JSON.parse(created!.response!.body!) as { transactionId: string };
  const presentation = exchanges.find((exchange) => /\/presentations$/.test(exchange.request.url));
  const { authorizationRequestUrl } = JSON.parse(presentation!.request.body!) as {
    authorizationRequestUrl: string;
  };
  return {
    requestUri: authorizationRequestUrl,
    handle: body.transactionId,
    queryKind: 'presentation_definition',
  };
}

describe('inji-web against recorded Mimoto 0.22.0 answers', () => {
  it('ldp_vc: guest download, sign-in, wallet, store, and the matching credential submitted', async () => {
    const { role, ctx, sent, steps, exchanges } = replay('inji-web-ldp-holder-binding');
    const held = await role.receiveCredential(ctx, START);
    // The credential comes from Mimoto's recorded call to certify-ac, not from the PDF Mimoto answers.
    expect(held.format).toBe('ldp_vc');
    expect(held.raw).toContain('FarmerCredential');
    const download = sent.find((call) => call.path === '/v1/mimoto/credentials/download');
    expect(Object.fromEntries(new URLSearchParams(download!.body))).toMatchObject({
      issuer: 'FarmerAC',
      credentialConfigurationId: 'FarmerCredential',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:28004/redirect',
    });
    const authorize = sent.find((call) => call.path.endsWith('/ref/as/authorize'));
    expect(authorize).toBeDefined();

    await role.present(ctx, requestOf(exchanges));
    expect(sent.map((call) => `${call.method} ${call.path.replace(/[0-9a-f-]{36}/g, '{id}')}`)).toEqual(
      expect.arrayContaining([
        'POST /v1/mimoto/auth/google/token-login',
        'POST /v1/mimoto/wallets/{id}/unlock',
        'POST /v1/mimoto/wallets/{id}/credentials',
        'POST /v1/mimoto/wallets/{id}/presentations',
        'GET /v1/mimoto/wallets/{id}/presentations/{id}/credentials',
        'PATCH /v1/mimoto/wallets/{id}/presentations/{id}',
      ]),
    );
    const submitted = sent.find((call) => call.method === 'PATCH');
    const stored = exchanges.find((exchange) => /\/wallets\/[^/]+\/credentials$/.test(exchange.request.url));
    const { credentialId } = JSON.parse(stored!.response!.body!) as { credentialId: string };
    expect(JSON.parse(submitted!.body!)).toEqual({
      selectedCredentials: [credentialId],
      submissionRequest: true,
    });
    expect(steps).toEqual(['wallet.fetch-request', 'wallet.submit']);
  });

  it('vc+sd-jwt: stops before submitting when Mimoto offers no credential (G25)', async () => {
    const { role, ctx, sent, exchanges } = replay('inji-web-sd-jwt-no-match');
    const held = await role.receiveCredential(ctx, { ...START, credentialConfigurationId: 'FarmerSdJwt' });
    expect(held.format).toBe('vc+sd-jwt');
    const failure = await role.present(ctx, requestOf(exchanges)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RoleError);
    expect(failure).toMatchObject({ code: 'wallet.no-matching-credential', category: 'interop' });
    expect((failure as Error).message).toContain('G25');
    expect(sent.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('refuses a credential offer: Inji Web starts from its issuer list (G5)', async () => {
    const { role, ctx } = replay('inji-web-ldp-holder-binding');
    await expect(
      role.receiveCredential(ctx, {
        mode: 'credential-offer',
        offerUri: 'openid-credential-offer://?x',
      } as IssuanceStart),
    ).rejects.toMatchObject({ code: 'wallet.offer-unsupported' });
  });
});
