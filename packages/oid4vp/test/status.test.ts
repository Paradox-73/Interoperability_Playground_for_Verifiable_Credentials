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
  issueLdpVc,
  signStatusListToken,
  type FetchLike,
} from '@inji-playground/formats';
import { documentLoader, farmerLdpVc, farmerSdJwtVc, harness, issuer } from './helpers.js';

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
