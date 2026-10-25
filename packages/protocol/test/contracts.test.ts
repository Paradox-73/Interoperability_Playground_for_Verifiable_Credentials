// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_FORMATS,
  InteropReportSchema,
  IssuanceStartSchema,
  RoleDescriptorSchema,
  RunConfigSchema,
  RunEventSchema,
  STEP_IDS,
  STEP_INFO,
  ServerHealthSchema,
  WsClientMessageSchema,
  verdictFor,
  type RunEvent,
} from '../src/index.js';

const fixtureUrl = new URL('../fixtures/example-run.synthetic.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as { synthetic: boolean; events: unknown[] };

describe('example-run.synthetic.json', () => {
  const events: RunEvent[] = fixture.events.map((e) => RunEventSchema.parse(e));

  it('is labelled synthetic', () => {
    expect(fixture.synthetic).toBe(true);
  });

  it('starts with run.started and ends with run.finished', () => {
    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.finished');
  });

  it('numbers exchanges 1..n in order', () => {
    const seqs = events.flatMap((e) => (e.type === 'exchange' ? [e.exchange.seq] : []));
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });

  it('finishes every step it starts', () => {
    const started = events.flatMap((e) => (e.type === 'step.started' ? [e.step] : []));
    const finished = events.flatMap((e) => (e.type === 'step.finished' ? [e.step] : []));
    expect(finished).toEqual(started);
  });

  it('carries a report whose verdict follows from outcome and expectation', () => {
    const last = events.at(-1);
    if (last?.type !== 'run.finished') throw new Error('missing run.finished');
    const { report } = last;
    expect(report.verdict).toBe(verdictFor(report.scenario.expected, report.outcome));
  });
});

describe('RunConfigSchema', () => {
  it('applies Inji stable profiles and the happy path as defaults', () => {
    const config = RunConfigSchema.parse({
      issuer: 'inji-certify',
      wallet: 'ref-wallet',
      verifier: 'inji-verify',
      format: 'ldp_vc',
    });
    expect(config).toMatchObject({ vciProfile: 'draft13', vpProfile: 'inji-draft', scenario: 'happy' });
  });

  it('rejects an unknown format and a role id with upper-case letters', () => {
    const base = { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier', format: 'ldp_vc' };
    expect(RunConfigSchema.safeParse({ ...base, format: 'jwt_vc_json' }).success).toBe(false);
    expect(RunConfigSchema.safeParse({ ...base, issuer: 'Inji-Certify' }).success).toBe(false);
  });

  it('knows both names of the SD-JWT VC format', () => {
    expect(CREDENTIAL_FORMATS).toEqual(expect.arrayContaining(['vc+sd-jwt', 'dc+sd-jwt']));
  });
});

describe('RoleDescriptorSchema', () => {
  const descriptor = {
    id: 'inji-verify',
    kind: 'verifier',
    name: 'Inji Verify',
    ecosystem: 'inji',
    version: '0.18.2',
    interaction: 'automatic',
    capabilities: {
      formats: ['ldp_vc', 'vc+sd-jwt'],
      proofTypes: ['Ed25519Signature2020', 'ES256'],
      didMethods: ['did:web', 'did:key', 'did:jwk'],
      vpProfiles: ['inji-draft'],
      responseModes: ['direct_post'],
    },
  };

  it('accepts a complete descriptor', () => {
    expect(RoleDescriptorSchema.parse(descriptor)).toEqual(descriptor);
  });

  it('rejects a DID method that is not of the form did:<method>', () => {
    const bad = { ...descriptor, capabilities: { ...descriptor.capabilities, didMethods: ['web'] } };
    expect(RoleDescriptorSchema.safeParse(bad).success).toBe(false);
  });
});

describe('IssuanceStartSchema', () => {
  it('requires an offer URI for the credential-offer mode', () => {
    const result = IssuanceStartSchema.safeParse({
      mode: 'credential-offer',
      credentialIssuer: 'https://certify.ps02.test',
      credentialConfigurationIds: ['FarmerCredential'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts the wallet-initiated mode without an offer', () => {
    const start = IssuanceStartSchema.parse({
      mode: 'wallet-initiated',
      credentialIssuer: 'https://certify-ac.ps02.test',
      credentialConfigurationId: 'FarmerCredential',
    });
    expect(start.mode).toBe('wallet-initiated');
  });
});

describe('verdictFor', () => {
  it.each([
    ['VALID', 'VALID', 'pass'],
    ['INVALID', 'INVALID', 'pass'],
    ['EXPIRED', 'VALID', 'fail'],
    ['VALID', 'ERROR', 'fail'],
    ['VALID', 'NOT_RUN', 'error'],
  ] as const)('expected %s, outcome %s -> %s', (expected, outcome, verdict) => {
    expect(verdictFor(expected, outcome)).toBe(verdict);
  });
});

describe('STEP_INFO', () => {
  it('has a plain-language label for every step and links only to https specifications', () => {
    for (const step of STEP_IDS) {
      const info = STEP_INFO[step];
      expect(info.label.length).toBeGreaterThan(10);
      if (info.spec) expect(info.spec.url).toMatch(/^https:\/\//);
    }
  });
});

describe('API envelopes', () => {
  it('parses the health body and WebSocket subscriptions', () => {
    expect(
      ServerHealthSchema.safeParse({
        status: 'ok',
        service: 'inji-interop-playground',
        version: '0.1.0',
        uptimeSeconds: 1.5,
        time: new Date().toISOString(),
      }).success,
    ).toBe(true);
    expect(WsClientMessageSchema.parse({ type: 'subscribe', runId: '*' })).toEqual({
      type: 'subscribe',
      runId: '*',
    });
  });

  it('rejects a report without the fields the problem statement requires', () => {
    expect(InteropReportSchema.safeParse({ runId: 'r1', outcome: 'VALID' }).success).toBe(false);
  });
});
