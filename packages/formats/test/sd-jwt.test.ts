import { describe, expect, it } from 'vitest';
import {
  base64UrlEncode,
  createDidJwk,
  createDidKey,
  createDidResolver,
  createTestCertificate,
  decodeSdJwt,
  didKeyVerificationMethodId,
  generateKeyPair,
  issueSdJwtVc,
  KEY_ALGORITHMS,
  presentSdJwtVc,
  signCompactJws,
  splitSdJwt,
  toPublicJwk,
  verifySdJwtVc,
  type KeyAlgorithm,
  type KeyPair,
  type VerifySdJwtVcOptions,
} from '../src/index.js';

const VCT = 'https://playground.ps02.test/vct/farmer/v1';
const AUDIENCE = 'redirect_uri:https://verifier.ps02.test/response';
const NONCE = 'n-0S6_WzA2Mj';
const claims = { given_name: 'Asha', family_name: 'Rao', birthdate: '1990-01-01', land_area_acres: 3 };

interface Fixture {
  issuerKeys: KeyPair;
  holderKeys: KeyPair;
  issuerDid: string;
  issued: string;
  options: VerifySdJwtVcOptions;
}

async function fixture(
  alg: KeyAlgorithm,
  overrides: Partial<Parameters<typeof issueSdJwtVc>[0]> = {},
): Promise<Fixture> {
  const issuerKeys = generateKeyPair(alg);
  const holderKeys = generateKeyPair(alg);
  const issuerDid = createDidKey(issuerKeys.publicJwk);
  const issued = await issueSdJwtVc({
    issuer: { keyPair: issuerKeys, kid: didKeyVerificationMethodId(issuerDid) },
    iss: issuerDid,
    vct: VCT,
    claims,
    holder: { jwk: holderKeys.publicJwk },
    expiresAt: new Date(Date.now() + 3_600_000),
    ...overrides,
  });
  return {
    issuerKeys,
    holderKeys,
    issuerDid,
    issued,
    options: {
      didResolver: createDidResolver(),
      keyBinding: { nonce: NONCE, audience: AUDIENCE },
      expectedVct: VCT,
    },
  };
}

function present(f: Fixture, extra: Partial<Parameters<typeof presentSdJwtVc>[0]> = {}): Promise<string> {
  return presentSdJwtVc({
    sdJwt: f.issued,
    disclose: ['given_name', 'birthdate'],
    holderKey: f.holderKeys,
    audience: AUDIENCE,
    nonce: NONCE,
    ...extra,
  });
}

