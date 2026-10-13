/**
 * The reference verifier's `status` check: a revoked credential is INVALID, an unrevoked one VALID with
 * the list named, and the lists come from the issuer through the verifier's own fetch (no network).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CREDENTIALS_V1_URL,
  PLAYGROUND_CONTEXT_V1_URL,
  encodeBitstringStatusList,
  encodeTokenStatusList,
  base64UrlEncode,
  createTestCertificate,
  generateKeyPair,
  issueLdpVc,
  issueSdJwtVc,
  sha256,
  signCompactJws,
  signStatusListToken,
  toPublicJwk,
  type FetchLike,
} from '@inji-playground/formats';
import {
  FARMER_VCT,
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

const TOKEN_URL = 'https://issuer.example/status/token';
const BITSTRING_URL = 'https://issuer.example/status/bitstring';
const REVOKED = 1;

/** The issuer's lists: entry 1 revoked in both. */
async function issuerLists(): Promise<FetchLike> {
  const token = signStatusListToken({
    uri: TOKEN_URL,
    lst: encodeTokenStatusList([0, 1]),
    bits: 1,
    keyPair: issuer.keyPair,
    kid: issuer.verificationMethod,
  });
  const bitstring = await issueLdpVc({
    credential: {
      '@context': [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
      id: BITSTRING_URL,
      type: ['VerifiableCredential', 'BitstringStatusListCredential'],
      issuer: issuer.did,
      issuanceDate: new Date(Date.now() - 60_000).toISOString(),
      credentialSubject: {
        id: `${BITSTRING_URL}#list`,
        type: 'BitstringStatusList',
        statusPurpose: 'revocation',
        encodedList: encodeBitstringStatusList([REVOKED]),
      },
    },
    suite: 'Ed25519Signature2020',
    key: { keyPair: issuer.keyPair, verificationMethod: issuer.verificationMethod },
    documentLoader,
  });
  const bodies: Record<string, string> = { [TOKEN_URL]: token, [BITSTRING_URL]: JSON.stringify(bitstring) };
  return (url) => {
    const body = bodies[url];
    return Promise.resolve({
      ok: body !== undefined,
      status: body ? 200 : 404,
      text: () => Promise.resolve(body ?? ''),
    });
  };
}

const bitstringEntry = (index: number) => ({
  id: `${BITSTRING_URL}#${index}`,
  type: 'BitstringStatusListEntry',
  statusPurpose: 'revocation',
  statusListIndex: String(index),
  statusListCredential: BITSTRING_URL,
});

describe.each(['ldp_vc', 'vc+sd-jwt'] as const)('status of a presented %s', (format) => {
  const credential = (idx: number) =>
    format === 'ldp_vc'
      ? farmerLdpVc({ credentialStatus: bitstringEntry(idx) })
      : farmerSdJwtVc({ status: { status_list: { idx, uri: TOKEN_URL } } });

  async function present(idx: number) {
    const { verifier, wallet } = harness(
      {},
      { fetchLimits: { fetch: await issuerLists(), lookup: () => Promise.resolve(['93.184.216.34']) } },
    );
    const created = verifier.createRequest({ profile: 'final-1.0', format });
    await wallet.respond(created.uri, [await credential(idx)]);
    return verifier.awaitResult(created.handle);
  }

  it('an unrevoked credential is VALID, with the list it was checked against', async () => {
    const report = await present(0);
    expect(report.outcome).toBe('VALID');
    expect(report.checks.find((check) => check.id === 'status')).toMatchObject({
      status: 'pass',
      detail: expect.stringMatching(/^valid \((Token|Bitstring) Status List/),
    });
    expect(report.warnings).toEqual([]);
  });

  it('a revoked credential is INVALID (STATUS_REVOKED)', async () => {
    const report = await present(REVOKED);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('STATUS_REVOKED');
    expect(report.checks.find((check) => check.id === 'status')?.status).toBe('fail');
  });
});

describe('status entries a verifier refuses before fetching anything', () => {
  async function present(credential: Awaited<ReturnType<typeof farmerLdpVc>>) {
    const { verifier, wallet } = harness(
      {},
      { fetchLimits: { fetch: await issuerLists(), lookup: () => Promise.resolve(['93.184.216.34']) } },
    );
    const created = verifier.createRequest({ profile: 'final-1.0', format: credential.format as 'ldp_vc' });
    await wallet.respond(created.uri, [credential]);
    return verifier.awaitResult(created.handle);
  }

  it('a status list uri that is not a URL fails the status check, not the format check', async () => {
    const report = await present(
      await farmerSdJwtVc({ status: { status_list: { idx: 0, uri: 'not a url' } } }),
    );
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('STATUS_LIST_UNAVAILABLE');
    expect(report.checks.find((check) => check.id === 'status')?.status).toBe('fail');
  });

  it('more than 8 status entries in one presentation -> INVALID', async () => {
    const report = await present(
      await farmerLdpVc({ credentialStatus: Array.from({ length: 9 }, (_, index) => bitstringEntry(index)) }),
    );
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.message).toMatch(/9 status entries, more than 8/);
  });

  it('a status claim issued as a disclosure (so a holder could leave it out) -> INVALID', async () => {
    // The SD-JWT library refuses to issue this, so the issuer-signed JWT is built by hand.
    const disclosure = base64UrlEncode(
      JSON.stringify(['c2FsdA', 'status', { status_list: { idx: REVOKED, uri: TOKEN_URL } }]),
    );
    const jwt = signCompactJws(
      { typ: 'vc+sd-jwt', kid: issuer.verificationMethod },
      {
        iss: issuer.did,
        iat: Math.floor(Date.now() / 1000),
        vct: FARMER_VCT,
        given_name: 'Asha',
        cnf: { jwk: toPublicJwk(holder.keyPair.publicJwk) },
        _sd: [base64UrlEncode(sha256(disclosure))],
        _sd_alg: 'sha-256',
      },
      issuer.keyPair,
    );
    const raw = `${jwt}~${disclosure}~`;
    const report = await present({ id: 'disclosable-status', format: 'vc+sd-jwt', raw });
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.message).toMatch(/selectively disclosable/);
  });

  it.each([
    ['presented', true],
    ['withheld', false],
  ])(
    'a status_list issued as a nested disclosure, %s by the holder -> INVALID before any fetch',
    async (_, presented) => {
      const disclosure = base64UrlEncode(
        JSON.stringify(['c2FsdA', 'status_list', { idx: REVOKED, uri: TOKEN_URL }]),
      );
      const jwt = signCompactJws(
        { typ: 'vc+sd-jwt', kid: issuer.verificationMethod },
        {
          iss: issuer.did,
          iat: Math.floor(Date.now() / 1000),
          vct: FARMER_VCT,
          given_name: 'Asha',
          cnf: { jwk: toPublicJwk(holder.keyPair.publicJwk) },
          status: { _sd: [base64UrlEncode(sha256(disclosure))] },
          _sd_alg: 'sha-256',
        },
        issuer.keyPair,
      );
      const raw = presented ? `${jwt}~${disclosure}~` : `${jwt}~`;
      const report = await present({ id: 'nested-disclosable-status', format: 'vc+sd-jwt', raw });
      expect(report.outcome).toBe('INVALID');
      expect(report.errors[0]).toMatchObject({ code: 'STATUS_LIST_INVALID' });
      expect(report.errors[0]?.message).toMatch(/selectively disclosable/);
    },
  );
});

describe('status of an SD-JWT VC whose issuer key comes from x5c', () => {
  it('is reported as not checked, never as passed or revoked', async () => {
    const keyPair = generateKeyPair('ES256');
    const certificate = await createTestCertificate({ subject: 'CN=x5c issuer', keyPair });
    const raw = await issueSdJwtVc({
      issuer: { keyPair, x5c: [certificate.x5c] },
      iss: 'https://issuer.example',
      typ: 'vc+sd-jwt',
      vct: FARMER_VCT,
      claims: { given_name: 'Asha' },
      status: { status_list: { idx: REVOKED, uri: TOKEN_URL } },
      holder: { jwk: holder.keyPair.publicJwk },
    });
    const { verifier, wallet } = harness(
      {},
      { x5cTrustAnchors: [certificate.pem], fetchLimits: { fetch: await issuerLists() } },
    );
    const created = verifier.createRequest({ profile: 'final-1.0', format: 'vc+sd-jwt' });
    await wallet.respond(created.uri, [{ id: 'x5c', format: 'vc+sd-jwt', raw }]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('VALID');
    expect(report.checks.find((check) => check.id === 'status')).toMatchObject({
      status: 'skipped',
      detail: expect.stringContaining('x5c'),
    });
  });
});
