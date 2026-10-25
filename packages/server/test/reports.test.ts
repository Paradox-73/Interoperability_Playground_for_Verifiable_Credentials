// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Run reports (problem statement task 7): the JSON document and the Markdown rendering, error detail
 * with the link to the failing exchange, versions and step timings, the recorded credential size, and
 * the report and export routes.
 */
import { randomBytes } from 'node:crypto';
import { RunExportSchema, RunReportDocumentSchema, type RunDetail } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReportDocument, renderReportMarkdown } from '../src/reports/report.js';
import { measureCredential } from '../src/reports/credential-size.js';
import { RunStore } from '../src/store/run-store.js';
import { FAKE_CELL, buildTestApp, fakeSet, registrations } from './helpers.js';
import { okSteps, seedRun, tokenExchange } from './run-fixtures.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function finishedRun(server: FastifyInstance, body: object): Promise<string> {
  const res = await server.inject({ method: 'POST', url: '/api/runs', payload: body });
  expect(res.statusCode, res.body).toBe(201);
  const { runId } = res.json<{ runId: string }>();
  await server.playground.orchestrator.wait(runId);
  return runId;
}

function failedRunInStore() {
  const store = RunStore.open(':memory:');
  const failing = tokenExchange('run-f', 2, {
    response: {
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: '{"error":"invalid_grant"}',
    },
    request: {
      method: 'POST',
      url: 'http://127.0.0.1:28100/ref/as/token?code=AUTH-CODE-9',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=AUTH-CODE-9',
    },
  });
  seedRun(store, {
    id: 'run-f',
    createdAt: '2026-10-04T10:00:00.000Z',
    config: { issuer: 'inji-certify', verifier: 'inji-verify', format: 'ldp_vc' },
    versions: { issuer: '0.14.0', verifier: '0.18.2' },
    exchanges: [tokenExchange('run-f', 1), failing],
    report: {
      outcome: 'ERROR',
      verdict: 'fail',
      error: { step: 'token', code: 'http.400', message: 'The token endpoint rejected the grant.' },
      steps: [
        { step: 'issuer.offer', status: 'ok', durationMs: 120 },
        { step: 'issuer.metadata', status: 'ok', durationMs: 340.25 },
        { step: 'token', status: 'failed', durationMs: 55 },
        { step: 'verifier.request', status: 'not-run', durationMs: 0 },
      ],
    },
  });
  return store;
}

