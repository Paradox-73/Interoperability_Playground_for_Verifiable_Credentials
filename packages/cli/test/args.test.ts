// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { describe, expect, it } from 'vitest';
import { parseCli } from '../src/index.js';

describe('parseCli', () => {
  it('defaults to help and to the local server on port 28100', () => {
    expect(parseCli([])).toMatchObject({
      command: 'help',
      server: 'http://localhost:28100',
      reference: false,
    });
  });

  it('reads the matrix options', () => {
    expect(
      parseCli([
        'matrix',
        '--reference',
        '--spec',
        'specs/reference.yaml',
        '--out',
        'out',
        '--junit',
        'j.xml',
      ]),
    ).toMatchObject({
      command: 'matrix',
      server: 'http://localhost:28100',
      reference: true,
      spec: 'specs/reference.yaml',
      out: 'out',
      junit: 'j.xml',
      force: false,
    });
  });

  it('reads the cell of run, with the reference roles, SD-JWT VC and the happy path by default', () => {
    expect(parseCli(['run']).cell).toEqual({
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'ref-verifier',
      format: 'vc+sd-jwt',
      scenario: 'happy',
    });
    expect(
      parseCli([
        'run',
        '--verifier',
        'inji-verify',
        '--format',
        'ldp_vc',
        '--vp-profile',
        'final-1.0',
        '--scenario',
        'expired',
      ]).cell,
    ).toMatchObject({
      verifier: 'inji-verify',
      format: 'ldp_vc',
      vpProfile: 'final-1.0',
      scenario: 'expired',
    });
  });

  it('rejects an unknown command with the usage text', () => {
    expect(() => parseCli(['deploy'])).toThrow(/unknown command "deploy"[\s\S]*Usage:/);
  });
});