describe.each(KEY_ALGORITHMS)('SD-JWT VC with %s', (alg) => {
  it('issue, present with a subset of claims, verify (RFC 9901 sections 7.1 and 7.3)', async () => {
    const f = await fixture(alg);
    const decodedIssued = decodeSdJwt(f.issued);
    expect(decodedIssued.header).toMatchObject({
      typ: 'dc+sd-jwt',
      alg,
      kid: didKeyVerificationMethodId(f.issuerDid),
    });
    expect(decodedIssued.payload).toMatchObject({
      iss: f.issuerDid,
      vct: VCT,
      _sd_alg: 'sha-256',
      cnf: { jwk: toPublicJwk(f.holderKeys.publicJwk) },
    });
    // SD-JWT VC draft 19 section 2.2.2.3: registered claims stay in the clear; the others are digests.
    expect(decodedIssued.payload).not.toHaveProperty('given_name');
    expect(decodedIssued.disclosures.map((d) => d.name).sort()).toEqual(Object.keys(claims).sort());
    expect(decodedIssued.payload._sd).toEqual(
      expect.arrayContaining(decodedIssued.disclosures.map((d) => d.digest)),
    );

    const presentation = await present(f);
    expect(splitSdJwt(presentation).disclosures).toHaveLength(2);
    const result = await verifySdJwtVc(presentation, f.options);
    expect(result.claims).toMatchObject({
      given_name: 'Asha',
      birthdate: '1990-01-01',
      vct: VCT,
      iss: f.issuerDid,
    });
    expect(result.claims).not.toHaveProperty('family_name');
    expect(result.disclosed.sort()).toEqual(['birthdate', 'given_name']);
    expect(result.issuerKey).toMatchObject({ source: 'did', jwk: toPublicJwk(f.issuerKeys.publicJwk) });
    expect(result.keyBinding?.header).toMatchObject({ typ: 'kb+jwt', alg });
    expect(result.keyBinding?.payload).toMatchObject({ aud: AUDIENCE, nonce: NONCE });
  });

  it('RFC 9901 section 7.3 step 5f: KB-JWT with a wrong nonce is rejected', async () => {
    const f = await fixture(alg);
    const presentation = await present(f, { nonce: 'replayed-nonce' });
    await expect(verifySdJwtVc(presentation, f.options)).rejects.toMatchObject({
      code: 'KB_JWT_NONCE_MISMATCH',
      details: { expected: NONCE, received: 'replayed-nonce' },
    });
  });

  it('RFC 9901 section 7.3 step 5f with OpenID4VP 1.0 Appendix B.3.6: KB-JWT with a wrong aud is rejected', async () => {
    const f = await fixture(alg);
    const presentation = await present(f, { audience: 'redirect_uri:https://attacker.ps02.test/response' });
    await expect(verifySdJwtVc(presentation, f.options)).rejects.toMatchObject({
      code: 'KB_JWT_AUDIENCE_MISMATCH',
    });
  });

  it('RFC 9901 section 7.1 step 5: an altered disclosure is rejected', async () => {
    const f = await fixture(alg);
    const parts = (await present(f)).split('~');
    const disclosure = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as unknown[];
    disclosure[2] = 'Mallory';
    parts[1] = base64UrlEncode(JSON.stringify(disclosure));
    await expect(verifySdJwtVc(parts.join('~'), f.options)).rejects.toMatchObject({
      code: 'SDJWT_DISCLOSURE_INVALID',
    });
  });

  it('RFC 9901 section 7.3 step 5g: removing a disclosure after key binding breaks sd_hash', async () => {
    const f = await fixture(alg);
    const parts = splitSdJwt(await present(f));
    const shortened = [parts.issuerJwt, parts.disclosures[0], parts.kbJwt].join('~');
    await expect(verifySdJwtVc(shortened, f.options)).rejects.toMatchObject({
      code: 'KB_JWT_SD_HASH_MISMATCH',
    });
  });

  it('RFC 9901 section 7.3 step 5c: a KB-JWT signed by a key other than cnf is rejected', async () => {
    const f = await fixture(alg);
    const presentation = await present(f, { holderKey: generateKeyPair(alg) });
    await expect(verifySdJwtVc(presentation, f.options)).rejects.toMatchObject({
      code: 'KB_JWT_SIGNATURE_INVALID',
    });
  });

  it('RFC 9901 section 7.1 step 2b: a changed issuer-signed payload is rejected', async () => {
    const f = await fixture(alg);
    const parts = (await present(f)).split('~');
    const [header, payload, signature] = parts[0]!.split('.');
    const changed = {
      ...(JSON.parse(Buffer.from(payload!, 'base64url').toString()) as object),
      vct: 'urn:other',
    };
    parts[0] = [header, base64UrlEncode(JSON.stringify(changed)), signature].join('.');
    await expect(verifySdJwtVc(parts.join('~'), f.options)).rejects.toMatchObject({
      code: 'SDJWT_SIGNATURE_INVALID',
    });
  });
});

