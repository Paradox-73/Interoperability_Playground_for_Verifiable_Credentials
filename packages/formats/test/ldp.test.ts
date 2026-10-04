import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildDidDocument,
  createDidJwk,
  createDidKey,
  createDidResolver,
  createDocumentLoader,
  createLdpVp,
  CREDENTIALS_V1_URL,
  CREDENTIALS_V2_URL,
  didKeyVerificationMethodId,
  generateKeyPair,
  issueLdpVc,
  PLAYGROUND_CONTEXT_V1_URL,
  verifyLdpVc,
  verifyLdpVp,
  type DocumentLoader,
  type DocumentSource,
  type JsonObject,
  type LdpProofSuite,
  type LdpSigningKey,
} from '../src/index.js';
import { fakeWeb } from './helpers.js';

/**
 * Every test in this file runs with the network disabled: global fetch throws, and the document loader
 * is created without `network`, so contexts can only come from the pinned set.
 */
const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

const resolver = createDidResolver();
const loaded: { url: string; source: DocumentSource }[] = [];
const documentLoader: DocumentLoader = createDocumentLoader({
  didResolver: resolver,
  onLoad: (event) => loaded.push(event),
});

function didKeySigner(): LdpSigningKey & { did: string } {
  const keyPair = generateKeyPair('EdDSA');
  const did = createDidKey(keyPair.publicJwk);
  return { keyPair, did, verificationMethod: didKeyVerificationMethodId(did) };
}

const subject = { givenName: 'Asha', familyName: 'Rao', landAreaAcres: 3 };

function unsignedCredential(
  version: '1.1' | '2.0',
  issuer: string,
  holder: string,
  validity: { from?: Date; until?: Date } = {},
): JsonObject {
  const from = (validity.from ?? new Date(Date.now() - 60_000)).toISOString();
  const common = {
    type: ['VerifiableCredential', 'FarmerCredential'],
    issuer,
    credentialSubject: { id: holder, ...subject },
  };
  return version === '1.1'
    ? {
        '@context': [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
        ...common,
        issuanceDate: from,
        ...(validity.until ? { expirationDate: validity.until.toISOString() } : {}),
      }
    : {
        '@context': [CREDENTIALS_V2_URL, PLAYGROUND_CONTEXT_V1_URL],
        ...common,
        validFrom: from,
        ...(validity.until ? { validUntil: validity.until.toISOString() } : {}),
      };
}

const cases: { name: string; version: '1.1' | '2.0'; suite: LdpProofSuite; proofType: string }[] = [
  {
    name: 'VC 1.1 with Ed25519Signature2020',
    version: '1.1',
    suite: 'Ed25519Signature2020',
    proofType: 'Ed25519Signature2020',
  },
  {
    name: 'VC 2.0 with eddsa-rdfc-2022',
    version: '2.0',
    suite: 'eddsa-rdfc-2022',
    proofType: 'DataIntegrityProof/eddsa-rdfc-2022',
  },
];

describe.each(cases)('ldp_vc: $name', ({ version, suite, proofType }) => {
  it('round trip with network access disabled (VC Data Integrity 1.0 sections 4.2 and 4.4)', async () => {
    const issuer = didKeySigner();
    const signed = await issueLdpVc({
      credential: unsignedCredential(version, issuer.did, 'did:example:holder'),
      suite,
      key: issuer,
      documentLoader,
    });
    expect(signed.proof).toMatchObject(
      suite === 'Ed25519Signature2020'
        ? {
            type: 'Ed25519Signature2020',
            proofPurpose: 'assertionMethod',
            verificationMethod: issuer.verificationMethod,
          }
        : {
            type: 'DataIntegrityProof',
            cryptosuite: 'eddsa-rdfc-2022',
            verificationMethod: issuer.verificationMethod,
          },
    );
    const result = await verifyLdpVc(signed, { documentLoader });
    expect(result).toMatchObject({ issuer: issuer.did, proofType, dataModel: version, warnings: [] });
    expect(loaded.every((event) => event.source === 'pinned' || event.source === 'did')).toBe(true);
  });

  it('a tampered credential is rejected (VC Data Integrity 1.0 section 4.4)', async () => {
    const issuer = didKeySigner();
    const signed = await issueLdpVc({
      credential: unsignedCredential(version, issuer.did, 'did:example:holder'),
      suite,
      key: issuer,
      documentLoader,
    });
    const tampered = structuredClone(signed) as JsonObject & { credentialSubject: { landAreaAcres: number } };
    tampered.credentialSubject.landAreaAcres = 30;
    await expect(verifyLdpVc(tampered, { documentLoader })).rejects.toMatchObject({
      code: 'LDP_PROOF_INVALID',
    });
  });

  it('a credential signed by a key the issuer DID does not list is rejected', async () => {
    const issuer = didKeySigner();
    const impostor = didKeySigner();
    const signed = await issueLdpVc({
      credential: unsignedCredential(version, issuer.did, 'did:example:holder'),
      suite,
      key: { keyPair: impostor.keyPair, verificationMethod: issuer.verificationMethod },
      documentLoader,
    });
    await expect(verifyLdpVc(signed, { documentLoader })).rejects.toMatchObject({
      code: 'LDP_PROOF_INVALID',
    });
  });

  it(`an expired credential is reported as expired (${version === '1.1' ? 'VC 1.1 section 4.8' : 'VC 2.0 section 4.9'})`, async () => {
    const issuer = didKeySigner();
    const credential = unsignedCredential(version, issuer.did, 'did:example:holder', {
      until: new Date(Date.now() + 3_600_000),
    });
    const signed = await issueLdpVc({ credential, suite, key: issuer, documentLoader });
    const later = new Date(Date.now() + 7_200_000);
    await expect(verifyLdpVc(signed, { documentLoader, now: later })).rejects.toMatchObject({
      code: 'LDP_EXPIRED',
    });
    const earlier = new Date(Date.now() - 3_600_000);
    await expect(verifyLdpVc(signed, { documentLoader, now: earlier })).rejects.toMatchObject({
      code: 'LDP_NOT_YET_VALID',
    });
  });

  it('the proof error names what failed', async () => {
    const issuer = didKeySigner();
    const signed = await issueLdpVc({
      credential: unsignedCredential(version, issuer.did, 'did:example:holder'),
      suite,
      key: issuer,
      documentLoader,
    });
    (signed.proof as JsonObject).proofValue = `z${'1'.repeat(86)}`;
    const error = await verifyLdpVc(signed, { documentLoader }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 'LDP_PROOF_INVALID',
      spec: 'VC Data Integrity 1.0 section 4.4 (Verify Proof)',
    });
    expect((error as Error).message).toMatch(/proof did not verify: .+/);
  });
});

