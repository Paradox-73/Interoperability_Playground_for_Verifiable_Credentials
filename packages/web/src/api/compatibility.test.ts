import { describe, expect, it } from 'vitest';
import { compatibilityPath, parseCompatibility, reasonsFor } from './compatibility';

describe('parseCompatibility', () => {
  it('accepts a runnable answer without reasons', () => {
    expect(parseCompatibility({ runnable: true, mode: 'reference' })).toEqual({
      runnable: true,
      reasons: [],
    });
  });

  it('keeps code, severity, message, roles and gap ids', () => {
    const reason = {
      code: 'issuance.offer-unsupported',
      severity: 'blocking',
      message: 'Inji Web cannot read credential offers',
      roles: ['inji-certify', 'inji-web'],
      gapIds: ['G5'],
    };
    expect(parseCompatibility({ runnable: false, mode: 'live', reasons: [reason] })).toEqual({
      runnable: false,
      reasons: [reason],
    });
  });

  it('fills in defaults for optional reason fields', () => {
    expect(
      parseCompatibility({ runnable: false, reasons: [{ code: 'x', message: 'y' }] }).reasons[0],
    ).toEqual({
      code: 'x',
      severity: 'blocking',
      message: 'y',
      roles: [],
      gapIds: [],
    });
  });

  it.each([
    [null, 'boolean "runnable"'],
    [{ runnable: 'no' }, 'boolean "runnable"'],
    [{ runnable: false, reasons: 'none' }, 'must be an array'],
    [{ runnable: false, reasons: [{ code: 'x' }] }, 'reasons[0]'],
    [{ runnable: false, reasons: [{ code: 'x', message: 'y', severity: 'fatal' }] }, 'severity'],
    [{ runnable: false, reasons: [{ code: 'x', message: 'y', gapIds: [5] }] }, 'gapIds'],
  ])('rejects %j', (body, problem) => {
    expect(() => parseCompatibility(body)).toThrow(problem);
  });
});

describe('reasonsFor', () => {
  const result = parseCompatibility({
    runnable: false,
    reasons: [
      { code: 'a', message: 'about the wallet', roles: ['inji-web'] },
      { code: 'b', message: 'about everything' },
    ],
  });

  it('keeps reasons naming the role and reasons about the whole combination', () => {
    expect(reasonsFor(result, 'inji-web').map((r) => r.code)).toEqual(['a', 'b']);
    expect(reasonsFor(result, 'ref-issuer').map((r) => r.code)).toEqual(['b']);
    expect(reasonsFor(undefined, 'ref-issuer')).toEqual([]);
  });
});

describe('compatibilityPath', () => {
  it('encodes every field as a query parameter', () => {
    expect(
      compatibilityPath({
        issuer: 'ref-issuer',
        wallet: 'ref-wallet',
        verifier: 'inji-verify',
        format: 'vc+sd-jwt',
        vciProfile: 'draft13',
        vpProfile: 'inji-draft',
      }),
    ).toBe(
      '/api/compatibility?issuer=ref-issuer&wallet=ref-wallet&verifier=inji-verify&format=vc%2Bsd-jwt&vciProfile=draft13&vpProfile=inji-draft',
    );
  });
});
