// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The capture points that see traffic from outside the playground's own roles: the reverse proxy in
 * front of the Inji services (`/proxy/:target/*`, `/v1/verify/*`), the inbound recorder in front of the
 * hosted reference roles (`/ref/*`), and the phone wallet role, which completes when that traffic shows
 * the wallet acted. A run with `mobile-wallet` stays active while it waits for the person, so it is
 * the run the outside requests are attributed to.
 */
import type { Server } from 'node:http';
import { acceptOffer, createHolderKey, injectFetch } from '@inji-playground/oid4vci';
import { PresentationClient } from '@inji-playground/oid4vp';
import {
  InteropReportSchema,
  type PersonAction,
  type RecordedExchange,
  type RunEvent,
} from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, listenInTestRange } from './helpers.js';

/** The server's own origin in tests (no PLAYGROUND_PUBLIC_URL, default port). */
const ORIGIN = 'http://localhost:28100';
const PHONE_CELL = {
  issuer: 'ref-issuer',
  wallet: 'mobile-wallet',
  verifier: 'ref-verifier',
  format: 'vc+sd-jwt',
} as const;

let app: FastifyInstance | undefined;
let upstream: Server | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  await new Promise((resolve) => (upstream ? upstream.close(resolve) : resolve(undefined)));
  upstream = undefined;
});

async function startRun(server: FastifyInstance, body: object): Promise<string> {
  const created = await server.inject({ method: 'POST', url: '/api/runs', payload: body });
  expect(created.statusCode, created.body).toBe(201);
  return created.json<{ runId: string }>().runId;
}

