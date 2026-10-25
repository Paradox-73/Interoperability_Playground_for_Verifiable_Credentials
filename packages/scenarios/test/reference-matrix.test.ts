// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Table-driven acceptance test of the catalogue: every scenario that applies to the reference roles
 * is run end to end, in process, for every applicable format and both OpenID4VP profiles:
 *
 *   reference issuer (OpenID4VCI, pre-authorized code) -> wallet issuance client -> scenario hooks ->
 *   wallet presentation client (respondWithScenario) -> reference verifier
 *
 * and the verifier's outcome must equal the scenario's expected outcome. The draft profile pairs
 * with OpenID4VCI draft 13 and `final-1.0` with OpenID4VCI 1.0, so both issuance versions run too.
 * No socket is opened and the network is disabled.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDidResolver,
  createDocumentLoader,
  generateKeyPair,
  type KeyPair,
} from '@inji-playground/formats';
import {
  acceptOffer,
  createReferenceIssuer,
  holderKeyFrom,
  injectFetch,
  type ReferenceIssuer,
} from '@inji-playground/oid4vci';
import {
  PresentationClient,
  ReferenceVerifier,
  verifierFetchHandler,
  type FetchFn,
  type StoredCredential,
} from '@inji-playground/oid4vp';
import type {
  CredentialFormat,
  HeldCredential,
  PresentationSpec,
  VpProfile,
} from '@inji-playground/protocol';
import {
  configurationIdFor,
  issuanceOptionsFor,
  issuerDidMethodFor,
  referenceCells,
  requestedCredentialType,
  respondWithScenario,
  scenarioCatalog,
  scenarioHooks,
  walletClientOptions,
  type ScenarioDefinition,
} from '../src/index.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);

const ORIGIN = 'http://localhost:28100';
const VERIFIER_BASE = `${ORIGIN}/ref/verifier`;
const DEFAULT_CONFIGURATION: Record<string, string> = {
  ldp_vc: 'FarmerCredential_ldp_vc',
  'vc+sd-jwt': 'FarmerCredential_vc_sd_jwt',
  'dc+sd-jwt': 'FarmerCredential_dc_sd_jwt',
  mso_mdoc: 'FarmerCredential_mso_mdoc',
};

const resolver = createDidResolver({ methods: ['key', 'jwk'] });
const documentLoader = createDocumentLoader({ didResolver: resolver });

let app: FastifyInstance;
let issuers: Record<'did:key' | 'did:jwk', ReferenceIssuer>;
let verifier: ReferenceVerifier;
let fetch: FetchFn;
let holderKeyPair: KeyPair;
/** P-256, for the issuer configuration that takes only ES256 key proofs (holder-proof-es256). */
let p256KeyPair: KeyPair;

