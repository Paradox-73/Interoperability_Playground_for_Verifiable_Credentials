/**
 * The Inji adapters against what Inji Certify 0.14.0 and Inji Verify 0.18.2 really answered, replayed from
 * the recorded fixtures in ./fixtures (captured from the local stack on 2026-10-05 with
 * scripts/capture-inji-fixtures.ts, redacted). No container is needed.
 */
import { readFileSync } from 'node:fs';
import { createDidResolver, createDocumentLoader, generateKeyPair } from '@inji-playground/formats';
import { PresentationClient } from '@inji-playground/oid4vp';
import type { RecordedExchange, RunContext, VerifierCallback } from '@inji-playground/protocol';
import { happy } from '@inji-playground/scenarios';
import { describe, expect, it } from 'vitest';
import {
  INJI_VERIFY_CLIENT_ID,
  InjiCertifyRole,
  InjiVerifyRole,
  InjiVerifySdkRole,
  injiRoles,
  injiVerifyResponseUris,
  outcomeOfInjiResult,
  stackStatus,
} from '../../../../src/adapters/inji/index.js';
import { CaptureHub } from '../../../../src/recording/capture-hub.js';
import { listenInTestRange, testConfig } from '../../../helpers.js';

interface Fixture {
  config: { format: string; scenario: string };
  outcome: string;
  exchanges: RecordedExchange[];
}

