/**
 * Small building blocks: the event bus, step timers, the stack lock, step timeouts per role and the
 * compatibility check.
 */
import type { RoleDescriptor, RunEvent, ScenarioSpec } from '@inji-playground/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/events/bus.js';
import { checkCompatibility, type CompatibilityInput } from '../src/orchestrator/compatibility.js';
import { StackLock } from '../src/orchestrator/stack-lock.js';
import { DEFAULT_STEP_TIMEOUTS, PausableTimer, roleStepTimeout } from '../src/orchestrator/timing.js';

const started = (runId: string): RunEvent => ({
  type: 'step.started',
  runId,
  step: 'token',
  label: 'Wallet exchanges the code',
  at: '2026-10-04T10:00:00.000Z',
});

describe('EventBus', () => {
  it('delivers to run and all-run subscribers in publish order, and stops after unsubscribe', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const stopRun = bus.subscribeRun('r1', (event) => seen.push(`r1:${event.runId}`));
    bus.subscribeAll((event) => seen.push(`all:${event.runId}`));
    bus.publish(started('r1'));
    bus.publish(started('r2'));
    stopRun();
    bus.publish(started('r1'));
    expect(seen).toEqual(['r1:r1', 'all:r1', 'all:r2', 'all:r1']);
    expect(bus.listenerCount()).toBe(1);
  });

  it('keeps delivering when one listener throws, and reports the error', () => {
    const errors: unknown[] = [];
    const bus = new EventBus((error) => errors.push(error));
    const seen: string[] = [];
    bus.subscribeAll(() => {
      throw new Error('broken listener');
    });
    bus.subscribeAll((event) => seen.push(event.runId));
    bus.publish(started('r1'));
    expect(seen).toEqual(['r1']);
    expect(errors).toHaveLength(1);
  });
});

describe('PausableTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expires after its duration, not while paused, and restarts with a full period', () => {
    const expired = vi.fn();
    const timer = new PausableTimer(100, expired);
    vi.advanceTimersByTime(60);
    timer.pause();
    timer.pause(); // nested pause
    vi.advanceTimersByTime(1_000);
    timer.resume();
    vi.advanceTimersByTime(1_000);
    expect(expired).not.toHaveBeenCalled();
    timer.resume();
    vi.advanceTimersByTime(39);
    expect(expired).not.toHaveBeenCalled();
    timer.restart(100);
    vi.advanceTimersByTime(99);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('never fires after clear', () => {
    const expired = vi.fn();
    const timer = new PausableTimer(10, expired);
    timer.clear();
    vi.advanceTimersByTime(100);
    expect(expired).not.toHaveBeenCalled();
  });
});