beforeAll(async () => {
  vi.stubGlobal('fetch', networkAttempts);
  // One issuer per DID method, each under its own prefix; did:web needs the TLS front (live runs).
  issuers = {
    'did:key': createReferenceIssuer({ baseUrl: `${ORIGIN}/ref/issuer`, didMethod: 'did:key' }),
    'did:jwk': createReferenceIssuer({ baseUrl: `${ORIGIN}/ref/issuer-jwk`, didMethod: 'did:jwk' }),
  };
  app = Fastify({ logger: false });
  await app.register(issuers['did:key'].plugin, { prefix: '/ref/issuer' });
  await app.register(issuers['did:jwk'].plugin, { prefix: '/ref/issuer-jwk' });
  await app.ready();
  const toIssuers = injectFetch(app, ORIGIN);
  // Status lists come from the issuers, as the playground server's transport serves them in-process.
  verifier = new ReferenceVerifier({
    baseUrl: VERIFIER_BASE,
    didResolver: resolver,
    documentLoader,
    fetchLimits: { fetch: (url, init) => toIssuers(url, init), allowedHosts: [new URL(ORIGIN).host] },
  });
  // The verifier trusts the issuers' mdoc IACA roots and their DIDs, as the playground server sets it up.
  for (const issuer of Object.values(issuers)) {
    verifier.addX5cTrustAnchors(await issuer.mdocTrustAnchors());
    verifier.addTrustedIssuers(Object.values(issuer.dids()));
  }
  const toVerifier = verifierFetchHandler(verifier);
  fetch = (url, init) =>
    url.startsWith(`${VERIFIER_BASE}/`) ? toVerifier(new Request(url, init)) : toIssuers(url, init);
  // Ed25519, so the same key signs ldp_vp proofs and KB-JWTs.
  holderKeyPair = generateKeyPair('EdDSA');
  p256KeyPair = generateKeyPair('ES256');
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

/** The orchestrator's part of a run, with the scenario's hooks between the phases. */
async function runCell(scenario: ScenarioDefinition, format: CredentialFormat, vpProfile: VpProfile) {
  const hooks = scenarioHooks(scenario);
  // An mdoc device key is P-256 and named by `jwk` in the key proof (cose_key binding).
  const mdoc = format === 'mso_mdoc';
  const keyPair = scenario.id === 'holder-proof-es256' || mdoc ? p256KeyPair : holderKeyPair;
  const holderKey = holderKeyFrom(keyPair, mdoc ? 'jwk' : 'did:key');
  const vciProfile = vpProfile === 'inji-draft' ? 'draft13' : 'v1';

  // Issue.
  const request = (await hooks.beforeIssuance?.({ format, vciProfile })) ?? { format, vciProfile };
  const issuer = issuers[(issuerDidMethodFor(scenario) ?? 'did:key') as 'did:key' | 'did:jwk'];
  const offer = issuer.createOffer({
    profile: vciProfile,
    configurationId:
      request.credentialConfigurationId ??
      configurationIdFor(scenario, format) ??
      DEFAULT_CONFIGURATION[format]!,
    ...(issuanceOptionsFor(scenario) ? { issuance: issuanceOptionsFor(scenario)! } : {}),
  });
  const issued = await acceptOffer(offer.offerUri, { fetch, holderKey });
  const received = issued.credentials[0]!;
  let held: HeldCredential = {
    id: 'held-1',
    format,
    raw: received.raw,
    credentialIssuer: issued.credentialIssuer,
    receivedAt: new Date().toISOString(),
  };
  if (hooks.afterCredential) held = await hooks.afterCredential(held);
  const stored: StoredCredential = { id: held.id, format: held.format, raw: held.raw };

  // Present and verify.
  const wallet = new PresentationClient({
    fetch,
    holder: {
      keyPair,
      did: holderKey.did,
      ...(holderKey.kid === undefined ? {} : { verificationMethod: holderKey.kid }),
    },
    documentLoader,
    didResolver: resolver,
    ...walletClientOptions(scenario),
  });
  const spec: PresentationSpec = (await hooks.beforeRequest?.({ format, vpProfile })) ?? {
    format,
    vpProfile,
  };
  // An mso_mdoc request always names the docType, as the reference verifier role does.
  const ask = (requested?: string) => {
    const type = requested ?? (mdoc ? requestedCredentialType(format) : undefined);
    return verifier.createRequest({ profile: vpProfile, format, ...(type ? { query: { type } } : {}) });
  };

  let earlierVpToken: string | undefined;
  if (scenario.presentationTamper === 'replay-earlier') {
    // A genuine earlier exchange with the same verifier, whose vp_token is then replayed.
    const earlier = ask(spec.credentialType);
    const answered = await respondWithScenario(wallet, earlier.uri, [stored], {}, { holderKey: keyPair });
    expect((await verifier.awaitResult(earlier.handle, { timeoutMs: 10_000 })).outcome).toBe('VALID');
    earlierVpToken = answered.form.vp_token;
  }
  const created = ask(spec.credentialType);
  await respondWithScenario(wallet, created.uri, [stored], scenario, {
    holderKey: keyPair,
    documentLoader,
    ...(earlierVpToken === undefined ? {} : { earlierVpToken }),
  });
  return verifier.awaitResult(created.handle, { timeoutMs: 10_000 });
}

const cells = referenceCells(scenarioCatalog);

/** The one verifier check each tamper scenario must fail (ids from `PRESENTATION_CHECKS` and `query`). */
const FAILING_CHECK: Record<string, string> = {
  expired: 'validity',
  'not-yet-valid': 'validity',
  'wrong-type': 'query',
  'bad-signature': 'signature',
  'altered-disclosure': 'signature',
  'unreferenced-disclosure': 'signature',
  'forged-x5c': 'signature',
  'self-issued': 'signature',
  'issuer-name-borrowed': 'signature',
  'kb-wrong-nonce': 'nonce',
  'vp-replay': 'nonce',
  'kb-wrong-aud': 'audience',
  'holder-mismatch': 'holder-binding',
  revoked: 'status',
};
/**
 * Where an mso_mdoc fails another check: nonce and client_id are inside the SessionTranscript that the
 * device signature covers (ISO/IEC 18013-5 section 9.1.3.4), so a replay fails holder binding.
 */
const FAILING_CHECK_MDOC: Record<string, string> = { 'vp-replay': 'holder-binding' };

describe('reference roles x scenario catalogue', () => {
  it('covers every scenario that applies to the reference roles, in every applicable format and both profiles', () => {
    const covered = new Set(cells.map((cell) => cell.scenario.id));
    const notCovered = scenarioCatalog.filter((scenario) => !covered.has(scenario.id)).map((s) => s.id);
    // Only holder-did-canonical needs an outside issuer (Inji Certify pads did:jwk).
    expect(notCovered).toEqual(['holder-did-canonical']);
    expect(cells.length).toBeGreaterThanOrEqual(60);
    for (const profile of ['inji-draft', 'final-1.0']) {
      expect(cells.filter((cell) => cell.vpProfile === profile).length).toBe(cells.length / 2);
    }
  });

  it.each(cells.map((cell) => [cell.scenario.id, cell.format, cell.vpProfile, cell.scenario] as const))(
    '%s, %s, %s',
    async (id, format, vpProfile, scenario) => {
      const report = await runCell(scenario, format, vpProfile);
      const failed = report.checks.filter((check) => check.status === 'fail').map((check) => check.id);
      expect(report.outcome).toBe(scenario.expected);
      // A tamper scenario must fail for its own reason, not because something else broke first.
      const expectedCheck = (format === 'mso_mdoc' ? FAILING_CHECK_MDOC[id] : undefined) ?? FAILING_CHECK[id];
      expect(failed).toEqual(expectedCheck ? [expectedCheck] : []);
    },
    20_000,
  );
});

describe('requestedCredentialType', () => {
  it('asks for the farmer credential by type (ldp_vc), vct (SD-JWT VC) or docType (mso_mdoc)', () => {
    expect(requestedCredentialType('ldp_vc')).toBe('FarmerCredential');
    expect(requestedCredentialType('dc+sd-jwt')).toBe('https://playground.ps02.test/vct/farmer/v1');
    expect(requestedCredentialType('mso_mdoc')).toBe('test.ps02.playground.farmer.1');
  });
});