describe('report document', () => {
  it('carries versions, labelled steps with timings, and the failing exchange with links', () => {
    const store = failedRunInStore();
    const run = store.getRun('run-f') as RunDetail & { report: NonNullable<RunDetail['report']> };
    const doc = RunReportDocumentSchema.parse(
      buildReportDocument(run, store.listExchanges('run-f'), '0.1.0', new Date('2026-10-04T12:00:00Z')),
    );
    expect(doc.versions).toEqual({
      issuer: '0.14.0',
      wallet: '0.1.0',
      verifier: '0.18.2',
      playground: '0.1.0',
    });
    expect(doc.steps.map((step) => [step.step, step.status, step.durationMs])).toEqual([
      ['issuer.offer', 'ok', 120],
      ['issuer.metadata', 'ok', 340.25],
      ['token', 'failed', 55],
      ['verifier.request', 'not-run', 0],
    ]);
    expect(doc.steps[2]?.protocolTerm).toBe('Token Request');
    expect(doc.run.totalStepMs).toBe(515.3);
    // The error named no exchange: the failing exchange of its step is found and linked.
    expect(doc.error?.exchangeId).toBe('run-f-x2');
    expect(doc.error?.exchange).toMatchObject({
      seq: 2,
      method: 'POST',
      status: 400,
      apiLink: '/api/runs/run-f/exchanges#run-f-x2',
      uiLink: '/runs/run-f?exchange=run-f-x2',
    });
    // The summarised URL is redacted: reports are meant to be shared.
    expect(doc.error?.exchange?.url).not.toContain('AUTH-CODE-9');
    store.close();
  });

  it('renders Markdown with issuer, wallet, verifier, format, proof type, outcome and error detail', () => {
    const store = failedRunInStore();
    const run = store.getRun('run-f') as RunDetail & { report: NonNullable<RunDetail['report']> };
    const markdown = renderReportMarkdown(buildReportDocument(run, store.listExchanges('run-f'), '0.1.0'));
    expect(markdown).toMatch(/^# Interoperability report: run run-f/);
    expect(markdown).toContain('| Issuer | Inji Certify (`inji-certify`, 0.14.0, inji) |');
    expect(markdown).toContain('| Wallet | Reference wallet (`ref-wallet`, 0.1.0, reference) |');
    expect(markdown).toContain('| Verifier | Inji Verify (`inji-verify`, 0.18.2, inji) |');
    expect(markdown).toContain('| Format | `ldp_vc` |');
    expect(markdown).toContain('| Proof type | Ed25519Signature2020 |');
    expect(markdown).toContain('| Outcome | ERROR (expected VALID) |');
    expect(markdown).toContain('| Verdict | FAIL |');
    expect(markdown).toContain(
      '| Error detail | `http.400` at token: The token endpoint rejected the grant. |',
    );
    expect(markdown).toContain('## Error detail');
    expect(markdown).toContain('/runs/run-f?exchange=run-f-x2');
    expect(markdown).toContain(
      '| 3 | Wallet exchanges the one-time code for an access token | Token Request | failed | 55 |',
    );
    expect(markdown).not.toContain('AUTH-CODE-9');
    store.close();
  });

  it('escapes pipes and line breaks inside table cells', () => {
    const store = RunStore.open(':memory:');
    seedRun(store, {
      id: 'run-p',
      createdAt: '2026-10-04T10:00:00.000Z',
      report: {
        outcome: 'INVALID',
        verdict: 'fail',
        error: { step: 'verifier.result', code: 'x', message: 'a | b\nc' },
      },
    });
    const run = store.getRun('run-p') as RunDetail & { report: NonNullable<RunDetail['report']> };
    const markdown = renderReportMarkdown(buildReportDocument(run, [], '0.1.0'));
    expect(markdown).toContain('| Error detail | `x` at verifier.result: a \\| b c |');
    store.close();
  });
});

describe('credential size', () => {
  it('measures bytes and the PixelPass QR text, and flags credentials too large for a version 40 QR', () => {
    const small = measureCredential(
      JSON.stringify({ '@context': ['https://www.w3.org/2018/credentials/v1'], id: 'x' }),
    );
    expect(small?.bytes).toBeGreaterThan(0);
    expect(small?.pixelpassChars).toBeGreaterThan(0);
    expect(small?.fitsQrV40).toBe(true);
    // Random data hardly compresses: 8,000 base64 characters of it cannot fit 4,296 QR characters.
    const noise = randomBytes(6000).toString('base64');
    const large = measureCredential(noise);
    expect(large?.fitsQrV40).toBe(false);
    expect(large?.pixelpassChars).toBeGreaterThan(4296);
  });

  it('is recorded in the report of a run that received a credential', async () => {
    app = await buildTestApp({ roles: registrations(fakeSet().roles) });
    const runId = await finishedRun(app, FAKE_CELL);
    const run = app.playground.store.getRun(runId);
    expect(run?.report?.credentialSize).toMatchObject({ fitsQrV40: true });
    expect(run?.report?.credentialSize?.bytes).toBeGreaterThan(0);
    expect(run?.report?.credentialSize?.pixelpassChars).toBeGreaterThan(0);
    const [credential] = app.playground.store
      .listArtifacts(runId)
      .filter((artifact) => artifact.kind === 'credential');
    expect(run?.report?.credentialSize?.bytes).toBe(Buffer.byteLength(credential?.raw ?? ''));
  });

  it('is absent when no credential was received', async () => {
    app = await buildTestApp({
      roles: registrations(fakeSet({ issuer: { failIn: 'startIssuance' } }).roles),
    });
    const runId = await finishedRun(app, FAKE_CELL);
    expect(app.playground.store.getRun(runId)?.report?.credentialSize).toBeUndefined();
  });
});

describe('report routes', () => {
  it('serve report.json, report.md (with download names) and 409 before the run finishes', async () => {
    app = await buildTestApp({ roles: registrations(fakeSet({ wallet: { failIn: 'present' } }).roles) });
    const runId = await finishedRun(app, FAKE_CELL);

    const json = await app.inject(`/api/runs/${runId}/report.json`);
    expect(json.statusCode, json.body).toBe(200);
    const doc = RunReportDocumentSchema.parse(json.json());
    expect(doc.report.verdict).toBe('fail');
    expect(doc.error?.code).toBe('fake.failure');
    expect(doc.links.markdown).toBe(`/api/runs/${runId}/report.md`);

    const md = await app.inject(`/api/runs/${runId}/report.md?download=true`);
    expect(md.statusCode).toBe(200);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.headers['content-disposition']).toBe(`attachment; filename="run-${runId}.md"`);
    expect(md.body).toContain('| Issuer | Test role (fake) issuer');
    expect(md.body).toContain('| Error detail | `fake.failure`');

    expect((await app.inject('/api/runs/nope/report.md')).statusCode).toBe(404);

    // A run that hangs has no report yet.
    await app.close();
    app = await buildTestApp({
      roles: registrations(fakeSet({ wallet: { hangIn: 'receiveCredential' } }).roles),
    });
    const created = await app.inject({ method: 'POST', url: '/api/runs', payload: FAKE_CELL });
    const pending = created.json<{ runId: string }>().runId;
    const early = await app.inject(`/api/runs/${pending}/report.json`);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ error: 'run-not-finished' });
  });

  it('export redacts tokens and codes in exchanges, events and offers but keeps the evidence', async () => {
    app = await buildTestApp();
    const { store } = app.playground;
    seedRun(store, {
      id: 'run-e',
      createdAt: '2026-10-04T10:00:00.000Z',
      exchanges: [
        tokenExchange('run-e', 1),
        tokenExchange('run-e', 2, {
          step: 'credential',
          request: {
            method: 'POST',
            url: 'http://127.0.0.1:28100/ref/issuer/credential',
            headers: { authorization: 'Bearer ACCESS-SECRET-abc', 'content-type': 'application/json' },
            body: '{"format":"vc+sd-jwt","proof":{"proof_type":"jwt","jwt":"eyJhbGciOiJFUzI1NiJ9.e30.sig"}}',
          },
          response: {
            status: 200,
            headers: {},
            body: '{"credential":"eyJ0eXAiOiJ2YytzZC1qd3QifQ.e30.sig~WyJzYWx0IiwibmFtZSIsIkEiXQ~"}',
          },
        }),
      ],
      report: { steps: okSteps() },
    });
    const offer =
      'openid-credential-offer://?credential_offer=' +
      encodeURIComponent(
        JSON.stringify({
          credential_issuer: 'http://127.0.0.1:28100/ref/issuer',
          grants: {
            'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
              'pre-authorized_code': 'PREAUTH-SECRET-123',
            },
          },
        }),
      );
    store.appendEvent(
      { type: 'artifact', runId: 'run-e', kind: 'offer', raw: offer },
      '2026-10-04T10:00:00.500Z',
    );

    const res = await app.inject('/api/runs/run-e/export');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="run-run-e.export.json"');
    const body = RunExportSchema.parse(res.json());
    const text = res.body;
    for (const secret of ['PREAUTH-SECRET-123', 'ACCESS-SECRET-abc', 'COOKIE-SECRET', '4711']) {
      expect(text, `${secret} leaked`).not.toContain(secret);
    }
    expect(body.redacted).toBe(true);
    expect(body.redactions).toBeGreaterThanOrEqual(8);
    expect(body.exchanges.every((exchange) => exchange.redacted)).toBe(true);
    // Same token, same placeholder: the reader can follow it from the token response to the credential request.
    const issued = JSON.parse(body.exchanges[0]?.response?.body ?? '{}') as { access_token: string };
    expect(body.exchanges[1]?.request.headers.authorization).toBe(`Bearer ${issued.access_token}`);
    // Evidence stays: credential, proof JWT, metadata, nonce.
    expect(text).toContain('eyJ0eXAiOiJ2YytzZC1qd3QifQ.e30.sig~WyJzYWx0IiwibmFtZSIsIkEiXQ~');
    expect(text).toContain('nonce-1');
    expect(body.artifacts[0]?.raw).toContain('credential_issuer');
    expect(body.events.filter((event) => event.type === 'exchange')).toHaveLength(2);
  });
});