describe('ldp_vc issuer key types', () => {
  it('did:jwk issuer (JsonWebKey2020) verifies with both suites', async () => {
    const keyPair = generateKeyPair('EdDSA');
    const did = createDidJwk(keyPair.publicJwk);
    for (const { version, suite } of cases) {
      const signed = await issueLdpVc({
        credential: unsignedCredential(version, did, 'did:example:holder'),
        suite,
        key: { keyPair, verificationMethod: `${did}#0` },
        documentLoader,
      });
      await expect(verifyLdpVc(signed, { documentLoader })).resolves.toMatchObject({ issuer: did });
    }
  });

  it('did:web issuer through the host override map (as hosted by the reference issuer)', async () => {
    const keyPair = generateKeyPair('EdDSA');
    const did = 'did:web:issuer.ps02.test';
    const web = fakeWeb();
    web.serve(
      'http://localhost:28110/.well-known/did.json',
      buildDidDocument(did, [{ publicJwk: keyPair.publicJwk, fragment: 'key-0' }]),
    );
    const webLoader = createDocumentLoader({
      didResolver: createDidResolver({
        fetch: web.fetch,
        hostOverrides: { 'issuer.ps02.test': 'http://localhost:28110' },
      }),
    });
    const signed = await issueLdpVc({
      credential: unsignedCredential('1.1', did, 'did:example:holder'),
      suite: 'Ed25519Signature2020',
      key: { keyPair, verificationMethod: `${did}#key-0` },
      documentLoader: webLoader,
    });
    await expect(verifyLdpVc(signed, { documentLoader: webLoader })).resolves.toMatchObject({ issuer: did });
  });

  it('eddsa-rdfc-2022 needs VC 2.0; P-256 keys are refused for Ed25519 suites', async () => {
    const issuer = didKeySigner();
    await expect(
      issueLdpVc({
        credential: unsignedCredential('1.1', issuer.did, 'x:y'),
        suite: 'eddsa-rdfc-2022',
        key: issuer,
        documentLoader,
      }),
    ).rejects.toMatchObject({ code: 'LDP_MALFORMED' });
    const p256 = generateKeyPair('ES256');
    await expect(
      issueLdpVc({
        credential: unsignedCredential('2.0', issuer.did, 'x:y'),
        suite: 'eddsa-rdfc-2022',
        key: { keyPair: p256, verificationMethod: issuer.verificationMethod },
        documentLoader,
      }),
    ).rejects.toMatchObject({ code: 'KEY_UNSUPPORTED' });
  });
});

