import { describe, expect, it } from 'vitest';
import { parseRequestUri } from '../src/index.js';

describe('parseRequestUri', () => {
  it('returns the decoded query parameters of an openid4vp:// URI', () => {
    const uri =
      'openid4vp://authorize?client_id=https%3A%2F%2Fverify.ps02.test&request_uri=https%3A%2F%2Fverify.ps02.test%2Fv1%2Fverify%2Fvp-request%2Freq_1';
    expect(parseRequestUri(uri)).toEqual({
      client_id: 'https://verify.ps02.test',
      request_uri: 'https://verify.ps02.test/v1/verify/vp-request/req_1',
    });
  });

  it('rejects another scheme', () => {
    expect(() => parseRequestUri('https://verify.ps02.test/?x=1')).toThrow(/not an OpenID4VP request URI/);
  });
});

describe('oid4vp dependencies', () => {
  it('loads dcql and jsonpath-plus as ESM', async () => {
    const dcql = await import('dcql');
    const jsonpath = await import('jsonpath-plus');
    expect(dcql.DcqlQuery).toBeDefined();
    expect(jsonpath.JSONPath({ path: '$.a', json: { a: 1 }, wrap: false })).toBe(1);
  });
});
