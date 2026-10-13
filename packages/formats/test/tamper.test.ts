/**
 * Tamper primitives: each one changes exactly one thing, and the format library's verifier rejects
 * the result with the error code of the rule it breaks. Network access is disabled throughout.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CREDENTIALS_V1_URL,
  CREDENTIALS_V2_URL,
  PLAYGROUND_CONTEXT_V1_URL,
  createDidKey,
  createDidResolver,
  createDocumentLoader,
  createLdpVp,
  decodeCompactJws,
  decodeSdJwt,
  didKeyVerificationMethodId,
  generateKeyPair,
  issueLdpVc,
  issueSdJwtVc,
  presentSdJwtVc,
  signCompactJws,
  splitSdJwt,
  verifyLdpVc,
  verifyLdpVp,
  verifySdJwtVc,
  type JsonObject,
  type KeyPair,
  type LdpProofSuite,
  type LdpSigningKey,
  type VerifySdJwtVcOptions,
} from '../src/index.js';
import {
  addUnreferencedDisclosure,
  alterDisclosure,
  dropDisclosure,
  flipByte,
  flipEmbeddedCredentialProof,
  flipJwsSignature,
  flipKeyBindingSignature,
  flipProofValue,
  flipSdJwtIssuerSignature,
  forgeWithSelfSignedX5c,
  joinSdJwt,
  representLdpVp,
  resignJws,
  resignKeyBinding,
  selfIssueSdJwt,
} from '../src/tamper/index.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

const resolver = createDidResolver();
const documentLoader = createDocumentLoader({ didResolver: resolver });
const VCT = 'https://playground.ps02.test/vct/farmer/v1';
const AUDIENCE = 'decentralized_identifier:did:key:z6MkVerifier';
const NONCE = 'tamper-test-nonce';

function didKeyParty(): LdpSigningKey & { did: string } {
  const keyPair = generateKeyPair('EdDSA');
  const did = createDidKey(keyPair.publicJwk);
  return { keyPair, did, verificationMethod: didKeyVerificationMethodId(did) };
}

describe('byte and JWS primitives', () => {
  it('flipByte inverts one byte of a copy and wraps negative indexes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect([...flipByte(bytes)]).toEqual([1, 2, 0xfc, 4]);
    expect([...flipByte(bytes, -1)]).toEqual([1, 2, 3, 0xfb]);
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(() => flipByte(new Uint8Array())).toThrow(TypeError);
  });

  it('flipJwsSignature keeps header and payload and changes the signature bytes', () => {
    const key = generateKeyPair('ES256');
    const jws = signCompactJws({ typ: 'JWT' }, { a: 1 }, key);
    const flipped = flipJwsSignature(jws);
    const [h1, p1, s1] = jws.split('.');
    const [h2, p2, s2] = flipped.split('.');
    expect([h2, p2]).toEqual([h1, p1]);
    expect(s2).not.toBe(s1);
    expect(() => flipJwsSignature('not-a-jws')).toThrow(TypeError);
  });

  it('resignJws applies header and payload changes, removes undefined members, and sets alg from the key', () => {
    const key = generateKeyPair('EdDSA');
    const original = signCompactJws({ typ: 'JWT', kid: 'k1' }, { a: 1, b: 2 }, key);
    const changed = decodeCompactJws(
      resignJws(original, { header: { kid: undefined, x: 'y' }, payload: { a: 9, b: undefined } }, key),
    );
    expect(changed.header).toEqual({ typ: 'JWT', x: 'y', alg: 'EdDSA' });
    expect(changed.payload).toEqual({ a: 9 });
  });
});

describe('SD-JWT VC primitives (RFC 9901)', () => {
  let issuer: KeyPair;
  let holder: KeyPair;
  let issuerDid: string;
  let issued: string;
  let options: VerifySdJwtVcOptions;

  beforeAll(async () => {
    issuer = generateKeyPair('ES256');
    holder = generateKeyPair('EdDSA');
    issuerDid = createDidKey(issuer.publicJwk);
    issued = await issueSdJwtVc({
      issuer: { keyPair: issuer, kid: didKeyVerificationMethodId(issuerDid) },
      iss: issuerDid,
      vct: VCT,
      claims: { given_name: 'Asha', family_name: 'Rao', land_area_acres: 3 },
      holder: { jwk: holder.publicJwk },
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    options = {
      didResolver: resolver,
      keyBinding: { nonce: NONCE, audience: AUDIENCE },
      expectedVct: VCT,
      x5c: { requireTrusted: true },
    };
  });

  const present = (sdJwt: string) =>
    presentSdJwtVc({ sdJwt, disclose: 'all', holderKey: holder, audience: AUDIENCE, nonce: NONCE });

  it('the untampered presentation verifies (baseline for every case below)', async () => {
    await expect(verifySdJwtVc(await present(issued), options)).resolves.toMatchObject({
      claims: { given_name: 'Asha' },
    });
  });

  it('joinSdJwt is the inverse of splitSdJwt, with and without a KB-JWT', async () => {
    expect(joinSdJwt(splitSdJwt(issued))).toBe(issued);
    const presented = await present(issued);
    expect(joinSdJwt(splitSdJwt(presented))).toBe(presented);
  });

  it('flipped issuer signature -> SDJWT_SIGNATURE_INVALID (section 7.1 step 2b)', async () => {
    const tampered = flipSdJwtIssuerSignature(issued);
    expect(splitSdJwt(tampered).disclosures).toEqual(splitSdJwt(issued).disclosures);
    await expect(verifySdJwtVc(await present(tampered), options)).rejects.toMatchObject({
      code: 'SDJWT_SIGNATURE_INVALID',
    });
  });

  it('the holder library refuses to present a credential with a disclosure the issuer did not sign', async () => {
    // So disclosure tampering is applied to the presentation, followed by resignKeyBinding.
    await expect(present(alterDisclosure(issued, 'given_name', 'Mallory'))).rejects.toThrow(/Unreferenced/);
  });

  it('altered disclosure value, KB-JWT signed again -> SDJWT_DISCLOSURE_INVALID (section 7.1 step 3)', async () => {
    const altered = alterDisclosure(await present(issued), 'given_name', 'Mallory');
    const names = decodeSdJwt(altered).disclosures.map((d) => [d.name, d.value]);
    expect(names).toContainEqual(['given_name', 'Mallory']);
    // Without a new KB-JWT the sd_hash check could fail first; the issuer's digests are checked first anyway.
    await expect(verifySdJwtVc(altered, options)).rejects.toMatchObject({ code: 'SDJWT_DISCLOSURE_INVALID' });
    const tampered = resignKeyBinding(altered, {}, holder);
    await expect(verifySdJwtVc(tampered, options)).rejects.toMatchObject({
      code: 'SDJWT_DISCLOSURE_INVALID',
    });
  });

  it('unreferenced extra disclosure, KB-JWT signed again -> SDJWT_DISCLOSURE_INVALID (section 7.1 step 3)', async () => {
    const presented = await present(issued);
    const tampered = resignKeyBinding(addUnreferencedDisclosure(presented, 'is_over_65', true), {}, holder);
    expect(splitSdJwt(tampered).disclosures).toHaveLength(splitSdJwt(presented).disclosures.length + 1);
    await expect(verifySdJwtVc(tampered, options)).rejects.toMatchObject({
      code: 'SDJWT_DISCLOSURE_INVALID',
    });
  });

  it('a disclosure dropped before presenting is selective disclosure and still verifies', async () => {
    const reduced = dropDisclosure(issued, 'family_name');
    const result = await verifySdJwtVc(await present(reduced), options);
    expect(result.claims.family_name).toBeUndefined();
    expect(result.claims.given_name).toBe('Asha');
  });

  it('a disclosure dropped after the KB-JWT was signed -> KB_JWT_SD_HASH_MISMATCH (section 7.3 step 5g)', async () => {
    const tampered = dropDisclosure(await present(issued), 'family_name');
    await expect(verifySdJwtVc(tampered, options)).rejects.toMatchObject({ code: 'KB_JWT_SD_HASH_MISMATCH' });
  });

  it('a disclosure that does not exist cannot be altered or dropped', () => {
    expect(() => alterDisclosure(issued, 'no_such_claim', 1)).toThrow(TypeError);
    expect(() => dropDisclosure(issued, 'no_such_claim')).toThrow(TypeError);
  });

  it.each([
    ['nonce', { nonce: 'another-nonce' }, 'KB_JWT_NONCE_MISMATCH'],
    ['aud', { aud: 'decentralized_identifier:did:key:z6MkOther' }, 'KB_JWT_AUDIENCE_MISMATCH'],
  ] as const)(
    'KB-JWT signed again by the holder with a wrong %s -> %s (section 7.3 step 5f)',
    async (_name, change, code) => {
      const tampered = resignKeyBinding(await present(issued), change, holder);
      expect(decodeSdJwt(tampered).kb?.payload).toMatchObject(change);
      await expect(verifySdJwtVc(tampered, options)).rejects.toMatchObject({ code });
    },
  );

  it('KB-JWT signed again with unchanged claims still verifies (sd_hash recomputed)', async () => {
    const same = resignKeyBinding(await present(issued), {}, holder);
    await expect(verifySdJwtVc(same, options)).resolves.toBeDefined();
  });

  it('KB-JWT signed by another key -> KB_JWT_SIGNATURE_INVALID (section 7.3 step 5c)', async () => {
    const tampered = resignKeyBinding(await present(issued), {}, generateKeyPair('EdDSA'));
    await expect(verifySdJwtVc(tampered, options)).rejects.toMatchObject({
      code: 'KB_JWT_SIGNATURE_INVALID',
    });
  });

  it('flipped KB-JWT signature -> KB_JWT_SIGNATURE_INVALID; no KB-JWT -> TypeError', async () => {
    await expect(
      verifySdJwtVc(flipKeyBindingSignature(await present(issued)), options),
    ).rejects.toMatchObject({
      code: 'KB_JWT_SIGNATURE_INVALID',
    });
    expect(() => flipKeyBindingSignature(issued)).toThrow(TypeError);
    expect(() => resignKeyBinding(issued, {}, holder)).toThrow(TypeError);
  });

  it('forged with a self-signed x5c: the signature checks out against the leaf, the chain is untrusted -> X5C_UNTRUSTED', async () => {
    const forged = await forgeWithSelfSignedX5c(issued, { payload: { given_name: undefined } });
    const decoded = decodeSdJwt(forged.sdJwt);
    expect(decoded.header.kid).toBeUndefined();
    expect(decoded.header.x5c).toEqual([forged.certificate.x5c]);
    expect(decoded.payload.iss).toBe(issuerDid);
    expect(decoded.kb).toBeUndefined();
    const presented = await present(forged.sdJwt);
    await expect(verifySdJwtVc(presented, options)).rejects.toMatchObject({ code: 'X5C_UNTRUSTED' });
    // Without chain validation the DID `iss` still refuses it: an x5c key never speaks for a DID.
    await expect(verifySdJwtVc(presented, { ...options, x5c: {} })).rejects.toMatchObject({
      code: 'SDJWT_ISSUER_MISMATCH',
    });
  });

  it("self-issued with the issuer's name kept: the did:key is not the issuer's -> SDJWT_ISSUER_MISMATCH", async () => {
    const forged = selfIssueSdJwt(issued, { iss: 'keep' });
    const decoded = decodeSdJwt(forged.sdJwt);
    expect(decoded.header.kid).toBe(didKeyVerificationMethodId(forged.did));
    expect(decoded.header.x5c).toBeUndefined();
    expect(decoded.payload.iss).toBe(issuerDid);
    await expect(verifySdJwtVc(await present(forged.sdJwt), options)).rejects.toMatchObject({
      code: 'SDJWT_ISSUER_MISMATCH',
    });
  });

  it('self-issued under its own did:key: signature and issuer agree, only a trust list can refuse it', async () => {
    const forged = selfIssueSdJwt(issued);
    const decoded = decodeSdJwt(forged.sdJwt);
    expect(decoded.payload.iss).toBe(forged.did);
    expect(decoded.payload.cnf).toEqual(decodeSdJwt(issued).payload.cnf);
    const verified = await verifySdJwtVc(await present(forged.sdJwt), options);
    expect(verified.issuerKey).toMatchObject({ source: 'did', issuer: forged.did });
    expect(verified.issuerKey.issuer).not.toBe(issuerDid);
  });
});

describe.each<{ version: '1.1' | '2.0'; suite: LdpProofSuite }>([
  { version: '1.1', suite: 'Ed25519Signature2020' },
  { version: '2.0', suite: 'eddsa-rdfc-2022' },
])('ldp_vc / ldp_vp primitives, VC $version $suite', ({ version, suite }) => {
  const issuer = didKeyParty();
  const holder = didKeyParty();
  let credential: JsonObject;

  beforeAll(async () => {
    const now = Date.now();
    credential = await issueLdpVc({
      credential: {
        '@context': [version === '1.1' ? CREDENTIALS_V1_URL : CREDENTIALS_V2_URL, PLAYGROUND_CONTEXT_V1_URL],
        type: ['VerifiableCredential', 'FarmerCredential'],
        issuer: issuer.did,
        ...(version === '1.1'
          ? { issuanceDate: new Date(now - 60_000).toISOString() }
          : { validFrom: new Date(now - 60_000).toISOString() }),
        credentialSubject: { id: holder.did, givenName: 'Asha' },
      },
      suite,
      key: issuer,
      documentLoader,
    });
  });

  it('flipProofValue changes only the proofValue, and verification fails (LDP_PROOF_INVALID)', async () => {
    const tampered = flipProofValue(credential);
    const before = credential.proof as JsonObject;
    const after = tampered.proof as JsonObject;
    expect(after.proofValue).not.toBe(before.proofValue);
    expect({ ...after, proofValue: undefined }).toEqual({ ...before, proofValue: undefined });
    expect((credential.proof as JsonObject).proofValue).toBe(before.proofValue);
    await expect(verifyLdpVc(tampered, { documentLoader })).rejects.toMatchObject({
      code: 'LDP_PROOF_INVALID',
    });
    expect(() => flipProofValue({ type: ['VerifiableCredential'] })).toThrow(TypeError);
  });

  it('flipEmbeddedCredentialProof breaks the embedded credential of a presentation', async () => {
    const vp = await createLdpVp({
      credentials: [credential],
      suite,
      key: holder,
      challenge: NONCE,
      documentLoader,
    });
    const tampered = flipEmbeddedCredentialProof(vp);
    const embedded = (tampered.verifiableCredential as JsonObject[])[0]!;
    expect((embedded.proof as JsonObject).proofValue).not.toBe((credential.proof as JsonObject).proofValue);
    await expect(verifyLdpVp(tampered, { documentLoader, expectedChallenge: NONCE })).rejects.toMatchObject({
      code: expect.stringMatching(/^LDP_PROOF_INVALID$/) as unknown,
    });
  });

  it('representLdpVp: a valid holder proof by another key, so holder != credentialSubject.id', async () => {
    const vp = await createLdpVp({
      credentials: [credential],
      suite,
      key: holder,
      challenge: NONCE,
      documentLoader,
    });
    const thief = didKeyParty();
    const stolen = await representLdpVp(vp, {
      key: thief,
      challenge: NONCE,
      domain: AUDIENCE,
      documentLoader,
    });
    expect(stolen.holder).toBe(thief.did);
    const verified = await verifyLdpVp(stolen, {
      documentLoader,
      expectedChallenge: NONCE,
      expectedDomain: AUDIENCE,
    });
    // The format library checks proofs; comparing holder and subject is the verifier's job (oid4vp).
    expect(verified.holder).toBe(thief.did);
    expect((verified.credentials[0] as unknown as { issuer: string }).issuer).toBe(issuer.did);
    expect(((stolen.verifiableCredential as JsonObject[])[0]!.credentialSubject as JsonObject).id).toBe(
      holder.did,
    );
  });
});