const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.recorded.json`, import.meta.url), 'utf8')) as Fixture;

/** A run context whose fetch answers from the recorded exchanges, matched by method and path. */
function replayContext(exchanges: readonly RecordedExchange[], callbacks: VerifierCallback[] = []) {
  const sent: Array<{ method: string; path: string; body?: string }> = [];
  const used = new Set<number>();
  const fetch = (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    sent.push({ method, path: url.pathname, ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
    const index = exchanges.findIndex(
      (exchange, i) =>
        !used.has(i) &&
        exchange.request.method === method &&
        new URL(exchange.request.url).pathname === url.pathname,
    );
    if (index === -1) return Promise.reject(new Error(`no recorded exchange for ${method} ${url.pathname}`));
    used.add(index);
    const response = exchanges[index]!.response!;
    return Promise.resolve(
      new Response(response.body ?? null, { status: response.status, headers: response.headers }),
    );
  };
  const ctx = {
    runId: 'contract-run',
    http: { fetch, exchanges: () => [] },
    emit: () => undefined,
    enterStep: () => undefined,
    waitForPerson: () => Promise.resolve(),
    waitForCallback: () => Promise.resolve(callbacks.shift()!),
    scenario: happy,
    hooks: {},
    signal: new AbortController().signal,
  } as unknown as RunContext;
  return { ctx, sent };
}

const verifyExchanges = (name: string) =>
  fixture(name).exchanges.filter((exchange) => exchange.to === 'inji-verify');

describe('inji-certify against recorded Inji Certify 0.14.0 answers', () => {
  it('creates a pre-authorized offer with only the advertised claims, and publishes its certificates', async () => {
    const recorded = fixture('certify-sd-jwt-valid').exchanges.filter(
      (exchange) => exchange.from === 'inji-certify',
    );
    const { ctx, sent } = replayContext(recorded);
    const anchors: string[][] = [];
    // Certificates are fetched outside the run (set-up traffic), from a server in the test range.
    const { server, url } = await listenInTestRange((request, response) => {
      // No keep-alive: the next test's server may get the same port, and a pooled socket would hit this one.
      response.setHeader('connection', 'close');
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          response: {
            certificate: `PEM of ${new URL(request.url!, 'http://x').searchParams.get('applicationId')}`,
          },
        }),
      );
    });
    try {
      const role = new InjiCertifyRole({ baseUrl: url, onTrustAnchors: (pems) => anchors.push(pems) });
      const start = await role.startIssuance(ctx, { format: 'vc+sd-jwt', vciProfile: 'draft13' });
      expect(start).toMatchObject({ mode: 'credential-offer', credentialConfigurationIds: ['FarmerSdJwt'] });
      expect(start.mode === 'credential-offer' && start.offerUri).toMatch(
        /^openid-credential-offer:\/\/\?credential_offer_uri=/,
      );
      const preAuth = sent.find((call) => call.path === '/v1/certify/pre-authorized-data');
      // FarmerSdJwt advertises fullName, dateOfBirth and farmerID; Certify refuses any other claim.
      expect(Object.keys((JSON.parse(preAuth!.body!) as { claims: object }).claims).sort()).toEqual([
        'dateOfBirth',
        'farmerID',
        'fullName',
      ]);
      expect(anchors).toEqual([
        [
          'PEM of ROOT',
          'PEM of CERTIFY_VC_SIGN_ED25519',
          'PEM of CERTIFY_VC_SIGN_EC_R1',
          'PEM of CERTIFY_VC_SIGN_EC_K1',
        ],
      ]);
      await expect(
        role.startIssuance(ctx, { format: 'mso_mdoc', vciProfile: 'draft13' }),
      ).rejects.toMatchObject({
        code: 'issuer.format-unsupported',
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('inji-verify against recorded Inji Verify 0.18.2 answers', () => {
  it('builds the wallet request as the Inji Verify SDK does, which the reference wallet accepts when it knows the client', async () => {
    const { ctx, sent } = replayContext(verifyExchanges('certify-sd-jwt-valid'));
    const ref = await new InjiVerifyRole('http://localhost:28080').createRequest(ctx, {
      format: 'vc+sd-jwt',
      vpProfile: 'inji-draft',
    });
    const body = JSON.parse(sent[0]!.body!) as { clientId: string; presentationDefinition: object };
    expect(body.clientId).toBe(INJI_VERIFY_CLIENT_ID);
    const params = new URL(ref.requestUri.replace('openid4vp://authorize', 'https://wallet.invalid/'))
      .searchParams;
    expect(Object.fromEntries([...params.keys()].map((key) => [key, true]))).toEqual({
      client_id: true,
      state: true,
      response_mode: true,
      response_type: true,
      nonce: true,
      response_uri: true,
      presentation_definition: true,
      client_metadata: true,
    });
    expect(params.get('state')).toBe(ref.verifierState?.requestId);
    expect(ref.handle).toBe(ref.verifierState?.transactionId);

    const holder = generateKeyPair('ES256');
    const resolver = createDidResolver({ methods: ['key', 'jwk'] });
    const wallet = (preRegistered: boolean) =>
      new PresentationClient({
        fetch: () => Promise.reject(new Error('no network in this test')),
        holder: { keyPair: holder },
        documentLoader: createDocumentLoader({ didResolver: resolver }),
        didResolver: resolver,
        ...(preRegistered
          ? {
              preRegisteredClients: [
                {
                  clientId: INJI_VERIFY_CLIENT_ID,
                  // The fixture was recorded with the sample's http submission base.
                  responseUris: injiVerifyResponseUris(
                    testConfig({ INJI_VERIFY_SUBMISSION_BASE_URL: 'http://verify-service:8080/v1/verify' }),
                  ),
                },
              ],
            }
          : {}),
      });
    await expect(wallet(false).resolveRequest(ref.requestUri)).rejects.toMatchObject({
      code: 'CLIENT_ID_UNSUPPORTED',
    });
    const resolved = await wallet(true).resolveRequest(ref.requestUri);
    expect(resolved).toMatchObject({
      profile: 'inji-draft',
      clientId: INJI_VERIFY_CLIENT_ID,
      nonce: ref.nonce,
    });
  });

  it.each([
    ['certify-sd-jwt-valid', 'VALID', []],
    ['ref-ldp-valid', 'VALID', []],
    ['ref-ldp-expired', 'EXPIRED', ['validity']],
    ['certify-ldp-holder-proof', 'INVALID', ['holder-binding']],
    ['ref-sd-jwt-no-x5c', 'INVALID', ['signature']],
  ])('%s: long poll, v2 result -> %s', async (name, outcome, failing) => {
    const exchanges = verifyExchanges(name);
    const { ctx, sent } = replayContext(exchanges);
    const role = new InjiVerifyRole('http://localhost:28080');
    const ref = await role.createRequest(ctx, {
      format: fixture(name).config.format as 'ldp_vc',
      vpProfile: 'inji-draft',
    });
    const result = await role.awaitResult(ctx, ref);
    expect(result.outcome).toBe(outcome);
    expect(fixture(name).outcome).toBe(outcome);
    expect(result.checks.filter((check) => check.status === 'fail').map((check) => check.id)).toEqual(
      failing,
    );
    expect(sent.map((call) => `${call.method} ${call.path.replace(/(req|txn)_[0-9a-f-]+/, '$1_*')}`)).toEqual(
      [
        'POST /v1/verify/vp-request',
        'GET /v1/verify/vp-request/req_*/status',
        'POST /v1/verify/v2/vp-results/txn_*',
      ],
    );
    expect(result.raw).toContain('credentialResults');
  });

  it('maps a verify-service error to INVALID with the error named', () => {
    expect(
      outcomeOfInjiResult(500, {
        errorCode: 'VP_VERIFICATION_FAILED',
        errorMessage: 'VP verification failed due to runtime exception during VP verification',
      }),
    ).toEqual({
      outcome: 'INVALID',
      checks: [
        {
          id: 'verify-service',
          status: 'fail',
          detail:
            'HTTP 500 VP_VERIFICATION_FAILED: VP verification failed due to runtime exception during VP verification',
        },
      ],
    });
  });

  it('inji-verify-sdk rebuilds the request from the component session and fetches the result after onVPReceived', async () => {
    const recorded = verifyExchanges('certify-sd-jwt-valid');
    const created = recorded.find((exchange) =>
      new URL(exchange.request.url).pathname.endsWith('/vp-request'),
    )!;
    // The component's /vp-session-request answer has the same shape as /vp-request's.
    const session: RecordedExchange = {
      ...created,
      capture: 'proxy',
      request: { ...created.request, url: 'http://localhost:28080/v1/verify/vp-session-request' },
    };
    const hub = new CaptureHub({
      recorderFor: () => ({ record: () => session, list: () => [session] }),
    });
    const transactionId = (JSON.parse(created.response!.body!) as { transactionId: string }).transactionId;
    const { ctx } = replayContext(
      recorded.filter((exchange) => new URL(exchange.request.url).pathname.includes('/v2/vp-results/')),
      [{ kind: 'vp-received', transactionId }],
    );
    const role = new InjiVerifySdkRole({ baseUrl: 'http://localhost:28080', hub });
    const ref = await role.createRequest(ctx, { format: 'vc+sd-jwt', vpProfile: 'inji-draft' });
    expect(ref.requestUri).toMatch(/^openid4vp:\/\/authorize\?client_id=/);
    expect((await role.awaitResult(ctx, ref)).outcome).toBe('VALID');

    const failing = replayContext(
      [],
      [{ kind: 'error', errorCode: 'qr-expired', errorMessage: 'the QR code expired' }],
    );
    await expect(role.awaitResult(failing.ctx, ref)).rejects.toMatchObject({
      code: 'verifier.sdk-qr-expired',
    });
  });
});

describe('registration and stack status', () => {
  it('registers no Inji role without a stack, and Certify, certify-ac, Inji Verify and its web component with one', () => {
    const hub = new CaptureHub({ recorderFor: () => undefined });
    expect(injiRoles({ config: testConfig(), hub })).toEqual([]);
    const roles = injiRoles({ config: testConfig({ PLAYGROUND_STACK: 'host' }), hub });
    // inji-web needs the hosted test authorization server (`reference`), which this call does not pass.
    expect(roles.map((role) => role.describe().id)).toEqual([
      'inji-certify',
      'inji-certify-ac',
      'inji-verify',
      'inji-verify-sdk',
    ]);
    expect(new Set(roles.map((role) => role.describe().ecosystem))).toEqual(new Set(['inji']));
  });

  it('probes each service and names its image', async () => {
    const { server, url } = await listenInTestRange((request, response) => {
      response.setHeader('connection', 'close');
      response.statusCode = request.url?.includes('mimoto') ? 503 : 200;
      response.end('{}');
    });
    try {
      const status = await stackStatus(
        'host',
        testConfig({
          PLAYGROUND_STACK: 'host',
          INJI_CERTIFY_URL: url,
          INJI_VERIFY_URL: url,
          INJI_MIMOTO_URL: url,
        }),
      );
      expect(status.services.map((service) => [service.name, service.image, service.health.status])).toEqual([
        ['certify', 'injistack/inji-certify-with-plugins:0.14.0', 'up'],
        ['verify-service', 'injistack/inji-verify-service:0.18.2', 'up'],
        ['mimoto', 'injistack/mimoto:0.22.0', 'down'],
      ]);
      expect((await stackStatus('off')).services).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