describe('SD-JWT VC verification policy', () => {
  it('RFC 9901 section 7.3 step 2: key binding required but no KB-JWT is rejected', async () => {
    const f = await fixture('ES256');
    const withoutKb = await presentSdJwtVc({ sdJwt: f.issued, disclose: ['given_name'] });
    expect(withoutKb.endsWith('~')).toBe(true);
    await expect(verifySdJwtVc(withoutKb, f.options)).rejects.toMatchObject({ code: 'KB_JWT_MISSING' });
    const result = await verifySdJwtVc(withoutKb, { ...f.options, keyBinding: false });
    expect(result.keyBinding).toBeUndefined();
  });

  it('RFC 9901 section 7.3 step 5e: a KB-JWT older than the allowed window is rejected', async () => {
    const f = await fixture('EdDSA');
    const presentation = await present(f, { issuedAt: new Date(Date.now() - 3_600_000) });
    await expect(verifySdJwtVc(presentation, f.options)).rejects.toMatchObject({
      code: 'KB_JWT_IAT_OUT_OF_WINDOW',
    });
  });

  it('RFC 9901 section 7.1 step 6: an expired credential is rejected as expired', async () => {
    const f = await fixture('ES256', {
      issuedAt: new Date(Date.now() - 7_200_000),
      expiresAt: new Date(Date.now() - 3_600_000),
    });
    await expect(verifySdJwtVc(await present(f), f.options)).rejects.toMatchObject({ code: 'SDJWT_EXPIRED' });
  });

  it('RFC 9901 section 7.1 step 6: a credential used before nbf is rejected', async () => {
    const f = await fixture('ES256', { notBefore: new Date(Date.now() + 3_600_000) });
    await expect(verifySdJwtVc(await present(f), f.options)).rejects.toMatchObject({
      code: 'SDJWT_NOT_YET_VALID',
    });
  });

  it('SD-JWT VC draft 19 section 2.2.1: typ vc+sd-jwt (Inji stable) is accepted by default, other types are not', async () => {
    const legacy = await fixture('ES256', { typ: 'vc+sd-jwt' });
    await expect(verifySdJwtVc(await present(legacy), legacy.options)).resolves.toMatchObject({
      header: { typ: 'vc+sd-jwt' },
    });
    await expect(
      verifySdJwtVc(await present(legacy), { ...legacy.options, allowedTypes: ['dc+sd-jwt'] }),
    ).rejects.toMatchObject({
      code: 'SDJWT_TYP_UNEXPECTED',
    });
  });

  it('SD-JWT VC draft 19 section 2.2.2.1: a credential of another vct is rejected', async () => {
    const f = await fixture('EdDSA');
    await expect(
      verifySdJwtVc(await present(f), { ...f.options, expectedVct: 'urn:other' }),
    ).rejects.toMatchObject({
      code: 'SDJWT_VCT_MISMATCH',
    });
  });

  it('RFC 9901 section 7.1 step 2c: a kid DID that is not the iss DID is rejected', async () => {
    const other = generateKeyPair('ES256');
    const otherDid = createDidKey(other.publicJwk);
    const f = await fixture('ES256');
    const forged = await issueSdJwtVc({
      issuer: { keyPair: other, kid: didKeyVerificationMethodId(otherDid) },
      iss: f.issuerDid,
      vct: VCT,
      claims,
      holder: { jwk: f.holderKeys.publicJwk },
    });
    const presentation = await presentSdJwtVc({
      sdJwt: forged,
      disclose: 'all',
      holderKey: f.holderKeys,
      audience: AUDIENCE,
      nonce: NONCE,
    });
    await expect(verifySdJwtVc(presentation, f.options)).rejects.toMatchObject({
      code: 'SDJWT_ISSUER_MISMATCH',
    });
  });

  it('RFC 9901 section 7.1 step 2c: a DID kid with an iss that is not a DID is rejected', async () => {
    // Anyone can make a did:key; naming an issuer URL in iss must not lend the credential that issuer's name.
    const forger = generateKeyPair('ES256');
    const forgerDid = createDidKey(forger.publicJwk);
    const f = await fixture('ES256');
    const forged = await issueSdJwtVc({
      issuer: { keyPair: forger, kid: didKeyVerificationMethodId(forgerDid) },
      iss: 'https://certify.ps02.test',
      vct: VCT,
      claims,
      holder: { jwk: f.holderKeys.publicJwk },
    });
    const presentation = await presentSdJwtVc({
      sdJwt: forged,
      disclose: 'all',
      holderKey: f.holderKeys,
      audience: AUDIENCE,
      nonce: NONCE,
    });
    await expect(verifySdJwtVc(presentation, f.options)).rejects.toMatchObject({
      code: 'SDJWT_ISSUER_MISMATCH',
      details: { iss: 'https://certify.ps02.test' },
    });
  });

  it('a DID key binds the issuer: the verification names the DID, with or without iss', async () => {
    const f = await fixture('ES256');
    const verified = await verifySdJwtVc(await present(f), f.options);
    expect(verified.issuerKey).toMatchObject({ source: 'did', issuer: f.issuerDid });

    const withoutIss = await fixture('ES256', { iss: undefined });
    const verifiedWithoutIss = await verifySdJwtVc(await present(withoutIss), withoutIss.options);
    expect(verifiedWithoutIss.issuerKey.issuer).toBe(withoutIss.issuerDid);
  });

  it('RFC 9901 section 7.1 step 2a: alg "none" is never accepted', async () => {
    const f = await fixture('ES256');
    const parts = f.issued.split('~');
    const [, payload] = parts[0]!.split('.');
    parts[0] = `${base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'dc+sd-jwt' }))}.${payload}.`;
    await expect(verifySdJwtVc(parts.join('~'), { ...f.options, keyBinding: false })).rejects.toMatchObject({
      code: 'SDJWT_ALG_REJECTED',
    });
  });

  it('RFC 9901 section 7.3 step 5d: a KB-JWT without typ kb+jwt is rejected', async () => {
    const f = await fixture('EdDSA');
    const parts = splitSdJwt(await present(f));
    const kb = decodeSdJwt(await present(f)).kb!;
    const retyped = signCompactJws({ ...kb.header, typ: 'JWT' }, kb.payload, f.holderKeys);
    await expect(verifySdJwtVc(`${parts.sdJwtWithoutKb}${retyped}`, f.options)).rejects.toMatchObject({
      code: 'KB_JWT_MALFORMED',
    });
  });

  it('disclose "all" presents every selectively disclosable claim', async () => {
    const f = await fixture('ES256');
    const result = await verifySdJwtVc(await present(f, { disclose: 'all' }), f.options);
    expect(result.claims).toMatchObject(claims);
  });

  it('RFC 9901 section 4.2.6: nested disclosures are presented with disclose "all" and selected with a frame', async () => {
    const address = { street: 'MG Road', locality: 'Bengaluru', country: 'IN' };
    const f = await fixture('EdDSA', {
      claims: { ...claims, address },
      disclosureFrame: { _sd: ['given_name', 'address'], address: { _sd: ['street', 'locality'] } },
    });
    const all = await verifySdJwtVc(await present(f, { disclose: 'all' }), f.options);
    expect(all.claims.address).toEqual(address);

    const localityOnly = await verifySdJwtVc(
      await present(f, { disclose: { address: { locality: true } } }),
      f.options,
    );
    expect(localityOnly.claims.address).toEqual({ locality: 'Bengaluru', country: 'IN' });
    expect(localityOnly.claims).not.toHaveProperty('given_name');
  });

  it('RFC 7800 section 3.4: holder key referenced by cnf.kid (a did:jwk) is resolved for key binding', async () => {
    const holderKeys = generateKeyPair('EdDSA');
    const holderDid = createDidJwk(holderKeys.publicJwk);
    const f = await fixture('EdDSA', { holder: { kid: `${holderDid}#0` } });
    const presentation = await presentSdJwtVc({
      sdJwt: f.issued,
      disclose: ['given_name'],
      holderKey: holderKeys,
      audience: AUDIENCE,
      nonce: NONCE,
    });
    const result = await verifySdJwtVc(presentation, f.options);
    expect(result.keyBinding?.holderJwk).toEqual(toPublicJwk(holderKeys.publicJwk));
  });

  it('issuer key from JWT VC Issuer Metadata keys (SD-JWT VC draft 19 section 4) when the JWT has a plain kid', async () => {
    const issuerKeys = generateKeyPair('ES256');
    const holderKeys = generateKeyPair('ES256');
    const issued = await issueSdJwtVc({
      issuer: { keyPair: issuerKeys, kid: 'key-1' },
      iss: 'https://issuer.ps02.test',
      vct: VCT,
      claims,
      holder: { jwk: holderKeys.publicJwk },
    });
    const presentation = await presentSdJwtVc({
      sdJwt: issued,
      disclose: 'all',
      holderKey: holderKeys,
      audience: AUDIENCE,
      nonce: NONCE,
    });
    const options: VerifySdJwtVcOptions = { keyBinding: { nonce: NONCE, audience: AUDIENCE } };
    await expect(verifySdJwtVc(presentation, options)).rejects.toMatchObject({
      code: 'SDJWT_ISSUER_KEY_UNRESOLVED',
    });
    const result = await verifySdJwtVc(presentation, {
      ...options,
      issuerKeys: [{ ...issuerKeys.publicJwk, kid: 'key-1' }],
    });
    expect(result.issuerKey).toMatchObject({ source: 'configured', kid: 'key-1' });
  });

  it('RFC 9901 section 7.1 step 2c: a configured key cannot speak for a DID iss', async () => {
    const issuerKeys = generateKeyPair('ES256');
    const holderKeys = generateKeyPair('ES256');
    const issued = await issueSdJwtVc({
      issuer: { keyPair: issuerKeys, kid: 'key-1' },
      iss: 'did:web:certify.ps02.test',
      vct: VCT,
      claims,
      holder: { jwk: holderKeys.publicJwk },
    });
    const presentation = await presentSdJwtVc({
      sdJwt: issued,
      disclose: 'all',
      holderKey: holderKeys,
      audience: AUDIENCE,
      nonce: NONCE,
    });
    await expect(
      verifySdJwtVc(presentation, {
        keyBinding: { nonce: NONCE, audience: AUDIENCE },
        issuerKeys: [{ ...issuerKeys.publicJwk, kid: 'key-1' }],
      }),
    ).rejects.toMatchObject({ code: 'SDJWT_ISSUER_MISMATCH' });
  });
});

