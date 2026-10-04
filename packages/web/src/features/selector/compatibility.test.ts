import { describe, expect, it } from 'vitest';
import { descriptor } from '../../../test/fixtures/roles';
import { findIncompatibilities, involvedKinds, resolveChoice, runOptions } from './compatibility';

const certifyPreAuth = descriptor('inji-certify');
const certifyAc = descriptor('inji-certify-ac');
const refIssuer = descriptor('ref-issuer');
const refWallet = descriptor('ref-wallet');
const injiWeb = descriptor('inji-web');
const injiVerify = descriptor('inji-verify');
const refVerifier = descriptor('ref-verifier');

describe('runOptions', () => {
  it('keeps the formats and protocol versions all selected roles support, in contract order', () => {
    expect(runOptions({ issuer: refIssuer, wallet: refWallet, verifier: injiVerify })).toEqual({
      formats: ['ldp_vc', 'vc+sd-jwt'],
      vciProfiles: ['draft13', 'v1'],
      vpProfiles: ['inji-draft'],
    });
  });

  it('treats a column without a selection as accepting everything', () => {
    expect(runOptions({ issuer: certifyAc }).formats).toEqual(['ldp_vc']);
    expect(runOptions({}).formats).toEqual(['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc']);
  });
});

describe('findIncompatibilities', () => {
  it('finds nothing for a working combination', () => {
    expect(findIncompatibilities({ issuer: certifyAc, wallet: injiWeb, verifier: injiVerify })).toEqual([]);
  });

  it('reports an issuer that only sends offers to a wallet that only starts issuance itself', () => {
    const problems = findIncompatibilities({ issuer: certifyPreAuth, wallet: injiWeb });
    expect(problems.map((p) => p.code)).toEqual(['issuance-mode']);
    expect(involvedKinds(problems[0]!)).toEqual(['issuer', 'wallet']);
  });

  it('reports different protocol versions on each side', () => {
    const v1Issuer = {
      ...refIssuer,
      capabilities: { ...refIssuer.capabilities, vciProfiles: ['v1' as const] },
    };
    const finalVerifier = {
      ...refVerifier,
      capabilities: { ...refVerifier.capabilities, vpProfiles: ['final-1.0' as const] },
    };
    const codes = findIncompatibilities({ issuer: v1Issuer, wallet: injiWeb, verifier: finalVerifier }).map(
      (p) => p.code,
    );
    expect(codes).toEqual(['vci-profile', 'vp-profile']);
  });

  it('reports a pair with no shared format', () => {
    const mdocVerifier = {
      ...refVerifier,
      capabilities: { ...refVerifier.capabilities, formats: ['mso_mdoc' as const] },
    };
    const codes = findIncompatibilities({ wallet: refWallet, verifier: mdocVerifier }).map((p) => p.code);
    expect(codes).toEqual(['presentation-format']);
  });

  it('reports three roles that share no format although each pair shares one', () => {
    const ldpOnly = {
      ...refIssuer,
      capabilities: { ...refIssuer.capabilities, formats: ['ldp_vc' as const] },
    };
    const sdJwtVerifier = {
      ...refVerifier,
      capabilities: { ...refVerifier.capabilities, formats: ['vc+sd-jwt' as const] },
    };
    const codes = findIncompatibilities({ issuer: ldpOnly, wallet: refWallet, verifier: sdJwtVerifier }).map(
      (p) => p.code,
    );
    expect(codes).toEqual(['common-format']);
  });
});

describe('resolveChoice', () => {
  const options = runOptions({ issuer: refIssuer, wallet: refWallet, verifier: refVerifier });

  it('uses Inji’s stable protocol versions and the first shared format by default', () => {
    expect(resolveChoice(options)).toEqual({
      format: 'ldp_vc',
      vciProfile: 'draft13',
      vpProfile: 'inji-draft',
    });
  });

  it('keeps preferred values that every role supports and replaces the others', () => {
    expect(resolveChoice(options, { format: 'dc+sd-jwt', vpProfile: 'final-1.0' })).toEqual({
      format: 'dc+sd-jwt',
      vciProfile: 'draft13',
      vpProfile: 'final-1.0',
    });
    expect(resolveChoice(options, { format: 'mso_mdoc' })?.format).toBe('ldp_vc');
  });

  it('has no choice when a list is empty', () => {
    expect(
      resolveChoice({ formats: [], vciProfiles: ['draft13'], vpProfiles: ['inji-draft'] }),
    ).toBeUndefined();
  });
});
