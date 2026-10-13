/**
 * Issuer trust in the reference verifier: a credential must be signed by an issuer the verifier accepts
 * (`addTrustedIssuers`), and the report names the issuer the key is bound to, never a bare `iss`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CREDENTIALS_V1_URL,
  PLAYGROUND_CONTEXT_V1_URL,
  issueLdpVc,
  issueSdJwtVc,
} from '@inji-playground/formats';
import { selfIssueSdJwt } from '@inji-playground/formats/tamper';
import type { StoredCredential } from '../src/index.js';
import {
  FARMER_VCT,
  didKeyParty,
  documentLoader,
  farmerLdpVc,
  farmerSdJwtVc,
  harness,
  holder,
  issuer,
} from './helpers.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

type Format = 'ldp_vc' | 'vc+sd-jwt';
const PROFILES = ['inji-draft', 'final-1.0'] as const;

/** A farmer credential the holder signed itself, under its own did:key. */
async function selfIssued(format: Format): Promise<StoredCredential> {
  const forger = didKeyParty();
  if (format === 'vc+sd-jwt') {
    return { ...(await farmerSdJwtVc()), raw: selfIssueSdJwt((await farmerSdJwtVc()).raw).sdJwt };
  }
  const signed = await issueLdpVc({
    credential: {
      '@context': [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
      type: ['VerifiableCredential', 'FarmerCredential'],
      issuer: forger.did,
      issuanceDate: new Date(Date.now() - 60_000).toISOString(),
      credentialSubject: { id: holder.did, givenName: 'Asha', familyName: 'Rao', landAreaAcres: 3 },
    },
    suite: 'Ed25519Signature2020',
    key: { keyPair: forger.keyPair, verificationMethod: forger.verificationMethod },
    documentLoader,
  });
  return { id: 'farmer-ldp', format: 'ldp_vc', raw: JSON.stringify(signed) };
}

async function verify(
  format: Format,
  profile: (typeof PROFILES)[number],
  credential: StoredCredential,
  trust?: string[],
) {
  const { verifier, wallet } = harness();
  if (trust) verifier.addTrustedIssuers(trust);
  const created = verifier.createRequest({ profile, format });
  await wallet.respond(created.uri, [credential]);
  return verifier.awaitResult(created.handle);
}

describe.each(PROFILES)('issuer trust, %s', (profile) => {
  describe.each<Format>(['vc+sd-jwt', 'ldp_vc'])('%s', (format) => {
    const genuine = (): Promise<StoredCredential> => (format === 'ldp_vc' ? farmerLdpVc() : farmerSdJwtVc());

    it('a trusted issuer -> VALID, reported under its DID', async () => {
      const report = await verify(format, profile, await genuine(), [issuer.did]);
      expect(report.errors).toEqual([]);
      expect(report.outcome).toBe('VALID');
      expect(report.presentations[0]?.issuer).toBe(issuer.did);
    });

    it('a credential the holder issued itself -> INVALID, ISSUER_UNTRUSTED, signature check failed', async () => {
      const report = await verify(format, profile, await selfIssued(format), [issuer.did]);
      expect(report.outcome).toBe('INVALID');
      expect(report.errors[0]?.code).toBe('ISSUER_UNTRUSTED');
      expect(report.checks.find((check) => check.id.endsWith('signature'))?.status).toBe('fail');
    });

    it('without a trust list every DID issuer is accepted (library default)', async () => {
      expect((await verify(format, profile, await selfIssued(format))).outcome).toBe('VALID');
    });
  });

  it("vc+sd-jwt signed with the holder's did:key under the issuer's name -> INVALID, SDJWT_ISSUER_MISMATCH", async () => {
    const borrowed = selfIssueSdJwt((await farmerSdJwtVc()).raw, { iss: 'keep' }).sdJwt;
    const report = await verify('vc+sd-jwt', profile, { ...(await farmerSdJwtVc()), raw: borrowed });
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('SDJWT_ISSUER_MISMATCH');
  });

  it('vc+sd-jwt naming an issuer URL in iss but signed by a did:key -> INVALID, never reported under that URL', async () => {
    const forger = didKeyParty();
    const raw = await issueSdJwtVc({
      issuer: { keyPair: forger.keyPair, kid: forger.verificationMethod },
      iss: 'https://certify.ps02.test',
      typ: 'vc+sd-jwt',
      vct: FARMER_VCT,
      claims: { given_name: 'Asha', family_name: 'Rao', land_area_acres: 3 },
      holder: { jwk: holder.keyPair.publicJwk },
    });
    const report = await verify('vc+sd-jwt', profile, { id: 'farmer-sd-jwt', format: 'vc+sd-jwt', raw });
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('SDJWT_ISSUER_MISMATCH');
    expect(JSON.stringify(report.presentations)).not.toContain('https://certify.ps02.test');
  });
});

describe('an untrusted did:web issuer is refused before its DID document is fetched', () => {
  // *.ps02.test skips the address check, so a resolution would go straight to the stubbed global fetch.
  const forger = { ...didKeyParty(), did: 'did:web:attacker.ps02.test' };
  const verificationMethod = `${forger.did}#key-1`;

  async function credential(format: Format): Promise<StoredCredential> {
    if (format === 'vc+sd-jwt') {
      const raw = await issueSdJwtVc({
        issuer: { keyPair: forger.keyPair, kid: verificationMethod },
        iss: forger.did,
        typ: 'vc+sd-jwt',
        vct: FARMER_VCT,
        claims: { given_name: 'Asha', family_name: 'Rao', land_area_acres: 3 },
        holder: { jwk: holder.keyPair.publicJwk },
      });
      return { id: 'farmer-sd-jwt', format, raw };
    }
    const signed = await issueLdpVc({
      credential: {
        '@context': [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
        type: ['VerifiableCredential', 'FarmerCredential'],
        issuer: forger.did,
        issuanceDate: new Date(Date.now() - 60_000).toISOString(),
        credentialSubject: { id: holder.did, givenName: 'Asha', familyName: 'Rao', landAreaAcres: 3 },
      },
      suite: 'Ed25519Signature2020',
      key: { keyPair: forger.keyPair, verificationMethod },
      documentLoader,
    });
    return { id: 'farmer-ldp', format, raw: JSON.stringify(signed) };
  }

  it('ldp_vc naming a trusted issuer but an untrusted did:web method in object form -> INVALID, no fetch', async () => {
    const signed = JSON.parse((await credential('ldp_vc')).raw) as Record<string, unknown>;
    const proof = signed.proof as Record<string, unknown>;
    const raw = JSON.stringify({
      ...signed,
      issuer: issuer.did,
      proof: { ...proof, verificationMethod: { id: verificationMethod } },
    });
    const report = await verify('ldp_vc', 'final-1.0', { id: 'farmer-ldp', format: 'ldp_vc', raw }, [
      issuer.did,
    ]);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('ISSUER_UNTRUSTED');
    expect(networkAttempts).not.toHaveBeenCalled();
  });

  it.each<Format>(['vc+sd-jwt', 'ldp_vc'])('%s -> INVALID, ISSUER_UNTRUSTED, no fetch', async (format) => {
    const report = await verify(format, 'final-1.0', await credential(format), [issuer.did]);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('ISSUER_UNTRUSTED');
    expect(networkAttempts).not.toHaveBeenCalled();
  });
});