/** Resolves with the person action of `kind` once the run asks for it. */
async function actionOf(
  server: FastifyInstance,
  runId: string,
  kind: PersonAction['kind'],
): Promise<PersonAction> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const found = server.playground.store
      .listEvents(runId)
      .find(
        (event): event is Extract<RunEvent, { type: 'person.action-needed' }> =>
          event.type === 'person.action-needed' && event.action.kind === kind,
      );
    if (found) return found.action;
    if (Date.now() > deadline) throw new Error(`no ${kind} action in time`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function exchangesOf(server: FastifyInstance, runId: string): RecordedExchange[] {
  return server.playground.store.listExchanges(runId);
}

describe('reverse proxy capture point', () => {
  it('forwards to the Inji service and records request and response bodies byte for byte', async () => {
    const received: Array<{ method: string; url: string; body: string; contentType?: string }> = [];
    const listening = await listenInTestRange((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          method: request.method ?? '',
          url: request.url ?? '',
          body: Buffer.concat(chunks).toString('utf8'),
          ...(request.headers['content-type'] ? { contentType: request.headers['content-type'] } : {}),
        });
        response.writeHead(201, { 'content-type': 'application/json', 'set-cookie': ['a=1', 'b=2'] });
        response.end('{"requestId":"req-1","transactionId":"txn-1"}');
      });
    });
    upstream = listening.server;
    app = await buildTestApp({ env: { INJI_VERIFY_URL: listening.url } });
    const runId = await startRun(app, PHONE_CELL);
    await actionOf(app, runId, 'scan-offer');

    const sent = '{"clientId":"verifier","presentationDefinition":{"id":"pd-1"}}';
    const proxied = await app.inject({
      method: 'POST',
      url: '/proxy/verify/v1/verify/vp-request?trace=1',
      headers: { 'content-type': 'application/json', 'x-playground-run': runId },
      payload: sent,
    });
    expect(proxied.statusCode).toBe(201);
    expect(proxied.json()).toEqual({ requestId: 'req-1', transactionId: 'txn-1' });
    // Several cookies stay several headers.
    expect(proxied.headers['set-cookie']).toEqual(['a=1', 'b=2']);
    expect(received).toEqual([
      { method: 'POST', url: '/v1/verify/vp-request?trace=1', body: sent, contentType: 'application/json' },
    ]);

    const recorded = exchangesOf(app, runId).filter((exchange) => exchange.capture === 'proxy');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      capture: 'proxy',
      to: 'inji-verify',
      from: 'mobile-wallet',
      step: 'verifier.request',
      request: { method: 'POST', url: `${listening.url}/v1/verify/vp-request?trace=1`, body: sent },
      response: { status: 201, body: '{"requestId":"req-1","transactionId":"txn-1"}' },
    });
    // The attribution header is a playground detail: neither forwarded nor recorded.
    expect(recorded[0]!.request.headers).not.toHaveProperty('x-playground-run');

    // /v1/verify/* keeps its path (the SDK's cookie is scoped to it) and is attributed by a claim.
    const unclaimed = app.playground.capture.unattributed;
    await app.inject({ method: 'GET', url: '/v1/verify/vp-request/req-1/status' });
    expect(app.playground.capture.unattributed).toBe(unclaimed + 1);
    const release = app.playground.capture.claim(runId, 'verify');
    await app.inject({ method: 'GET', url: '/v1/verify/vp-request/req-1/status' });
    release();
    expect(received.map((entry) => entry.url)).toEqual([
      '/v1/verify/vp-request?trace=1',
      '/v1/verify/vp-request/req-1/status',
      '/v1/verify/vp-request/req-1/status',
    ]);
    expect(exchangesOf(app, runId).filter((exchange) => exchange.capture === 'proxy')).toHaveLength(2);

    expect((await app.inject({ method: 'GET', url: '/proxy/printer/x' })).statusCode).toBe(404);
    await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
  });

  it('maps certify-ac metadata under /v1/certify, as the sample nginx does for the core Certify', async () => {
    const received: string[] = [];
    const listening = await listenInTestRange((request, response) => {
      received.push(request.url ?? '');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
    upstream = listening.server;
    app = await buildTestApp({ env: { INJI_CERTIFY_AC_URL: listening.url } });
    for (const path of [
      '/proxy/certify-ac/.well-known/openid-credential-issuer',
      '/proxy/certify-ac/v1/certify/issuance/credential',
    ]) {
      expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(200);
    }
    expect(received).toEqual([
      '/v1/certify/.well-known/openid-credential-issuer',
      '/v1/certify/issuance/credential',
    ]);
  });

  it('records an unreachable service as an exchange with an error and answers 502', async () => {
    app = await buildTestApp({ env: { INJI_CERTIFY_URL: 'http://127.0.0.1:9' } });
    const runId = await startRun(app, PHONE_CELL);
    await actionOf(app, runId, 'scan-offer');
    const res = await app.inject({
      method: 'GET',
      url: '/proxy/certify/v1/certify/.well-known/openid-credential-issuer',
      headers: { 'x-playground-run': runId },
    });
    expect(res.statusCode).toBe(502);
    const [recorded] = exchangesOf(app, runId).filter((exchange) => exchange.capture === 'proxy');
    expect(recorded).toMatchObject({ to: 'inji-certify', step: 'issuer.metadata' });
    expect(recorded?.response).toBeUndefined();
    expect(recorded?.error).toBeTruthy();
    await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
  });
});

