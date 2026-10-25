// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Protocol step of a recorded exchange, from what the wire shows: the routes of the reference roles, Inji
 * Certify and Inji Verify (its API and the web component's session endpoints).
 */
import { describe, expect, it } from 'vitest';
import { tagStep } from '../src/recording/step-tagging.js';

describe('tagStep', () => {
  it.each([
    ['GET', 'http://certify-nginx/.well-known/openid-credential-issuer', undefined, 'issuer.metadata'],
    ['GET', 'http://certify-nginx/.well-known/oauth-authorization-server', undefined, 'as.metadata'],
    ['POST', 'http://localhost:28091/v1/certify/pre-authorized-data', undefined, 'issuer.offer'],
    ['GET', 'http://certify-nginx/v1/certify/credential-offer-data/abc', undefined, 'issuer.offer'],
    ['POST', 'http://certify-nginx/v1/certify/oauth/token', undefined, 'token'],
    ['POST', 'http://certify-nginx/v1/certify/issuance/credential', undefined, 'credential'],
    ['POST', 'http://localhost:28080/v1/verify/vp-request', undefined, 'verifier.request'],
    ['POST', 'http://localhost:28100/v1/verify/vp-session-request', undefined, 'verifier.request'],
    ['GET', 'http://localhost:28080/v1/verify/vp-request/req_1/status', undefined, 'verifier.result'],
    ['POST', 'http://localhost:28100/v1/verify/vp-session-results', undefined, 'verifier.result'],
    ['POST', 'http://localhost:28080/v1/verify/v2/vp-results/txn_1', undefined, 'verifier.result'],
    ['POST', 'http://verify-service:8080/v1/verify/vp-submission/direct-post', undefined, 'wallet.submit'],
    ['POST', 'http://localhost:28100/ref/verifier/response', 'vp_token=x&state=y', 'wallet.submit'],
  ] as const)('%s %s -> %s', (method, url, body, step) => {
    expect(
      tagStep({
        method,
        url,
        ...(body ? { body, contentType: 'application/x-www-form-urlencoded' } : {}),
      }),
    ).toBe(step);
  });

  it('leaves an unknown request untagged', () => {
    expect(tagStep({ method: 'GET', url: 'http://localhost:28100/api/health' })).toBeUndefined();
  });
});
