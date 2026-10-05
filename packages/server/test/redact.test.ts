/**
 * Redaction rules for exports: which values are secrets (tokens, codes, cookies, private keys) and
 * which are evidence that must survive (credentials, presentations, nonces, error codes).
 */
import { describe, expect, it } from 'vitest';
import { Redactor, redactExchange } from '../src/reports/redact.js';
import { tokenExchange } from './run-fixtures.js';

const MASK = /^\[redacted sha256:[0-9a-f]{8}\]$/;

describe('Redactor', () => {
  it('masks secret JSON members and private JWK members, keeping public ones', () => {
    const redactor = new Redactor();
    const out = redactor.json({
      access_token: 'a',
      refresh_token: 'r',
      'pre-authorized_code': 'p',
      tx_code: { length: 4 },
      code: 'invalid_proof',
      error: 'invalid_grant',
      c_nonce: 'n',
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'public-x', d: 'private-d' },
      nested: [{ client_secret: 's' }],
    }) as Record<string, unknown>;
    expect(out.access_token).toMatch(MASK);
    expect(out.refresh_token).toMatch(MASK);
    expect(out['pre-authorized_code']).toMatch(MASK);
    expect(out.tx_code).toMatch(MASK);
    // In JSON, `code` is an error code far more often than an authorization code.
    expect(out.code).toBe('invalid_proof');
    expect(out.error).toBe('invalid_grant');
    expect(out.c_nonce).toBe('n');
    expect(out.jwk).toEqual({ kty: 'OKP', crv: 'Ed25519', x: 'public-x', d: expect.stringMatching(MASK) });
    expect((out.nested as Array<Record<string, unknown>>)[0]?.client_secret).toMatch(MASK);
    expect(redactor.count).toBe(6);
  });

  it('gives equal secrets equal placeholders and does not mask a placeholder twice', () => {
    const redactor = new Redactor();
    const first = redactor.mask('same');
    expect(redactor.mask('same')).toBe(first);
    expect(redactor.mask(first)).toBe(first);
    expect(redactor.mask('other')).not.toBe(first);
  });

  it('masks secret parameters of forms and URLs, including JSON carried in a parameter', () => {
    const redactor = new Redactor();
    expect(redactor.form('grant_type=authorization_code&code=XYZ&redirect_uri=https%3A%2F%2Fw')).toMatch(
      /^grant_type=authorization_code&code=%5Bredacted%20sha256%3A[0-9a-f]{8}%5D&redirect_uri=https%3A%2F%2Fw$/,
    );
    const offer = `openid-credential-offer://?credential_offer=${encodeURIComponent(
      JSON.stringify({ credential_issuer: 'https://i', grants: { x: { 'pre-authorized_code': 'SECRET' } } }),
    )}`;
    const redacted = redactor.text(offer);
    expect(redacted).not.toContain('SECRET');
    expect(decodeURIComponent(redacted)).toContain('"credential_issuer":"https://i"');
    expect(redactor.url('https://w/cb?state=s1#code=C1&state=s1')).toMatch(
      /^https:\/\/w\/cb\?state=s1#code=%5Bredacted/,
    );
    expect(redactor.url('https://verifier/request?client_id=x')).toBe('https://verifier/request?client_id=x');
  });

  it('masks name=value pairs and bearer tokens inside free text', () => {
    const redactor = new Redactor();
    const out = redactor.text(
      'upstream said: Bearer abc.def.ghi rejected; retry with access_token=xyz, error_code=E1',
    );
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('xyz');
    expect(out).toContain('error_code=E1');
  });

  it('keeps the formatting of JSON bodies that hold no secret', () => {
    const body = '{\n  "credential_issuer": "https://i"\n}';
    expect(new Redactor().text(body)).toBe(body);
  });

  it('redacts an exchange: secret headers keep their scheme, form and JSON bodies are masked, base64 is left alone', () => {
    const exchange = tokenExchange('r', 1, {
      request: {
        method: 'POST',
        url: 'https://as/token',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: 'Basic dXNlcjpwYXNz',
          dpop: 'eyJ.proof.jwt',
          'x-xsrf-token': 'efdc009a-csrf',
        },
        body: 'grant_type=x&pre-authorized_code=P1',
      },
    });
    const out = redactExchange(exchange);
    expect(out.redacted).toBe(true);
    expect(out.request.headers.authorization).toMatch(/^Basic \[redacted sha256:/);
    expect(out.request.headers.dpop).toMatch(MASK);
    expect(out.request.headers['x-xsrf-token']).toMatch(MASK);
    expect(out.request.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(out.request.body).toMatch(/^grant_type=x&pre-authorized_code=%5Bredacted/);
    expect(out.response?.headers['set-cookie']).toMatch(MASK);
    expect(JSON.parse(out.response?.body ?? '{}')).toMatchObject({
      token_type: 'Bearer',
      c_nonce: 'nonce-1',
    });
    // The stored exchange is not changed.
    expect(exchange.request.body).toContain('P1');

    const binary = redactExchange(
      tokenExchange('r', 2, {
        response: { status: 200, headers: {}, body: 'YWNjZXNzX3Rva2VuPXg=', bodyEncoding: 'base64' },
      }),
    );
    expect(binary.response?.body).toBe('YWNjZXNzX3Rva2VuPXg=');
  });
});