describe.each(cases)('ldp_vp: $name', ({ version, suite }) => {
  const challenge = 'n-0S6_WzA2Mj';
  const domain = 'redirect_uri:https://verifier.ps02.test/response';

  async function presentation(overrides: { challenge?: string; domain?: string; holderDid?: string } = {}) {
    const issuer = didKeySigner();
    const holder = didKeySigner();
    const credential = await issueLdpVc({
      credential: unsignedCredential(version, issuer.did, holder.did),
      suite,
      key: issuer,
      documentLoader,
    });
    const vp = await createLdpVp({
      credentials: [credential],
      ...(overrides.holderDid ? { holder: overrides.holderDid } : {}),
      suite,
      key: holder,
      challenge: overrides.challenge ?? challenge,
      domain: overrides.domain ?? domain,
      documentLoader,
    });
    return { vp, issuer, holder };
  }

  it('OpenID4VP 1.0 Appendix B.1.3.2.5: challenge = nonce and domain = client_id verify', async () => {
    const { vp, issuer, holder } = await presentation();
    expect(vp.proof).toMatchObject({ proofPurpose: 'authentication', challenge, domain });
    const result = await verifyLdpVp(vp, {
      documentLoader,
      expectedChallenge: challenge,
      expectedDomain: domain,
    });
    expect(result.holder).toBe(holder.did);
    expect(result.credentials).toEqual([expect.objectContaining({ issuer: issuer.did, dataModel: version })]);
  });

  it('OpenID4VP 1.0 Appendix B.1.3.2.5: a presentation made for another nonce is rejected', async () => {
    const { vp } = await presentation({ challenge: 'old-nonce' });
    await expect(
      verifyLdpVp(vp, { documentLoader, expectedChallenge: challenge, expectedDomain: domain }),
    ).rejects.toMatchObject({
      code: 'LDP_CHALLENGE_MISMATCH',
      details: { expected: challenge, received: 'old-nonce' },
    });
  });

  it('OpenID4VP 1.0 Appendix B.1.3.2.5: a presentation made for another verifier is rejected', async () => {
    const { vp } = await presentation({ domain: 'redirect_uri:https://other.ps02.test/response' });
    await expect(
      verifyLdpVp(vp, { documentLoader, expectedChallenge: challenge, expectedDomain: domain }),
    ).rejects.toMatchObject({
      code: 'LDP_DOMAIN_MISMATCH',
    });
  });

  it('VC Data Integrity 1.0 section 4.4: rewriting the challenge inside the proof breaks the signature', async () => {
    const { vp } = await presentation({ challenge: 'old-nonce' });
    (vp.proof as JsonObject).challenge = challenge;
    await expect(
      verifyLdpVp(vp, { documentLoader, expectedChallenge: challenge, expectedDomain: domain }),
    ).rejects.toMatchObject({
      code: 'LDP_PROOF_INVALID',
    });
  });

  it('a presentation signed by a key that is not the holder is rejected', async () => {
    const { vp } = await presentation({ holderDid: didKeySigner().did });
    await expect(verifyLdpVp(vp, { documentLoader, expectedChallenge: challenge })).rejects.toMatchObject({
      code: 'LDP_HOLDER_MISMATCH',
    });
  });

  it('a tampered credential inside a valid presentation is rejected', async () => {
    const issuer = didKeySigner();
    const holder = didKeySigner();
    const credential = await issueLdpVc({
      credential: unsignedCredential(version, issuer.did, holder.did),
      suite,
      key: issuer,
      documentLoader,
    });
    (credential.credentialSubject as JsonObject).givenName = 'Mallory';
    const vp = await createLdpVp({
      credentials: [credential],
      suite,
      key: holder,
      challenge,
      domain,
      documentLoader,
    });
    await expect(
      verifyLdpVp(vp, { documentLoader, expectedChallenge: challenge, expectedDomain: domain }),
    ).rejects.toMatchObject({
      code: 'LDP_PROOF_INVALID',
    });
  });
});

describe('JSON-LD document loader', () => {
  it('a context that is not pinned fails with CONTEXT_NOT_PINNED while the network is off', async () => {
    await expect(documentLoader('https://example.org/unknown-context/v1')).rejects.toMatchObject({
      code: 'CONTEXT_NOT_PINNED',
    });
  });

  it('serves the pinned W3C contexts and the playground vocabulary offline', async () => {
    for (const url of [
      CREDENTIALS_V1_URL,
      CREDENTIALS_V2_URL,
      PLAYGROUND_CONTEXT_V1_URL,
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ]) {
      await expect(documentLoader(url)).resolves.toMatchObject({ documentUrl: url });
    }
  });

  describe('with network access switched on', () => {
    let cacheDir: string;
    beforeAll(async () => {
      cacheDir = await mkdtemp(join(tmpdir(), 'ps02-formats-contexts-'));
    });
    afterAll(async () => {
      await rm(cacheDir, { recursive: true, force: true });
    });

    it('fetches an unpinned context once and then serves it from the file cache', async () => {
      const web = fakeWeb();
      const url = 'https://contexts.ps02.test/vocab/v1';
      web.serve(url, { '@context': { term: 'https://contexts.ps02.test/vocab#term' } });
      const first = createDocumentLoader({ network: { fetch: web.fetch, cacheDir } });
      await expect(first(url)).resolves.toMatchObject({
        document: { '@context': { term: expect.any(String) } },
      });
      expect(await readdir(cacheDir)).toHaveLength(1);

      const sources: DocumentSource[] = [];
      const second = createDocumentLoader({
        network: { fetch: web.fetch, cacheDir },
        onLoad: (event) => sources.push(event.source),
      });
      await second(url);
      expect(sources).toEqual(['cache']);
      expect(web.requests).toEqual([url]);
    });

    it('refuses plain-HTTP context URLs', async () => {
      const loader = createDocumentLoader({ network: { fetch: fakeWeb().fetch } });
      await expect(loader('http://contexts.ps02.test/v1')).rejects.toMatchObject({
        code: 'CONTEXT_FETCH_FAILED',
      });
    });
  });
});