describe('SD-JWT VC with an x5c issuer key (SD-JWT VC draft 19 section 2.5)', () => {
  it.each(KEY_ALGORITHMS)(
    '%s: chain to a trust anchor verifies; without the anchor it is refused when trust is required',
    async (alg) => {
      const caKeys = generateKeyPair(alg);
      const ca = await createTestCertificate({ subject: 'CN=Playground Test CA', keyPair: caKeys, ca: true });
      const issuerKeys = generateKeyPair(alg);
      const leaf = await createTestCertificate({
        subject: 'CN=Reference Issuer',
        keyPair: issuerKeys,
        issuer: { keyPair: caKeys, certificate: ca },
      });
      const holderKeys = generateKeyPair(alg);
      const issued = await issueSdJwtVc({
        issuer: { keyPair: issuerKeys, x5c: [leaf.x5c, ca.x5c] },
        iss: 'https://issuer.ps02.test',
        vct: VCT,
        claims,
        holder: { jwk: holderKeys.publicJwk },
      });
      const presentation = await presentSdJwtVc({
        sdJwt: issued,
        disclose: ['family_name'],
        holderKey: holderKeys,
        audience: AUDIENCE,
        nonce: NONCE,
      });
      const keyBinding = { nonce: NONCE, audience: AUDIENCE };

      const trusted = await verifySdJwtVc(presentation, {
        keyBinding,
        x5c: { trustAnchors: [ca.x5c], requireTrusted: true },
      });
      expect(trusted.issuerKey).toMatchObject({ source: 'x5c', trusted: true });
      await expect(
        verifySdJwtVc(presentation, { keyBinding, x5c: { requireTrusted: true } }),
      ).rejects.toMatchObject({
        code: 'X5C_UNTRUSTED',
      });
    },
  );
});

