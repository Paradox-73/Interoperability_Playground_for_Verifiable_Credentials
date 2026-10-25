// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `GET /ws` through `app.injectWS()`: live streaming in order, replay for late subscribers, and
 * answers to malformed messages.
 */
import { WsServerMessageSchema, type WsServerMessage } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import { FAKE_CELL, buildTestApp, fakeSet, registrations } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Collects every message of a socket, parsed and validated against the protocol. */
function inbox(socket: WebSocket) {
  const messages: WsServerMessage[] = [];
  const waiters: Array<() => void> = [];
  socket.on('message', (data: Buffer) => {
    messages.push(WsServerMessageSchema.parse(JSON.parse(data.toString('utf8'))));
    for (const wake of waiters.splice(0)) wake();
  });
  return {
    messages,
    /** Resolves when a message satisfies the predicate (checking those already received first). */
    async until(predicate: (message: WsServerMessage) => boolean, timeoutMs = 2_000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (!messages.some(predicate)) {
        if (Date.now() > deadline)
          throw new Error(`no matching message; got ${JSON.stringify(messages.map((m) => m.type))}`);
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
    },
  };
}

describe('GET /ws', () => {
  it('streams run.started ... run.finished in order to a client subscribed to all runs (TC_PG_WS_01)', async () => {
    app = await buildTestApp({ roles: registrations(fakeSet().roles) });
    const socket = await app.injectWS('/ws');
    const box = inbox(socket);
    socket.send(JSON.stringify({ type: 'subscribe', runId: '*' }));
    await box.until((message) => message.type === 'subscribed');

    const { runId } = app.playground.orchestrator.create(FAKE_CELL);
    await box.until((message) => message.type === 'run.finished');
    socket.terminate();

    const runEvents = box.messages.filter((message) => message.type !== 'subscribed');
    expect(runEvents.map((message) => message.type)).toEqual([
      'run.started',
      'step.started', // issuer.offer
      'step.finished',
      'artifact', // offer
      'step.started', // issuer.metadata
      'step.finished', // skipped: the fake wallet reads no metadata
      'step.started', // credential
      'step.finished',
      'artifact', // credential
      'step.started', // verifier.request
      'step.finished',
      'step.started', // wallet.fetch-request
      'step.finished',
      'step.started', // wallet.submit
      'artifact', // vp-token
      'step.finished',
      'step.started', // verifier.result
      'step.finished',
      'artifact', // result
      'run.finished',
    ]);
    // Exactly what was stored, in the same order.
    expect(runEvents).toEqual(app.playground.store.listEvents(runId));
  });

  it('replays the stored events of a finished run to a late subscriber, then acknowledges', async () => {
    app = await buildTestApp({ roles: registrations(fakeSet().roles) });
    const { runId } = app.playground.orchestrator.create(FAKE_CELL);
    await app.playground.orchestrator.wait(runId);

    // Messages sent on connection arrive before injectWS resolves, so listen from the start.
    let box: ReturnType<typeof inbox> | undefined;
    const socket = await app.injectWS(`/ws?runId=${runId}`, {}, { onInit: (ws) => (box = inbox(ws)) });
    if (!box) throw new Error('onInit was not called');
    await box.until((message) => message.type === 'run.finished');
    socket.terminate();
    expect(box.messages[0]).toEqual({ type: 'subscribed', runId });
    expect(box.messages.slice(1)).toEqual(app.playground.store.listEvents(runId));
  });

  it('streams only the subscribed run, and stops after unsubscribe', async () => {
    app = await buildTestApp({
      roles: registrations(fakeSet({ verifier: { hangIn: 'awaitResult' } }).roles),
    });
    const services = app.playground;
    const first = services.orchestrator.create(FAKE_CELL).runId;
    const second = services.orchestrator.create(FAKE_CELL).runId;

    const socket = await app.injectWS('/ws');
    const box = inbox(socket);
    socket.send(JSON.stringify({ type: 'subscribe', runId: first }));
    await box.until((message) => message.type === 'subscribed');
    services.orchestrator.cancel(first);
    await box.until((message) => message.type === 'run.finished');
    expect(box.messages.every((message) => !('runId' in message) || message.runId === first)).toBe(true);

    socket.send(JSON.stringify({ type: 'unsubscribe', runId: first }));
    await box.until((message) => message.type === 'unsubscribed');
    services.orchestrator.cancel(second);
    await services.orchestrator.wait(second);
    socket.terminate();
    expect(box.messages.some((message) => 'runId' in message && message.runId === second)).toBe(false);
  });

  it('answers malformed messages and unknown runs with an error message', async () => {
    app = await buildTestApp();
    const socket = await app.injectWS('/ws');
    const box = inbox(socket);
    socket.send('not json');
    socket.send(JSON.stringify({ type: 'subscribe' }));
    socket.send(JSON.stringify({ type: 'subscribe', runId: 'no-such-run' }));
    await box.until(() => box.messages.length >= 3);
    socket.terminate();
    expect(box.messages.map((message) => message.type)).toEqual(['error', 'error', 'error']);
    expect(box.messages[2]).toMatchObject({ message: 'no run with id "no-such-run"' });
  });

  it('accepts the playground page origins and clients without an Origin header', async () => {
    app = await buildTestApp();
    const port = app.playground.config.port;
    for (const origin of [undefined, `http://localhost:${port}`, 'http://localhost:28173']) {
      const headers = origin ? { origin } : {};
      const socket = await app.injectWS('/ws', { headers });
      const box = inbox(socket);
      socket.send(JSON.stringify({ type: 'subscribe', runId: '*' }));
      await box.until((message) => message.type === 'subscribed');
      socket.terminate();
    }
  });

  it('refuses the upgrade from a foreign page origin', async () => {
    app = await buildTestApp();
    await expect(app.injectWS('/ws', { headers: { origin: 'https://evil.example' } })).rejects.toThrow(/403/);
  });
});
