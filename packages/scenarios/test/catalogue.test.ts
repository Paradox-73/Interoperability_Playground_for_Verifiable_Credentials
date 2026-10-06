import { ScenarioSpecSchema } from '@inji-playground/protocol';
import { describe, expect, it } from 'vitest';
import {
  findScenario,
  findScenarioDefinition,
  happy,
  issuanceOptionsFor,
  listScenarios,
  mapPresentations,
  scenarioApplies,
  scenarioCatalog,
  scenarioHooks,
  tamperCredential,
  tamperPresentation,
  walletClientOptions,
  type ScenarioDefinition,
} from '../src/index.js';

const REQUIRED_IDS = [
  'happy',
  'expired',
  'not-yet-valid',
  'wrong-type',
  'bad-signature',
  'altered-disclosure',
  'unreferenced-disclosure',
  'kb-wrong-nonce',
  'kb-wrong-aud',
  'vp-replay',
  'holder-mismatch',
  'forged-x5c',
  'issuer-did-key',
  'issuer-did-jwk',
  'vc2-eddsa-rdfc-2022',
  'holder-proof-es256',
  'dc-sd-jwt',
  'holder-did-canonical',
];

const definition = (id: string): ScenarioDefinition => findScenarioDefinition(id)!;

describe('scenario catalogue', () => {
  it('contains every scenario of the plan, with unique ids, in catalogue order', () => {
    expect(scenarioCatalog.map((scenario) => scenario.id)).toEqual(REQUIRED_IDS);
  });

  it('every entry validates against the protocol schema (scenarioCatalog and the API view)', () => {
    for (const scenario of scenarioCatalog) {
      const parsed = ScenarioSpecSchema.safeParse(scenario);
      expect(parsed.success, `${scenario.id}: ${parsed.error?.message ?? ''}`).toBe(true);
    }
    for (const spec of listScenarios())
      expect(ScenarioSpecSchema.strict().safeParse(spec).success).toBe(true);
  });

  it('has at least 10 tamper scenarios, and each non-happy entry names the rule behind its expected outcome', () => {
    expect(
      scenarioCatalog.filter((scenario) => scenario.category === 'tamper').length,
    ).toBeGreaterThanOrEqual(10);
    for (const scenario of scenarioCatalog.filter((entry) => entry.id !== 'happy')) {
      expect(scenario.reference, scenario.id).toMatch(/section|Appendix|specification|Method/);
      expect(scenario.formats?.length, scenario.id).toBeGreaterThan(0);
    }
  });

  it('expects EXPIRED only for the expired credential, and VALID for the happy path and every probe', () => {
    expect(scenarioCatalog.filter((s) => s.expected === 'EXPIRED').map((s) => s.id)).toEqual(['expired']);
    for (const scenario of scenarioCatalog.filter((s) => s.category !== 'tamper')) {
      expect(scenario.expected, scenario.id).toBe('VALID');
    }
    for (const scenario of scenarioCatalog.filter((s) => s.category === 'tamper' && s.id !== 'expired')) {
      expect(scenario.expected, scenario.id).toBe('INVALID');
    }
  });

  it('marks issuer variants as needing ref-issuer and wallet-side tampering as needing ref-wallet', () => {
    for (const scenario of scenarioCatalog) {
      const issuerSide = scenario.issuer !== undefined && scenario.id !== 'holder-did-canonical';
      if (issuerSide) expect(scenario.requires?.issuer, scenario.id).toEqual(['ref-issuer']);
      if (scenario.credentialTamper || scenario.presentationTamper || scenario.wallet) {
        expect(scenario.requires?.wallet, scenario.id).toEqual(['ref-wallet']);
      }
    }
  });

  it('the API view drops the role instructions; the definition keeps them', () => {
    const spec = findScenario('wrong-type')!;
    expect(spec).not.toHaveProperty('issuer');
    expect(spec).not.toHaveProperty('wallet');
    expect(spec).toMatchObject({ expected: 'INVALID', requires: { issuer: ['ref-issuer'] } });
    expect(definition('wrong-type').wallet).toEqual({ presentUnmatched: true });
    expect(happy).toMatchObject({ id: 'happy', expected: 'VALID', target: 'none' });
    expect(findScenario('no-such-scenario')).toBeUndefined();
    expect(findScenarioDefinition('no-such-scenario')).toBeUndefined();
  });
});

