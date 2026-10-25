// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Step tagging rules: decide which protocol step an HTTP exchange belongs to from what is on the wire
 * (path, content type, body shape), for exchanges whose sender named no step. The proxy and the
 * inbound recorder need them because a phone or a container sends no hint; the outbound client falls
 * back on them when a role did not enter a step.
 *
 * The rules cover the reference roles (`/ref/*`) and the Inji modules' routes (Certify
 * `/v1/certify/*`, Inji Verify `/v1/verify/*`). The first matching rule wins, so specific rules come
 * before generic ones. An exchange no rule recognises stays untagged rather than mis-tagged.
 */
import type { StepId } from '@inji-playground/protocol';

export interface TaggableRequest {
  method: string;
  url: string;
  /** Request `content-type`, if any. */
  contentType?: string;
  /** Request body as text, if any. */
  body?: string;
  /** Response `content-type`, if a response arrived. */
  responseContentType?: string;
}

interface Rule {
  step: StepId;
  /** Short reason, shown in tests and kept next to the rule for readers. */
  why: string;
  test(request: Parsed): boolean;
}

interface Parsed {
  method: string;
  path: string;
  contentType: string;
  responseContentType: string;
  form: URLSearchParams | undefined;
}

const RULES: readonly Rule[] = [
  // Well-known documents first: their paths also contain words such as "credential" or "token".
  {
    step: 'issuer.metadata',
    why: 'OpenID4VCI issuer metadata (draft 13 section 11.2, 1.0 section 12.2)',
    test: (r) => r.path.includes('/.well-known/openid-credential-issuer'),
  },
  {
    step: 'as.metadata',
    why: 'RFC 8414 authorization server metadata or OpenID Connect discovery',
    test: (r) =>
      r.path.includes('/.well-known/oauth-authorization-server') ||
      r.path.includes('/.well-known/openid-configuration'),
  },
  {
    step: 'issuer.metadata',
    why: 'SD-JWT VC issuer metadata (jwt-vc-issuer) read to find the issuer keys',
    test: (r) => r.path.includes('/.well-known/jwt-vc-issuer'),
  },
  {
    step: 'as.metadata',
    why: 'authorization server signing keys',
    test: (r) => /\/(jwks(\.json)?|oauth2?\/jwks(\.json)?)$/.test(r.path),
  },
  // Inji Verify: the verifier back end and the wallet both talk to /v1/verify.
  {
    step: 'wallet.submit',
    why: 'Inji Verify direct_post endpoint',
    test: (r) => r.method === 'POST' && r.path.includes('/vp-submission/direct-post'),
  },
  {
    step: 'verifier.result',
    why: 'Inji Verify status poll, result fetch or single-credential verification',
    test: (r) =>
      /\/vp-request\/[^/]+\/status$/.test(r.path) ||
      r.path.includes('/vp-result') ||
      r.path.includes('/vp-session-results') ||
      r.path.includes('/vc-verification'),
  },
  {
    step: 'verifier.request',
    why: 'Inji Verify creates an authorization request',
    test: (r) => r.method === 'POST' && /\/vp-(session-)?request\/?$/.test(r.path),
  },
  // OpenID4VP wallet side.
  {
    step: 'wallet.fetch-request',
    why: 'request object by reference (RFC 9101, OpenID4VP section 5.10)',
    test: (r) =>
      r.responseContentType.includes('oauth-authz-req+jwt') ||
      (r.method === 'GET' && /\/requests\/[^/]+$/.test(r.path)),
  },
  {
    step: 'wallet.submit',
    why: 'direct_post response carrying vp_token (OpenID4VP section 8.2)',
    test: (r) => r.method === 'POST' && (r.form?.has('vp_token') === true || /\/response$/.test(r.path)),
  },
  // OpenID4VCI.
  {
    step: 'issuer.offer',
    why: 'credential offer by reference, or Inji Certify pre-authorized data / offer endpoints',
    test: (r) =>
      /\/offers\/[^/]+$/.test(r.path) ||
      r.path.includes('/credential-offer') ||
      r.path.includes('/pre-authorized-data'),
  },
  {
    step: 'token',
    why: 'token request (form with grant_type) or authorization endpoint',
    test: (r) =>
      r.form?.has('grant_type') === true ||
      (r.method === 'POST' && /\/(token|oauth\/token)$/.test(r.path)) ||
      /\/authorize$/.test(r.path),
  },
  {
    step: 'nonce',
    why: 'OpenID4VCI 1.0 nonce endpoint',
    test: (r) => r.method === 'POST' && /\/nonce$/.test(r.path),
  },
  {
    step: 'credential',
    why: 'credential endpoint',
    test: (r) => r.method === 'POST' && /\/credential$/.test(r.path),
  },
];

function parse(request: TaggableRequest): Parsed {
  let path: string;
  try {
    path = new URL(request.url, 'http://placeholder.invalid').pathname;
  } catch {
    path = request.url.split('?')[0] ?? '';
  }
  const contentType = (request.contentType ?? '').toLowerCase();
  const isForm = contentType.includes('application/x-www-form-urlencoded');
  return {
    method: request.method.toUpperCase(),
    path: path.replace(/\/+$/, '') || '/',
    contentType,
    responseContentType: (request.responseContentType ?? '').toLowerCase(),
    form: isForm && request.body !== undefined ? new URLSearchParams(request.body) : undefined,
  };
}

/** The protocol step an exchange belongs to, or `undefined` when no rule recognises it. */
export function tagStep(request: TaggableRequest): StepId | undefined {
  const parsed = parse(request);
  return RULES.find((rule) => rule.test(parsed))?.step;
}

/** The rules in order with their reasons, for documentation and tests. */
export function stepRules(): ReadonlyArray<{ step: StepId; why: string }> {
  return RULES.map(({ step, why }) => ({ step, why }));
}
