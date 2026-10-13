/**
 * Credential status: Token Status List (SD-JWT VC) and Bitstring Status List (ldp_vc), read from lists
 * served by a fake HTTP client.
 */
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIALS_V1_URL,
  PLAYGROUND_CONTEXT_V1_URL,
  base64UrlDecode,
  bitstringStatusAt,
  checkStatusEntry,
  createDidKey,
  createDidResolver,
  createDocumentLoader,
  didKeyVerificationMethodId,
  encodeBitstringStatusList,
  encodeTokenStatusList,
  generateKeyPair,
  issueLdpVc,
  signStatusListToken,
  statusEntriesOf,
  tokenStatusAt,
  type StatusCheckOptions,
} from '../src/index.js';
import { fakeWeb } from './helpers.js';

const didResolver = createDidResolver();
const documentLoader = createDocumentLoader({ didResolver });
const issuerKey = generateKeyPair('EdDSA');
const issuer = createDidKey(issuerKey.publicJwk);
const kid = didKeyVerificationMethodId(issuer);
const LIST_URL = 'https://issuer.example/status/1';
const publicLookup = () => Promise.resolve(['93.184.216.34']);

describe('Token Status List encoding', () => {
  it('reads the 1-bit example of draft-ietf-oauth-status-list-21 section 4.1', () => {
    // Statuses 1,0,0,1,1,1,0,1 | 1,1,0,0,0,1,0,1 -> bytes 0xB9 0xA3.
    const lst = 'eNrbuRgAAhcBXQ';
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((idx) => tokenStatusAt(lst, 1, idx))).toEqual([
      1, 0, 0, 1, 1, 1, 0, 1,
    ]);
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((idx) => tokenStatusAt(lst, 1, idx))).toEqual([
      1, 1, 0, 0, 0, 1, 0, 1,
    ]);
    expect(() => tokenStatusAt(lst, 1, 16)).toThrow(expect.objectContaining({ code: 'STATUS_LIST_INVALID' }));
  });

  it('round-trips 2-bit statuses', () => {
    const statuses = [0, 1, 2, 0, 3, 0, 0, 2, 1];
    const lst = encodeTokenStatusList(statuses, 2);
    expect(statuses.map((_, idx) => tokenStatusAt(lst, 2, idx))).toEqual(statuses);
  });
});

describe('Bitstring Status List encoding', () => {
  it('index 0 is the left-most bit, and the list has at least 131,072 entries', () => {
    const encoded = encodeBitstringStatusList([0, 5, 131_071]);
    expect(encoded.startsWith('u')).toBe(true);
    const bytes = gunzipSync(base64UrlDecode(encoded.slice(1)));
    expect(bytes.length).toBe(16_384);
    expect(bytes[0]).toBe(0b1000_0100);
    expect(bitstringStatusAt(encoded, 5)).toBe(true);
    expect(bitstringStatusAt(encoded, 6)).toBe(false);
    expect(bitstringStatusAt(encoded, 131_071)).toBe(true);
    expect(() => encodeBitstringStatusList([131_072])).toThrow(RangeError);
    expect(() => bitstringStatusAt(encodeBitstringStatusList([], 8), 0)).toThrow(/fewer than 131072 entries/);
  });
});

describe('status entries of a credential', () => {
  it('finds a Token Status List reference, a BitstringStatusListEntry, and names an unsupported type', () => {
    expect(statusEntriesOf({ status: { status_list: { idx: 3, uri: LIST_URL } } }, 'sd-jwt')).toEqual([
      { kind: 'token-status-list', uri: LIST_URL, idx: 3 },
    ]);
    expect(
      statusEntriesOf(
        {
          credentialStatus: {
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListIndex: '42',
            statusListCredential: LIST_URL,
          },
        },
        'ldp',
      ),
    ).toEqual([
      { kind: 'bitstring', statusListCredential: LIST_URL, statusListIndex: 42, statusPurpose: 'revocation' },
    ]);
    expect(statusEntriesOf({ credentialStatus: { type: 'StatusList2021Entry' } }, 'ldp')).toEqual([
      { kind: 'unsupported', type: 'StatusList2021Entry' },
    ]);
    expect(statusEntriesOf({ credentialSubject: {} }, 'ldp')).toEqual([]);
    // Each format reads only its own field: an ldp_vc claim called status is not a Token Status List.
    expect(statusEntriesOf({ status: { status_list: { idx: 3, uri: LIST_URL } } }, 'ldp')).toEqual([]);
    const entry = {
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListCredential: LIST_URL,
    };
    expect(() => statusEntriesOf({ credentialStatus: { ...entry, statusListIndex: null } }, 'ldp')).toThrow(
      /malformed/,
    );
    expect(
      statusEntriesOf({ credentialStatus: { ...entry, statusListIndex: '1', statusSize: 2 } }, 'ldp'),
    ).toEqual([{ kind: 'unsupported', type: 'BitstringStatusListEntry with status messages' }]);
  });

  it('SD-JWT VC: an empty status names no entry; a malformed status_list is refused, not called unsupported', () => {
    expect(statusEntriesOf({ status: {} }, 'sd-jwt')).toEqual([]);
    expect(statusEntriesOf({ status: { other_mechanism: {} } }, 'sd-jwt')).toEqual([
      { kind: 'unsupported', type: 'other_mechanism' },
    ]);
    expect(() => statusEntriesOf({ status: { status_list: { uri: LIST_URL } } }, 'sd-jwt')).toThrow(
      /status_list needs idx and uri/,
    );
  });
});

