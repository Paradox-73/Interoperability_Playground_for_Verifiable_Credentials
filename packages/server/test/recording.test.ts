// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The outbound recording client against a real HTTP server on a test port: what it stores, what it
 * hands back to the caller, and how it reports network failures and aborts.
 */
import type { Server } from 'node:http';
import { RoleError, type RecordedExchange } from '@inji-playground/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecordingFetch, type ExchangeDraft, type ExchangeRecorder } from '../src/recording/http-client.js';
import { listenInTestRange, unusedTestPort } from './helpers.js';

let server: Server;
let base: string;

beforeAll(async () => {
  ({ server, url: base } = await listenInTestRange((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (request.url === '/binary') {
        response.setHeader('content-type', 'application/cbor');
        response.end(Buffer.from([0xa1, 0xff, 0x00, 0xfe]));
      } else if (request.url === '/empty') {
        response.statusCode = 204;
        response.end();
      } else if (request.url === '/slow') {
        setTimeout(() => response.end('late'), 2_000);
      } else {
        response.setHeader('content-type', 'application/json');
        response.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
        response.statusCode = 400;
        response.end(
          JSON.stringify({ error: 'invalid_request', echo: Buffer.concat(chunks).toString('utf8') }),
        );
      }
    });
  }));
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

function memoryRecorder(): ExchangeRecorder & { all: RecordedExchange[] } {
  const all: RecordedExchange[] = [];
  return {
    all,
    record(draft: ExchangeDraft) {
      const exchange = { ...draft, id: `x${all.length + 1}`, runId: 'r1', seq: all.length + 1 };
      all.push(exchange);
      return exchange;
    },
    list: () => all,
  };
}

describe('RecordingFetch', () => {
  it('records request and response as on the wire and returns an unread response', async () => {
    const recorder = memoryRecorder();
    const client = new RecordingFetch({ recorder, from: 'ref-wallet', currentStep: () => 'token' });
    const response = await client.fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'abc',
      }),
      to: 'inji-certify',
    });

    expect(response.status).toBe(400);
    expect(response.url).toBe(`${base}/token`);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });

    const [exchange] = client.exchanges();
    expect(exchange).toMatchObject({
      seq: 1,
      capture: 'outbound',
      step: 'token',
      from: 'ref-wallet',
      to: 'inji-certify',
      request: {
        method: 'POST',
        url: `${base}/token`,
        body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=abc',
        bodyEncoding: 'utf8',
      },
      response: { status: 400, bodyEncoding: 'utf8' },
    });
    expect(exchange?.request.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(exchange?.response?.headers['set-cookie']).toBe('a=1; Path=/, b=2; Path=/');
    expect(JSON.parse(exchange?.response?.body ?? '')).toMatchObject({
      echo: expect.stringContaining('pre-authorized_code=abc'),
    });
    expect(exchange?.durationMs).toBeGreaterThanOrEqual(0);
    expect(exchange?.error).toBeUndefined();
  });

  it('stores binary bodies as base64 and handles bodiless responses', async () => {
    const recorder = memoryRecorder();
    const client = new RecordingFetch({ recorder, from: 'ref-wallet' });
    const binary = await client.fetch(`${base}/binary`, { step: 'credential' });
    expect(new Uint8Array(await binary.arrayBuffer())).toEqual(new Uint8Array([0xa1, 0xff, 0x00, 0xfe]));
    const empty = await client.fetch(`${base}/empty`);
    expect(empty.status).toBe(204);

    expect(recorder.all[0]?.response).toMatchObject({ body: 'of8A/g==', bodyEncoding: 'base64' });
    expect(recorder.all[0]?.step).toBe('credential');
    expect(recorder.all[1]?.response?.body).toBeUndefined();
    expect(recorder.all[1]?.step).toBeUndefined();
  });

  it('records a refused connection and throws an environment RoleError linked to it', async () => {
    const recorder = memoryRecorder();
    const client = new RecordingFetch({ recorder, from: 'inji-verify-adapter' });
    const port = await unusedTestPort();
    const error = await client
      .fetch(`http://127.0.0.1:${port}/v1/verify/vp-request`)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RoleError);
    expect(error).toMatchObject({ code: 'network.ECONNREFUSED', category: 'environment', exchangeId: 'x1' });
    expect(recorder.all[0]?.response).toBeUndefined();
    expect(recorder.all[0]?.error).toMatch(/ECONNREFUSED/);
  });

  it('lets an abort through unchanged and records why', async () => {
    const recorder = memoryRecorder();
    const controller = new AbortController();
    const client = new RecordingFetch({
      recorder,
      from: 'ref-wallet',
      defaultSignal: () => controller.signal,
    });
    const pending = client.fetch(`${base}/slow`);
    setTimeout(() => controller.abort(new Error('step timed out')), 50);
    await expect(pending).rejects.toThrow('step timed out');
    expect(recorder.all[0]?.error).toBe('aborted: step timed out');
  });
});
