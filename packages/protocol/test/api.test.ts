// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { describe, expect, it } from 'vitest';
import {
  CompatibilityQuerySchema,
  CreateRunRequestSchema,
  ROLE_CALLS,
  RoleError,
  RunListQuerySchema,
  STEP_IDS,
  VerifierCallbackSchema,
  WsServerMessageSchema,
  isRoleError,
} from '../src/index.js';

describe('API schemas', () => {
  it('accept a replay request with only the id of the run to repeat', () => {
    expect(CreateRunRequestSchema.parse({ replayOf: 'run-1' })).toEqual({ replayOf: 'run-1' });
  });

  it('coerce list paging from query strings and apply defaults', () => {
    expect(RunListQuerySchema.parse({ limit: '10' })).toEqual({ order: 'newest', limit: 10, offset: 0 });
    expect(RunListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(RunListQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false);
  });

  it('default the compatibility query to Inji stable profiles and the happy path', () => {
    const query = CompatibilityQuerySchema.parse({
      issuer: 'a',
      wallet: 'b',
      verifier: 'c',
      format: 'ldp_vc',
    });
    expect(query).toMatchObject({ vciProfile: 'draft13', vpProfile: 'inji-draft', scenario: 'happy' });
  });

  it('describe the Verify SDK callbacks', () => {
    expect(VerifierCallbackSchema.parse({ kind: 'vp-received', transactionId: 'txn' }).kind).toBe(
      'vp-received',
    );
    expect(VerifierCallbackSchema.safeParse({ kind: 'vp-maybe' }).success).toBe(false);
  });

  it('let WebSocket clients tell acknowledgements from run events', () => {
    expect(WsServerMessageSchema.parse({ type: 'subscribed', runId: '*' })).toEqual({
      type: 'subscribed',
      runId: '*',
    });
    expect(WsServerMessageSchema.safeParse({ type: 'nonsense' }).success).toBe(false);
  });
});

describe('ROLE_CALLS', () => {
  it('lists the five role calls of the four phases in order, each starting in a known step', () => {
    expect(ROLE_CALLS.map((call) => `${call.phase}:${call.role}.${call.method}`)).toEqual([
      'issue:issuer.startIssuance',
      'hold:wallet.receiveCredential',
      'present:verifier.createRequest',
      'present:wallet.present',
      'verify:verifier.awaitResult',
    ]);
    for (const call of ROLE_CALLS) expect(STEP_IDS).toContain(call.firstStep);
  });
});

describe('RoleError', () => {
  it('defaults to an interoperability failure and is recognised across package copies', () => {
    const error = new RoleError('http.400', 'invalid_proof');
    expect(error).toMatchObject({ code: 'http.400', category: 'interop', name: 'RoleError' });
    expect(isRoleError(error)).toBe(true);
    const lookalike = Object.assign(new Error('x'), { name: 'RoleError', code: 'c' });
    expect(isRoleError(lookalike)).toBe(true);
    expect(isRoleError(new Error('plain'))).toBe(false);
  });
});
