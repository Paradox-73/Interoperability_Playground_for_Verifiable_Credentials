// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { describe, expect, it } from 'vitest';
import { roleStatuses } from '../../../test/fixtures/roles';
import { pickDefaultSelection } from './default-selection';

describe('pickDefaultSelection', () => {
  it('picks a compatible all-Inji combination when every Inji module is healthy', () => {
    // Pre-authorized Certify cannot feed Inji Web, so the authorization-code instance is chosen.
    expect(pickDefaultSelection(roleStatuses())).toEqual({
      basis: 'inji',
      selection: { issuer: 'inji-certify-ac', wallet: 'inji-web', verifier: 'inji-verify' },
    });
  });

  it('prefers Inji roles that run automatically over ones needing the browser tab', () => {
    const result = pickDefaultSelection(roleStatuses({ health: { 'inji-verify': 'down' } }));
    expect(result?.selection.verifier).toBe('inji-verify-sdk');
    expect(roleStatuses().find((r) => r.descriptor.id === 'inji-verify-sdk')?.descriptor.interaction).toBe(
      'browser',
    );
  });

  it('falls back to reference roles when no all-Inji combination is healthy', () => {
    expect(pickDefaultSelection(roleStatuses({ health: { 'inji-web': 'degraded' } }))).toEqual({
      basis: 'reference',
      selection: { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier' },
    });
  });

  it('uses reference roles even when their health is unknown', () => {
    const result = pickDefaultSelection(roleStatuses({ ecosystem: { inji: 'down', reference: 'unknown' } }));
    expect(result).toEqual({
      basis: 'reference',
      selection: { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier' },
    });
  });

  it('returns nothing when a column has no candidate', () => {
    expect(pickDefaultSelection(roleStatuses({ only: ['ref-issuer', 'ref-wallet'] }))).toBeUndefined();
    expect(pickDefaultSelection([])).toBeUndefined();
  });
});
