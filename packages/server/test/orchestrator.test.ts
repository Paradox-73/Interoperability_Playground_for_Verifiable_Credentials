// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The orchestrator end to end with fake roles: the four phases, verdicts for every way a run can end,
 * timeouts, cancellation, waits for a person, verifier callbacks, scenario hooks, serialised live runs
 * and replays. Each run goes through the real store and event bus.
 */
import {
  InteropReportSchema,
  RoleError,
  type IssuerRole,
  type RunEvent,
  type WalletRole,
} from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeIssuer,
  createFakeVerifier,
  createFakeWallet,
  FakeNetwork,
} from '../src/orchestrator/fake-roles.js';
import {
  FAKE_CELL,
  buildTestApp,
  fakeSet,
  listenInTestRange,
  registrations,
  scenarioCatalogue,
  type FakeSetOptions,
} from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appWith(options: FakeSetOptions = {}, extra: Parameters<typeof buildTestApp>[0] = {}) {
  app = await buildTestApp({ roles: registrations(fakeSet(options).roles), ...extra });
  return app.playground;
}

function collect(services: FastifyInstance['playground']): RunEvent[] {
  const events: RunEvent[] = [];
  services.bus.subscribeAll((event) => events.push(event));
  return events;
}

describe('a run with fake roles', () => {
  it('goes through issue, hold, present and verify, and stores a passing report (TC_PG_RUN_01)', async () => {
    const services = await appWith();
    const events = collect(services);
    const { runId } = services.orchestrator.create(FAKE_CELL);
    const report = await services.orchestrator.wait(runId);

    expect(report).toMatchObject({
      outcome: 'VALID',
      verdict: 'pass',
      mode: 'reference',
      format: 'vc+sd-jwt',
    });
    expect(report.error).toBeUndefined();
    expect(InteropReportSchema.parse(report)).toEqual(report);

    // One step per role call, plus the protocol steps the roles moved to.
    expect(report.steps.map((step) => [step.step, step.status])).toEqual([
      ['issuer.offer', 'ok'],
      ['issuer.metadata', 'skipped'],
      ['credential', 'ok'],
      ['verifier.request', 'ok'],
      ['wallet.fetch-request', 'skipped'],
      ['wallet.submit', 'ok'],
      ['verifier.result', 'ok'],
    ]);

    const stored = services.store.getRun(runId);
    expect(stored).toMatchObject({ status: 'finished', verdict: 'pass', outcome: 'VALID' });
    expect(stored?.report).toEqual(report);

    const types = events.map((event) => event.type);
    expect(types[0]).toBe('run.started');
    expect(types.at(-1)).toBe('run.finished');
    expect(services.store.listEvents(runId)).toEqual(events);
    expect(services.store.listArtifacts(runId).map((artifact) => artifact.kind)).toEqual([
      'offer',
      'credential',
      'vp-token',
      'result',
    ]);
  });

  it('gives verdict fail with the failing step, code and message when a role rejects a message (TC_PG_RUN_02)', async () => {
    const services = await appWith({
      wallet: {
        failIn: 'receiveCredential',
        failWith: { code: 'http.400', message: 'invalid_proof: nonce mismatch' },
      },
    });
    const { runId } = services.orchestrator.create(FAKE_CELL);
    const report = await services.orchestrator.wait(runId);

    expect(report.outcome).toBe('ERROR');
    expect(report.verdict).toBe('fail');
    expect(report.error).toEqual({
      step: 'issuer.metadata',
      code: 'http.400',
      message: 'invalid_proof: nonce mismatch',
    });
    expect(report.steps.filter((step) => step.status === 'not-run').map((step) => step.step)).toEqual([
      'verifier.request',
      'wallet.fetch-request',
      'verifier.result',
    ]);
    expect(services.store.listRuns({ limit: 10, offset: 0, verdict: 'fail' }).total).toBe(1);
  });

  it('gives verdict error when the failure says nothing about interoperability', async () => {
    const services = await appWith({
      issuer: {
        failIn: 'startIssuance',
        failWith: { code: 'network.ECONNREFUSED', message: 'down', category: 'environment' },
      },
    });
    const report = await services.orchestrator.wait(services.orchestrator.create(FAKE_CELL).runId);
    expect(report).toMatchObject({ outcome: 'NOT_RUN', verdict: 'error' });
    expect(report.error).toMatchObject({ step: 'issuer.offer', code: 'network.ECONNREFUSED' });
  });

  it('reports a wrong verifier answer as fail at verifier.result', async () => {
    const services = await appWith({ verifier: { outcome: 'EXPIRED' } });
    const report = await services.orchestrator.wait(services.orchestrator.create(FAKE_CELL).runId);
    expect(report).toMatchObject({ outcome: 'EXPIRED', verdict: 'fail' });
    expect(report.error).toMatchObject({ step: 'verifier.result', code: 'outcome.unexpected' });
  });

  it('rejects a result that does not match the contract as role.invalid-output', async () => {
    const network = new FakeNetwork();
    const broken: IssuerRole = {
      ...createFakeIssuer(),
      startIssuance: () => Promise.resolve({ mode: 'credential-offer' } as never),
    };
    app = await buildTestApp({
      roles: registrations([broken, createFakeWallet(network), createFakeVerifier(network)]),
    });
    const report = await app.playground.orchestrator.wait(
      app.playground.orchestrator.create(FAKE_CELL).runId,
    );
    expect(report.error).toMatchObject({ step: 'issuer.offer', code: 'role.invalid-output' });
    expect(report.verdict).toBe('fail');
  });
});