describe('StackLock', () => {
  it('grants the stack first come, first served', async () => {
    const lock = new StackLock();
    const order: string[] = [];
    const releaseA = await lock.acquire();
    const b = lock.acquire().then((release) => {
      order.push('b');
      return release;
    });
    const c = lock.acquire().then((release) => {
      order.push('c');
      release();
    });
    expect(lock.queued).toBe(2);
    releaseA();
    releaseA(); // releasing twice is harmless
    (await b)();
    await c;
    expect(order).toEqual(['b', 'c']);
    expect(lock.busy).toBe(false);
  });

  it('drops a waiter whose signal aborts', async () => {
    const lock = new StackLock();
    const release = await lock.acquire();
    const controller = new AbortController();
    const waiting = lock.acquire(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(waiting).rejects.toThrow('cancelled');
    expect(lock.queued).toBe(0);
    release();
    expect(lock.busy).toBe(false);
  });
});

function role(
  kind: RoleDescriptor['kind'],
  overrides: Partial<RoleDescriptor> = {},
  capabilities: Partial<RoleDescriptor['capabilities']> = {},
): RoleDescriptor {
  return {
    id: `test-${kind}`,
    kind,
    name: `Test ${kind}`,
    ecosystem: 'reference',
    version: '1',
    interaction: 'automatic',
    ...overrides,
    capabilities: {
      formats: ['ldp_vc', 'vc+sd-jwt'],
      proofTypes: ['Ed25519Signature2020', 'ES256'],
      didMethods: ['did:key'],
      ...capabilities,
    },
  };
}

describe('roleStepTimeout', () => {
  it('is 15 s for reference roles, 90 s for Inji and outside roles, 10 min for people, unless overridden', () => {
    expect(roleStepTimeout(role('issuer'), DEFAULT_STEP_TIMEOUTS)).toBe(15_000);
    expect(roleStepTimeout(role('issuer', { ecosystem: 'inji' }), DEFAULT_STEP_TIMEOUTS)).toBe(90_000);
    expect(roleStepTimeout(role('wallet', { ecosystem: 'external' }), DEFAULT_STEP_TIMEOUTS)).toBe(90_000);
    expect(roleStepTimeout(role('wallet', { interaction: 'manual' }), DEFAULT_STEP_TIMEOUTS)).toBe(600_000);
    expect(roleStepTimeout(role('verifier', { interaction: 'browser' }), DEFAULT_STEP_TIMEOUTS)).toBe(
      600_000,
    );
    expect(roleStepTimeout(role('issuer', { ecosystem: 'inji' }), DEFAULT_STEP_TIMEOUTS, 5)).toBe(5);
  });
});

describe('checkCompatibility (TC_PG_COMPAT_01)', () => {
  const happy: ScenarioSpec = {
    id: 'happy',
    title: 'Happy path',
    description: 'x',
    expected: 'VALID',
    target: 'none',
  };
  const base: CompatibilityInput = {
    issuer: role('issuer'),
    wallet: role('wallet'),
    verifier: role('verifier'),
    format: 'ldp_vc',
    vciProfile: 'draft13',
    vpProfile: 'inji-draft',
    scenario: happy,
  };
  const codes = (input: Partial<typeof base>) =>
    checkCompatibility({ ...base, ...input }).reasons.map((reason) => reason.code);

  it('accepts roles that share format and profiles, in reference mode', () => {
    expect(checkCompatibility(base)).toEqual({ runnable: true, mode: 'reference', reasons: [] });
    expect(checkCompatibility({ ...base, verifier: role('verifier', { ecosystem: 'inji' }) }).mode).toBe(
      'live',
    );
  });

  it('blocks a format one role lacks', () => {
    const result = checkCompatibility({ ...base, format: 'mso_mdoc' });
    expect(result.runnable).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      'issuer.format-unsupported',
      'wallet.format-unsupported',
      'verifier.format-unsupported',
    ]);
  });

  it('blocks protocol profiles a role declares it does not speak, and ignores undeclared ones', () => {
    expect(codes({ wallet: role('wallet', {}, { vciProfiles: ['v1'] }) })).toEqual([
      'wallet.vci-profile-unsupported',
    ]);
    expect(
      codes({ verifier: role('verifier', {}, { vpProfiles: ['inji-draft'] }), vpProfile: 'final-1.0' }),
    ).toEqual(['verifier.vp-profile-unsupported']);
    expect(codes({ issuer: role('issuer', {}, { vciProfiles: undefined }) })).toEqual([]);
  });

  it('blocks an issuer that only offers credentials with a wallet that only starts issuance itself', () => {
    const result = checkCompatibility({
      ...base,
      issuer: role('issuer', { name: 'Inji Certify' }, { issuance: ['credential-offer'] }),
      wallet: role('wallet', { name: 'Inji Web' }, { issuance: ['wallet-initiated'] }),
    });
    expect(result.reasons).toEqual([
      expect.objectContaining({
        code: 'issuance.mode-mismatch',
        severity: 'blocking',
        roles: ['test-issuer', 'test-wallet'],
      }),
    ]);
    expect(result.reasons[0]?.message).toBe(
      'Inji Certify starts issuance by credential-offer, but Inji Web only supports wallet-initiated.',
    );
  });

  it('blocks disjoint response modes and scenarios for other formats', () => {
    expect(
      codes({
        wallet: role('wallet', {}, { responseModes: ['direct_post.jwt'] }),
        verifier: role('verifier', {}, { responseModes: ['direct_post'] }),
      }),
    ).toEqual(['presentation.response-mode-mismatch']);
    expect(codes({ scenario: { ...happy, id: 'tamper.disclosure', formats: ['vc+sd-jwt'] } })).toEqual([
      'scenario.format-unsupported',
    ]);
  });

  it('only warns about DID methods and proof types, so the run is still attempted', () => {
    const result = checkCompatibility({
      ...base,
      issuer: role('issuer', {}, { didMethods: ['did:web'], proofTypes: ['EdDSA'] }),
      verifier: role('verifier', {}, { didMethods: ['did:key'], proofTypes: ['ES256'] }),
    });
    expect(result.runnable).toBe(true);
    expect(result.reasons.map((reason) => [reason.code, reason.severity])).toEqual([
      ['did.method-mismatch', 'warning'],
      ['proof.type-mismatch', 'warning'],
    ]);
  });
});