describe('scenarioApplies', () => {
  const reference = { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier' };

  it('accepts any combination for the happy path', () => {
    expect(
      scenarioApplies(happy, { issuer: 'inji-certify', wallet: 'inji-web', format: 'mso_mdoc' }),
    ).toEqual({
      applies: true,
      reasons: [],
    });
  });

  it('refuses a format the scenario does not cover, and says why', () => {
    const result = scenarioApplies(definition('kb-wrong-nonce'), { ...reference, format: 'ldp_vc' });
    expect(result.applies).toBe(false);
    expect(result.reasons[0]).toMatch(/vc\+sd-jwt, dc\+sd-jwt, not ldp_vc/);
  });

  it('mso_mdoc: applies where the mdoc has the feature, and is left out of KB-JWT and DID-method scenarios', () => {
    const mdocScenarios = scenarioCatalog
      .filter((scenario) => scenarioApplies(scenario, { ...reference, format: 'mso_mdoc' }).applies)
      .map((scenario) => scenario.id);
    expect(mdocScenarios).toEqual([
      'happy',
      'expired',
      'not-yet-valid',
      'wrong-type',
      'bad-signature',
      'altered-disclosure',
      'unreferenced-disclosure',
      'vp-replay',
      'holder-mismatch',
      'forged-x5c',
    ]);
    // An mdoc has no KB-JWT and names its issuer by a certificate, not a DID (ISO/IEC 18013-5 section 9.1.2.4).
    for (const id of ['kb-wrong-nonce', 'kb-wrong-aud', 'issuer-did-key', 'issuer-did-jwk']) {
      expect(definition(id).formats, id).not.toContain('mso_mdoc');
    }
  });

  it('refuses a role the scenario cannot drive', () => {
    const result = scenarioApplies(definition('bad-signature'), { ...reference, wallet: 'inji-web' });
    expect(result).toEqual({
      applies: false,
      reasons: ['bad-signature needs the wallet ref-wallet, not inji-web'],
    });
    expect(scenarioApplies(definition('expired'), { issuer: 'inji-certify' }).applies).toBe(false);
    expect(
      scenarioApplies(definition('holder-did-canonical'), { ...reference, format: 'ldp_vc' }).applies,
    ).toBe(false);
  });

  it('refuses a profile the scenario does not list', () => {
    const draftOnly = { ...happy, id: 'draft-only', vpProfiles: ['inji-draft' as const] };
    expect(scenarioApplies(draftOnly, { vpProfile: 'final-1.0' }).applies).toBe(false);
    expect(scenarioApplies(draftOnly, { vpProfile: 'inji-draft' }).applies).toBe(true);
  });
});

describe('issuer variants', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('turns validity offsets into dates relative to issuance', () => {
    expect(issuanceOptionsFor(definition('expired'), now)).toEqual({
      validFrom: new Date('2025-10-04T12:00:00Z'),
      validUntil: new Date('2026-10-03T12:00:00Z'),
    });
    expect(issuanceOptionsFor(definition('not-yet-valid'), now)?.validFrom).toEqual(
      new Date('2026-10-05T12:00:00Z'),
    );
  });

  it('passes type and vct overrides, and nothing for scenarios without issuance changes', () => {
    expect(issuanceOptionsFor(definition('wrong-type'), now)).toMatchObject({
      types: ['VerifiableCredential', 'LandRecordCredential'],
      vct: 'https://playground.ps02.test/vct/land-record/v1',
    });
    expect(issuanceOptionsFor(definition('happy'), now)).toBeUndefined();
    // A DID method is a property of the issuer, not of one offer.
    expect(issuanceOptionsFor(definition('issuer-did-jwk'), now)).toBeUndefined();
  });
});

describe('hooks', () => {
  it('the happy path has no hooks', () => {
    expect(scenarioHooks(definition('happy'))).toEqual({});
  });

  it('vc2-eddsa-rdfc-2022 asks the issuer for the VC 2.0 configuration', async () => {
    const hooks = scenarioHooks(definition('vc2-eddsa-rdfc-2022'));
    expect(await hooks.beforeIssuance!({ format: 'ldp_vc', vciProfile: 'draft13' })).toEqual({
      format: 'ldp_vc',
      vciProfile: 'draft13',
      credentialConfigurationId: 'FarmerCredential_ldp_vc_v2',
    });
  });

  it('wrong-type makes the verifier ask for the farmer credential explicitly, keeping an explicit choice', async () => {
    const hooks = scenarioHooks(definition('wrong-type'));
    expect(await hooks.beforeRequest!({ format: 'vc+sd-jwt', vpProfile: 'final-1.0' })).toMatchObject({
      credentialType: 'https://playground.ps02.test/vct/farmer/v1',
    });
    expect(
      await hooks.beforeRequest!({ format: 'ldp_vc', vpProfile: 'inji-draft', credentialType: 'Other' }),
    ).toMatchObject({ credentialType: 'Other' });
  });

  it('presentation tampering is left to the wallet (no protocol tamperPresentation hook)', () => {
    for (const scenario of scenarioCatalog)
      expect(scenarioHooks(scenario)).not.toHaveProperty('tamperPresentation');
  });

  it('holder-did-canonical configures the wallet client; other scenarios do not', () => {
    expect(walletClientOptions(definition('holder-did-canonical'))).toEqual({ holderDidForm: 'canonical' });
    expect(walletClientOptions(definition('happy'))).toEqual({});
  });

  it('refuses a tamper on a format it does not apply to', async () => {
    await expect(tamperCredential('forge-x5c', { format: 'ldp_vc', raw: '{}' })).rejects.toThrow(TypeError);
    await expect(
      tamperPresentation('replay-earlier', '"x"', {
        format: 'vc+sd-jwt',
        profile: 'inji-draft',
        nonce: 'n',
        clientId: 'c',
        holderKey: undefined as never,
      }),
    ).rejects.toThrow(/earlier request/);
  });
});

describe('mapPresentations (vp_token encodings, OpenID4VP 1.0 section 8.1)', () => {
  const upper = (value: unknown) => Promise.resolve(typeof value === 'string' ? value.toUpperCase() : value);

  it('changes one draft presentation (JSON string), an array, and a 1.0 object keyed by query id', async () => {
    expect(await mapPresentations('"a~b~"', 'inji-draft', upper)).toBe('"A~B~"');
    expect(await mapPresentations('["a","b"]', 'inji-draft', upper)).toBe('["A","B"]');
    expect(await mapPresentations('{"credential":["a"],"other":"b"}', 'final-1.0', upper)).toBe(
      '{"credential":["A"],"other":["B"]}',
    );
  });

  it('treats a draft ldp_vp object as one presentation', async () => {
    const seen: unknown[] = [];
    await mapPresentations('{"type":["VerifiablePresentation"]}', 'inji-draft', (value) => {
      seen.push(value);
      return Promise.resolve(value);
    });
    expect(seen).toEqual([{ type: ['VerifiablePresentation'] }]);
  });
});