describe('timeouts and cancellation', () => {
  it('aborts the run when a step exceeds its timeout, and aborts the role too (TC_PG_RUN_03)', async () => {
    let roleSignal: AbortSignal | undefined;
    const network = new FakeNetwork();
    const base = createFakeWallet(network);
    const hanging: WalletRole = {
      ...base,
      receiveCredential: (ctx) => {
        roleSignal = ctx.signal;
        return new Promise(() => undefined); // ignores the signal on purpose
      },
    };
    const set = fakeSet();
    app = await buildTestApp({
      roles: registrations([set.roles[0]!, hanging, set.roles[2]!]),
      env: { PLAYGROUND_TIMEOUT_REFERENCE_MS: '60' },
    });
    const services = app.playground;
    const started = performance.now();
    const report = await services.orchestrator.wait(services.orchestrator.create(FAKE_CELL).runId);

    expect(performance.now() - started).toBeLessThan(2_000);
    expect(report).toMatchObject({ outcome: 'NOT_RUN', verdict: 'error' });
    expect(report.error).toMatchObject({ step: 'issuer.metadata', code: 'timeout' });
    expect(report.error?.message).toMatch(/60 ms/);
    expect(roleSignal?.aborted).toBe(true);
    expect(report.steps.find((step) => step.step === 'verifier.request')?.status).toBe('not-run');
  });

  it('gives each protocol step a fresh timeout when the role moves on', async () => {
    const set = fakeSet();
    const base = createFakeWallet(set.network);
    const slowButSteady: WalletRole = {
      ...base,
      receiveCredential: async (ctx, start) => {
        for (const step of ['issuer.metadata', 'token', 'nonce'] as const) {
          ctx.enterStep(step);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        return base.receiveCredential(ctx, start);
      },
    };
    app = await buildTestApp({
      roles: registrations([set.roles[0]!, slowButSteady, set.roles[2]!]),
      env: { PLAYGROUND_TIMEOUT_REFERENCE_MS: '100' },
    });
    const report = await app.playground.orchestrator.wait(
      app.playground.orchestrator.create(FAKE_CELL).runId,
    );
    expect(report.verdict).toBe('pass');
  });

  it('uses the Inji timeout when an Inji role takes part in the step', async () => {
    const services = await appWith(
      { issuer: { ecosystem: 'inji', delayMs: { startIssuance: 120 } } },
      { env: { PLAYGROUND_TIMEOUT_REFERENCE_MS: '50', PLAYGROUND_TIMEOUT_INJI_MS: '5000' } },
    );
    const report = await services.orchestrator.wait(services.orchestrator.create(FAKE_CELL).runId);
    expect(report).toMatchObject({ mode: 'live', verdict: 'pass' });
  });

  it('cancels a running run with verdict error and code run.cancelled', async () => {
    const services = await appWith({ verifier: { hangIn: 'awaitResult' } });
    const { runId } = services.orchestrator.create(FAKE_CELL);
    await waitUntil(() =>
      services.store
        .listEvents(runId)
        .some((event) => event.type === 'step.started' && event.step === 'verifier.result'),
    );
    services.orchestrator.cancel(runId);
    const report = await services.orchestrator.wait(runId);
    expect(report).toMatchObject({ verdict: 'error', outcome: 'NOT_RUN' });
    expect(report.error).toMatchObject({ step: 'verifier.result', code: 'run.cancelled' });
  });
});

describe('waiting for a person', () => {
  it('pauses the step timeout and continues when the person is done', async () => {
    const services = await appWith(
      { wallet: { interaction: 'manual', id: 'fake-wallet' } },
      { env: { PLAYGROUND_TIMEOUT_PERSON_MS: '5000' } },
    );
    const events = collect(services);
    const { runId } = services.orchestrator.create(FAKE_CELL);

    await waitUntil(() => services.orchestrator.pendingAction(runId) !== undefined);
    const offerAction = services.orchestrator.pendingAction(runId)!;
    expect(offerAction).toMatchObject({ kind: 'scan-offer' });
    expect(offerAction.qrText).toMatch(/^openid-credential-offer:\/\//);
    expect(() => services.orchestrator.personDone(runId, 'some-other-action')).toThrow(/waiting for action/);
    services.orchestrator.personDone(runId, offerAction.id);

    await waitUntil(() => services.orchestrator.pendingAction(runId)?.kind === 'scan-request');
    services.orchestrator.personDone(runId);

    const report = await services.orchestrator.wait(runId);
    expect(report.verdict).toBe('pass');
    expect(events.filter((event) => event.type === 'person.action-needed')).toHaveLength(2);
    expect(report.steps.map((step) => step.step)).toContain('person.action');
  });

  it('fails with person.timeout (verdict error) when nobody acts', async () => {
    const network = new FakeNetwork();
    const base = createFakeWallet(network);
    const impatient: WalletRole = {
      ...base,
      receiveCredential: async (ctx) => {
        await ctx.waitForPerson({
          id: 'a1',
          kind: 'confirm',
          title: 'Press done',
          instructions: ['Press done'],
          timeoutMs: 30,
        });
        throw new Error('unreachable');
      },
    };
    const set = fakeSet();
    app = await buildTestApp({ roles: registrations([set.roles[0]!, impatient, set.roles[2]!]) });
    const report = await app.playground.orchestrator.wait(
      app.playground.orchestrator.create(FAKE_CELL).runId,
    );
    expect(report).toMatchObject({ verdict: 'error', error: { code: 'person.timeout' } });
  });
});

describe('verifier callbacks', () => {
  it('hands callbacks to the verifier role, also when they arrive before it asks', async () => {
    const services = await appWith({ verifier: { interaction: 'browser', id: 'fake-verifier' } });
    const { runId } = services.orchestrator.create(FAKE_CELL);
    services.orchestrator.deliverCallback(runId, { kind: 'vp-received', transactionId: 'txn-1' });
    const report = await services.orchestrator.wait(runId);
    expect(report.verdict).toBe('pass');
  });

  it('turns an error callback into a failed verification step', async () => {
    const services = await appWith({ verifier: { interaction: 'browser', id: 'fake-verifier' } });
    const { runId } = services.orchestrator.create(FAKE_CELL);
    await waitUntil(() =>
      services.store
        .listEvents(runId)
        .some((event) => event.type === 'step.started' && event.step === 'verifier.result'),
    );
    services.orchestrator.deliverCallback(runId, {
      kind: 'error',
      errorCode: 'access_denied',
      errorMessage: 'holder declined',
    });
    const report = await services.orchestrator.wait(runId);
    expect(report.error).toMatchObject({
      step: 'verifier.result',
      code: 'verifier.access_denied',
      message: 'holder declined',
    });
  });
});

describe('scenario hooks', () => {
  const tamper = {
    id: 'tamper.altered-presentation',
    title: 'Altered presentation',
    description: 'One character of the presentation is changed after signing.',
    expected: 'INVALID' as const,
    target: 'presentation' as const,
  };
  const flip = (token: string): string => token.replace('Test Person', 'Test Persom');

  it('passes when the verifier rejects a tampered presentation the scenario expects to be rejected', async () => {
    const services = await appWith(
      {},
      {
        scenarios: scenarioCatalogue([tamper]),
        hooksFor: (s) => (s.id === tamper.id ? { tamperPresentation: flip } : {}),
      },
    );
    const report = await services.orchestrator.wait(
      services.orchestrator.create({ ...FAKE_CELL, scenario: tamper.id }).runId,
    );
    expect(report).toMatchObject({
      outcome: 'INVALID',
      verdict: 'pass',
      scenario: { id: tamper.id, expected: 'INVALID' },
    });
  });

  it('applies afterCredential before the wallet presents', async () => {
    const services = await appWith(
      {},
      {
        scenarios: scenarioCatalogue([{ ...tamper, id: 'tamper.credential', target: 'credential' }]),
        hooksFor: () => ({ afterCredential: (held) => ({ ...held, raw: flip(held.raw) }) }),
      },
    );
    const report = await services.orchestrator.wait(
      services.orchestrator.create({ ...FAKE_CELL, scenario: 'tamper.credential' }).runId,
    );
    expect(report.outcome).toBe('INVALID');
  });

  it('stops with scenario.hook-failed when a hook throws', async () => {
    const services = await appWith(
      {},
      { hooksFor: () => ({ beforeIssuance: () => Promise.reject(new Error('boom')) }) },
    );
    const report = await services.orchestrator.wait(services.orchestrator.create(FAKE_CELL).runId);
    expect(report).toMatchObject({
      verdict: 'error',
      error: { step: 'playground.admin', code: 'scenario.hook-failed' },
    });
  });
});

describe('compatibility', () => {
  it('stores an incompatible combination as not-supported without calling any role', async () => {
    const services = await appWith({ verifier: { formats: ['ldp_vc'] } });
    const events = collect(services);
    const report = await services.orchestrator.wait(services.orchestrator.create(FAKE_CELL).runId);
    expect(report).toMatchObject({ verdict: 'not-supported', outcome: 'NOT_RUN' });
    expect(report.error).toMatchObject({ code: 'compatibility.verifier.format-unsupported' });
    expect(report.error?.message).toMatch(/does not support the format vc\+sd-jwt/);
    expect(events.map((event) => event.type)).toEqual(['run.started', 'run.finished']);
  });

  it('refuses unknown roles, roles of the wrong kind and unknown scenarios', async () => {
    const services = await appWith();
    expect(() => services.orchestrator.create({ ...FAKE_CELL, issuer: 'nope' })).toThrow(
      /no role with id "nope"/,
    );
    expect(() => services.orchestrator.create({ ...FAKE_CELL, issuer: 'fake-wallet' })).toThrow(
      /is a wallet, not a issuer/,
    );
    expect(() => services.orchestrator.create({ ...FAKE_CELL, scenario: 'tamper.none' })).toThrow(
      /no scenario/,
    );
    expect(() => services.orchestrator.create({ issuer: 'fake-issuer' })).toThrow(
      /invalid run configuration/,
    );
  });
});

describe('live runs', () => {
  it('runs one live run at a time and reference runs in parallel', async () => {
    const network = new FakeNetwork();
    const slow = { delayMs: { startIssuance: 80 } };
    app = await buildTestApp({
      roles: registrations([
        createFakeIssuer({ id: 'fake-inji-issuer', ecosystem: 'inji', ...slow }),
        createFakeIssuer({ ...slow }),
        createFakeWallet(network),
        createFakeVerifier(network),
      ]),
    });
    const services = app.playground;
    const events = collect(services);
    const live1 = services.orchestrator.create({ ...FAKE_CELL, issuer: 'fake-inji-issuer' }).runId;
    const live2 = services.orchestrator.create({ ...FAKE_CELL, issuer: 'fake-inji-issuer' }).runId;
    const ref1 = services.orchestrator.create(FAKE_CELL).runId;

    expect(services.orchestrator.activeStatus(live2)).toBe('queued');
    expect(services.orchestrator.activeStatus(ref1)).toBe('running');
    await Promise.all([live1, live2, ref1].map((id) => services.orchestrator.wait(id)));

    const index = (runId: string, type: RunEvent['type']) =>
      events.findIndex((event) => event.runId === runId && event.type === type);
    expect(index(live2, 'run.started')).toBeGreaterThan(index(live1, 'run.finished'));
    expect(index(ref1, 'run.started')).toBeLessThan(index(live1, 'run.finished'));
  });

  it('can cancel a run while it waits for the stack', async () => {
    const services = await appWith({ issuer: { ecosystem: 'inji', delayMs: { startIssuance: 100 } } });
    const first = services.orchestrator.create(FAKE_CELL).runId;
    const second = services.orchestrator.create(FAKE_CELL).runId;
    services.orchestrator.cancel(second);
    const report = await services.orchestrator.wait(second);
    expect(report).toMatchObject({
      verdict: 'error',
      error: { code: 'run.cancelled', step: 'playground.admin' },
    });
    expect((await services.orchestrator.wait(first)).verdict).toBe('pass');
  });
});

describe('replay', () => {
  it('copies the stored configuration, applies overrides and links the runs', async () => {
    const services = await appWith();
    const original = services.orchestrator.create({ ...FAKE_CELL, vpProfile: 'final-1.0' }).runId;
    await services.orchestrator.wait(original);
    const replay = services.orchestrator.create({ replayOf: original, format: 'ldp_vc' }).runId;
    const report = await services.orchestrator.wait(replay);
    expect(report).toMatchObject({
      replayOf: original,
      format: 'ldp_vc',
      vpProfile: 'final-1.0',
      verdict: 'pass',
    });
    expect(services.store.getRun(replay)?.config).toMatchObject({
      issuer: 'fake-issuer',
      replayOf: original,
    });
    expect(() => services.orchestrator.create({ replayOf: 'missing-run' })).toThrow(/no stored run/);
  });
});

describe('recording through the run context', () => {
  it('records role HTTP calls, tagged with the current step and the calling role', async () => {
    const { server, url } = await listenInTestRange((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ credential_issuer: url, path: request.url }));
    });
    try {
      const set = fakeSet();
      const base = createFakeWallet(set.network);
      const fetching: WalletRole = {
        ...base,
        receiveCredential: async (ctx, start) => {
          const metadata = await ctx.http.fetch(`${url}/.well-known/openid-credential-issuer`);
          expect(await metadata.json()).toMatchObject({ credential_issuer: url });
          ctx.enterStep('token');
          await ctx.http.fetch(`${url}/token`, { method: 'POST', body: 'grant_type=x', to: 'fake-issuer' });
          return base.receiveCredential(ctx, start);
        },
      };
      app = await buildTestApp({ roles: registrations([set.roles[0]!, fetching, set.roles[2]!]) });
      const services = app.playground;
      const { runId } = services.orchestrator.create(FAKE_CELL);
      const report = await services.orchestrator.wait(runId);
      expect(report.verdict).toBe('pass');
      expect(report.steps.find((step) => step.step === 'issuer.metadata')?.status).toBe('ok');

      const exchanges = services.store.listExchanges(runId);
      expect(
        exchanges.map((x) => [x.seq, x.step, x.from, x.to, x.request.method, x.response?.status]),
      ).toEqual([
        [1, 'issuer.metadata', 'fake-wallet', new URL(url).host, 'GET', 200],
        [2, 'token', 'fake-wallet', 'fake-issuer', 'POST', 200],
      ]);
      expect(exchanges[1]?.request.body).toBe('grant_type=x');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

it('the RoleError class carries code and category', () => {
  const error = new RoleError('http.400', 'bad', { category: 'environment', exchangeId: 'x1' });
  expect(error).toMatchObject({
    code: 'http.400',
    category: 'environment',
    exchangeId: 'x1',
    name: 'RoleError',
  });
});

async function waitUntil(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