describe('an x5c key names no DID issuer (RFC 9901 section 7.1 step 2c)', () => {
  async function anchoredX5c(iss: string) {
    const caKeys = generateKeyPair('ES256');
    const ca = await createTestCertificate({ subject: 'CN=Anchored CA', keyPair: caKeys, ca: true });
    const issuerKeys = generateKeyPair('ES256');
    const leaf = await createTestCertificate({
      subject: 'CN=Anchored Issuer',
      keyPair: issuerKeys,
      issuer: { keyPair: caKeys, certificate: ca },
    });
    const holderKeys = generateKeyPair('ES256');
    const issued = await issueSdJwtVc({
      issuer: { keyPair: issuerKeys, x5c: [leaf.x5c, ca.x5c] },
      iss,
      vct: VCT,
      claims,
      holder: { jwk: holderKeys.publicJwk },
    });
    const presentation = await presentSdJwtVc({
      sdJwt: issued,
      disclose: 'all',
      holderKey: holderKeys,
      audience: AUDIENCE,
      nonce: NONCE,
    });
    return verifySdJwtVc(presentation, {
      keyBinding: { nonce: NONCE, audience: AUDIENCE },
      x5c: { trustAnchors: [ca.x5c], requireTrusted: true },
    });
  }

  it('an anchored chain with a DID iss is refused, so it cannot pose as a trusted DID issuer', async () => {
    await expect(anchoredX5c('did:web:certify.ps02.test')).rejects.toMatchObject({
      code: 'SDJWT_ISSUER_MISMATCH',
    });
  });

  it('an anchored chain with an issuer URL in iss (Inji Certify) still verifies', async () => {
    const verified = await anchoredX5c('http://certify-nginx:80');
    expect(verified.issuerKey).toMatchObject({ source: 'x5c', issuer: 'http://certify-nginx:80' });
  });
});