describe('Token Status List check', () => {
  const statuses = [0, 1, 2];
  const options = (web: ReturnType<typeof fakeWeb>): StatusCheckOptions => ({
    issuer,
    didResolver,
    documentLoader,
    fetch: web.fetch,
    lookup: publicLookup,
  });
  const served = (token: string) => {
    const web = fakeWeb();
    web.serve(LIST_URL, token);
    return web;
  };
  const token = (overrides: Partial<Parameters<typeof signStatusListToken>[0]> = {}) =>
    signStatusListToken({
      uri: LIST_URL,
      lst: encodeTokenStatusList(statuses, 2),
      bits: 2,
      keyPair: issuerKey,
      kid,
      ...overrides,
    });
  const entry = (idx: number) => ({ kind: 'token-status-list' as const, uri: LIST_URL, idx });

  it('valid, revoked and suspended entries', async () => {
    const web = served(token());
    await expect(checkStatusEntry(entry(0), options(web))).resolves.toMatch(/valid/);
    await expect(checkStatusEntry(entry(1), options(web))).rejects.toMatchObject({ code: 'STATUS_REVOKED' });
    await expect(checkStatusEntry(entry(2), options(web))).rejects.toMatchObject({
      code: 'STATUS_SUSPENDED',
    });
  });

  it('refuses a list signed by someone other than the credential issuer, or made for another uri', async () => {
    const forger = generateKeyPair('EdDSA');
    const forgerDid = createDidKey(forger.publicJwk);
    const forged = served(token({ keyPair: forger, kid: didKeyVerificationMethodId(forgerDid) }));
    await expect(checkStatusEntry(entry(0), options(forged))).rejects.toMatchObject({
      code: 'STATUS_LIST_INVALID',
      message: expect.stringContaining('not signed by a key of the credential issuer'),
    });
    const wrongKey = served(token({ keyPair: forger }));
    await expect(checkStatusEntry(entry(0), options(wrongKey))).rejects.toMatchObject({
      message: expect.stringContaining('signature is invalid'),
    });
    const elsewhere = served(token({ uri: 'https://issuer.example/status/2' }));
    await expect(checkStatusEntry(entry(0), options(elsewhere))).rejects.toMatchObject({
      message: expect.stringContaining('sub'),
    });
  });

  it('does not fetch a list on a private address', async () => {
    const web = served(token());
    await expect(
      checkStatusEntry({ kind: 'token-status-list', uri: 'http://10.0.0.8/status', idx: 0 }, options(web)),
    ).rejects.toMatchObject({ code: 'STATUS_LIST_UNAVAILABLE' });
    expect(web.requests).toEqual([]);
  });
});

describe('Bitstring Status List check', () => {
  const listCredential = (signer = { keyPair: issuerKey, did: issuer }, purpose = 'revocation') =>
    issueLdpVc({
      credential: {
        '@context': [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
        id: LIST_URL,
        type: ['VerifiableCredential', 'BitstringStatusListCredential'],
        issuer: signer.did,
        issuanceDate: new Date(Date.now() - 60_000).toISOString(),
        credentialSubject: {
          id: `${LIST_URL}#list`,
          type: 'BitstringStatusList',
          statusPurpose: purpose,
          encodedList: encodeBitstringStatusList([7]),
        },
      },
      suite: 'Ed25519Signature2020',
      key: { keyPair: signer.keyPair, verificationMethod: didKeyVerificationMethodId(signer.did) },
      documentLoader,
    });
  const check = async (index: number, list: Record<string, unknown>) => {
    const web = fakeWeb();
    web.serve(LIST_URL, list);
    return checkStatusEntry(
      {
        kind: 'bitstring',
        statusListCredential: LIST_URL,
        statusListIndex: index,
        statusPurpose: 'revocation',
      },
      { issuer, didResolver, documentLoader, fetch: web.fetch, lookup: publicLookup },
    );
  };

  it('a clear bit is valid, a set bit is revoked', async () => {
    const list = await listCredential();
    await expect(check(6, list)).resolves.toMatch(/valid/);
    await expect(check(7, list)).rejects.toMatchObject({ code: 'STATUS_REVOKED' });
  });

  it('refuses a list from another issuer, for another purpose, or with a broken proof', async () => {
    const other = generateKeyPair('EdDSA');
    await expect(
      check(6, await listCredential({ keyPair: other, did: createDidKey(other.publicJwk) })),
    ).rejects.toMatchObject({
      code: 'STATUS_LIST_INVALID',
      message: expect.stringContaining('not by the credential issuer'),
    });
    await expect(check(6, await listCredential(undefined, 'suspension'))).rejects.toMatchObject({
      message: expect.stringContaining('the list is for suspension'),
    });
    const tampered = await listCredential();
    (tampered.credentialSubject as { encodedList: string }).encodedList = encodeBitstringStatusList([]);
    await expect(check(7, tampered)).rejects.toMatchObject({
      message: expect.stringContaining('does not verify'),
    });
  });
});
