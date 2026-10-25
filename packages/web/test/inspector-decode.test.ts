// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { describe, expect, it } from 'vitest';
import {
  base64UrlToText,
  collectSdDigests,
  decodeDisclosure,
  decodeJwt,
  decodeSdJwt,
  disclosureDigest,
  parseForm,
  tryParseJson,
} from '../src/inspector/decode';
import {
  BIRTH_YEAR,
  CREDENTIAL,
  digest,
  FORGED,
  GIVEN_NAME,
  ISSUER_JWT,
  KB_JWT,
  PRESENTATION,
  REQUEST_OBJECT,
} from './fixtures/decodable-run';

describe('decodeJwt (RFC 7515 section 7.1 compact serialization)', () => {
  it('decodes header and payload and keeps the signature as sent', () => {
    const jwt = decodeJwt(REQUEST_OBJECT)!;
    expect(jwt.header).toMatchObject({ alg: 'ES256', typ: 'oauth-authz-req+jwt' });
    expect(jwt.payload).toMatchObject({ nonce: 'synthetic-vp-nonce', response_mode: 'direct_post' });
    expect(jwt.signature).toBe(REQUEST_OBJECT.split('.')[2]);
    expect(jwt.signingInput).toBe(REQUEST_OBJECT.split('.').slice(0, 2).join('.'));
  });

  it('rejects placeholders and text that only looks like a JWT', () => {
    expect(decodeJwt('SYNTHETIC.PROOF.JWT')).toBeUndefined();
    expect(decodeJwt('a.b')).toBeUndefined();
    expect(decodeJwt('not a jwt')).toBeUndefined();
    // Valid base64url JSON but no `alg`: not a JOSE header.
    const noAlg = `${Buffer.from('{"typ":"JWT"}').toString('base64url')}.e30.`;
    expect(decodeJwt(noAlg)).toBeUndefined();
  });

  it('keeps a payload that is not JSON as text', () => {
    const header = Buffer.from('{"alg":"none"}').toString('base64url');
    const jwt = decodeJwt(`${header}.${Buffer.from('hello').toString('base64url')}.`)!;
    expect(jwt.payload).toBe('hello');
    expect(jwt.signature).toBe('');
  });
});

describe('decodeSdJwt (RFC 9901 SD-JWT)', () => {
  it('splits an issued SD-JWT into the issuer JWT and its disclosures, without a key-binding JWT', () => {
    const sdJwt = decodeSdJwt(CREDENTIAL)!;
    expect(sdJwt.issuerJwt.raw).toBe(ISSUER_JWT);
    expect(sdJwt.disclosures.map((d) => [d.salt, d.name, d.value])).toEqual([
      ['salt-given-name', 'given_name', 'Asha'],
      ['salt-birth-year', 'birth_year', 1990],
    ]);
    expect(sdJwt.hasKeyBinding).toBe(false);
    expect(sdJwt.keyBinding).toBeUndefined();
  });

  it('section 4.3: reads the key-binding JWT at the end of a presentation', () => {
    const sdJwt = decodeSdJwt(PRESENTATION)!;
    expect(sdJwt.disclosures).toHaveLength(1);
    expect(sdJwt.keyBinding?.raw).toBe(KB_JWT);
    expect(sdJwt.keyBinding?.decoded.header).toMatchObject({ typ: 'kb+jwt' });
    expect(sdJwt.keyBinding?.decoded.payload).toMatchObject({ nonce: 'synthetic-vp-nonce' });
  });

  it('keeps parts that are not disclosures instead of hiding them', () => {
    const sdJwt = decodeSdJwt(`${ISSUER_JWT}~@@@~${GIVEN_NAME}~`)!;
    expect(sdJwt.invalidDisclosures).toEqual(['@@@']);
    expect(sdJwt.disclosures).toHaveLength(1);
  });

  it('accepts a serialization whose trailing ~ was dropped', () => {
    const sdJwt = decodeSdJwt(`${ISSUER_JWT}~${GIVEN_NAME}`)!;
    expect(sdJwt.disclosures.map((d) => d.name)).toEqual(['given_name']);
    expect(sdJwt.hasKeyBinding).toBe(false);
  });

  it('is not fooled by a plain JWT or by text with a tilde', () => {
    expect(decodeSdJwt(ISSUER_JWT)).toBeUndefined();
    expect(decodeSdJwt('SYNTHETIC~x~')).toBeUndefined();
  });

  it('section 4.2.2: decodes array-element disclosures [salt, value]', () => {
    const encoded = Buffer.from('["s","FR"]').toString('base64url');
    expect(decodeDisclosure(encoded)).toEqual({ encoded, salt: 's', value: 'FR' });
  });
});

describe('disclosure digests (RFC 9901 section 4.2.3)', () => {
  it('computes the same digest the issuer lists in _sd', async () => {
    expect(await disclosureDigest(GIVEN_NAME)).toBe(digest(GIVEN_NAME));
    const listed = collectSdDigests(decodeJwt(ISSUER_JWT)!.payload);
    expect(listed.has(digest(GIVEN_NAME))).toBe(true);
    expect(listed.has(digest(BIRTH_YEAR))).toBe(true);
    expect(listed.has(digest(FORGED))).toBe(false);
  });

  it('collects digests of array elements written as {"...": digest}', () => {
    const digests = collectSdDigests({ nationalities: [{ '...': 'd1' }, 'plain'], nested: { _sd: ['d2'] } });
    expect([...digests].sort()).toEqual(['d1', 'd2']);
  });

  it('answers undefined for an unsupported _sd_alg instead of guessing', async () => {
    expect(await disclosureDigest(GIVEN_NAME, 'md5')).toBeUndefined();
  });
});

describe('helpers', () => {
  it('decodes base64url with and without padding and rejects other alphabets', () => {
    expect(base64UrlToText('aGk')).toBe('hi');
    expect(base64UrlToText('aGk=')).toBe('hi');
    expect(base64UrlToText('a+b/')).toBeUndefined();
  });

  it('parses form bodies and JSON without throwing', () => {
    expect(parseForm('a=1&b=x%20y')).toEqual([
      ['a', '1'],
      ['b', 'x y'],
    ]);
    expect(parseForm('{"a":1}')).toBeUndefined();
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson('{broken')).toBeUndefined();
    expect(tryParseJson('eyJ...')).toBeUndefined();
  });
});