describe('inbound capture point', () => {
  it('records an outside request to /ref/issuer in the run that claimed the issuer', async () => {
    app = await buildTestApp();
    const unrelated = await app.inject({
      method: 'GET',
      url: '/ref/issuer/draft13/.well-known/openid-credential-issuer',
    });
    expect(unrelated.statusCode).toBe(200);
    expect(app.playground.capture.unattributed).toBe(1);

    const runId = await startRun(app, PHONE_CELL);
    await actionOf(app, runId, 'scan-offer');
    const res = await app.inject({
      method: 'GET',
      url: '/ref/issuer/draft13/.well-known/openid-credential-issuer',
      headers: { host: 'localhost:28100', accept: 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const recorded = exchangesOf(app, runId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      capture: 'inbound',
      from: 'mobile-wallet',
      to: 'ref-issuer',
      step: 'issuer.metadata',
      request: {
        method: 'GET',
        url: `${ORIGIN}/ref/issuer/draft13/.well-known/openid-credential-issuer`,
        headers: { accept: 'application/json' },
      },
      response: { status: 200 },
    });
    expect(JSON.parse(recorded[0]!.response!.body!)).toMatchObject({
      credential_issuer: `${ORIGIN}/ref/issuer/draft13`,
    });

    // A POST body is recorded as sent, before any parser sees it.
    const token = await app.inject({
      method: 'POST',
      url: '/ref/issuer/draft13/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload:
        'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=nope',
    });
    expect(token.statusCode).toBe(400);
    expect(exchangesOf(app, runId)[1]).toMatchObject({
      step: 'token',
      request: { body: expect.stringContaining('pre-authorized_code=nope') as string },
      response: { status: 400 },
    });
    await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
  });
});

describe('mobile-wallet (phone) role', () => {
  it('completes when a scripted wallet consumes the QR payloads, with its traffic recorded inbound', async () => {
    app = await buildTestApp();
    const server = app;
    const runId = await startRun(server, PHONE_CELL);
    // The phone reaches the playground from outside: no attribution headers, only the claims.
    const phoneFetch = injectFetch(server, ORIGIN);

    const offer = await actionOf(server, runId, 'scan-offer');
    expect(offer.qrText).toMatch(/^openid-credential-offer:\/\/\?credential_offer_uri=/);
    const holderKey = createHolderKey('ES256', 'did:jwk');
    const issued = await acceptOffer(offer.qrText!, { fetch: phoneFetch, holderKey });
    expect(issued.credentials[0]?.format).toBe('vc+sd-jwt');

    const request = await actionOf(server, runId, 'scan-request');
    const wallet = new PresentationClient({
      fetch: phoneFetch,
      holder: { keyPair: holderKey.keyPair, did: holderKey.did, verificationMethod: holderKey.kid! },
      didResolver: server.playground.reference.didResolver,
      documentLoader: server.playground.reference.documentLoader,
    });
    const resolved = await wallet.resolveRequest(request.qrText!);
    const response = await wallet.buildResponse(
      resolved,
      wallet.selectCredentials(resolved, [
        { id: 'phone-1', format: 'vc+sd-jwt', raw: issued.credentials[0]!.raw },
      ]),
    );
    await wallet.submit(resolved, response);

    const report = InteropReportSchema.parse(await server.playground.orchestrator.wait(runId));
    expect(report).toMatchObject({ outcome: 'VALID', verdict: 'pass', wallet: { id: 'mobile-wallet' } });
    const exchanges = exchangesOf(server, runId);
    expect(exchanges.every((exchange) => exchange.capture === 'inbound')).toBe(true);
    expect(new Set(exchanges.map((exchange) => exchange.from))).toEqual(new Set(['mobile-wallet']));
    expect(exchanges.map((exchange) => exchange.step)).toEqual(
      expect.arrayContaining([
        'issuer.offer',
        'token',
        'credential',
        'wallet.fetch-request',
        'wallet.submit',
      ]),
    );
    // The held credential was taken from the recorded credential response.
    const credentialArtefact = server.playground.store
      .listEvents(runId)
      .find((event) => event.type === 'artifact' && event.kind === 'credential');
    expect(credentialArtefact).toMatchObject({ raw: issued.credentials[0]!.raw });
  });

  it('continues when the person presses "done" for traffic the playground cannot see', async () => {
    app = await buildTestApp();
    const runId = await startRun(app, PHONE_CELL);
    const offer = await actionOf(app, runId, 'scan-offer');
    const done = await app.inject({
      method: 'POST',
      url: `/api/runs/${runId}/person-done`,
      payload: { actionId: offer.id },
    });
    expect(done.statusCode, done.body).toBeLessThan(300);
    await actionOf(app, runId, 'scan-request');
    await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
    const report = await app.playground.orchestrator.wait(runId);
    expect(report.outcome).toBe('NOT_RUN');
  });
});
