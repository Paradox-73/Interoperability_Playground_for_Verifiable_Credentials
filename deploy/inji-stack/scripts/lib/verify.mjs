// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Inji Verify 0.18.2 calls used by the smoke test: direct credential verification and an OpenID4VP
 * presentation request with its status poll (verify-service controllers VCVerificationController and
 * VPRequestController).
 */
import { request } from './http.mjs';

/**
 * Content-Type that makes verify-service pick the right verifier: it reads the format from this header
 * (VCVerificationController#verify). SD-JWT VCs are compact strings; ldp_vc are JSON-LD documents.
 */
export function contentTypeFor(format) {
  if (format === 'vc+sd-jwt' || format === 'dc+sd-jwt') return 'application/vc+sd-jwt';
  return 'application/ld+json';
}

/** POST /v1/verify/vc-verification; returns the exchange and the verificationStatus (SUCCESS, INVALID, ...). */
export async function verifyCredential(verifyUrl, credential, format, label) {
  const body = typeof credential === 'string' ? credential : JSON.stringify(credential);
  const exchange = await request(label, `${verifyUrl}/v1/verify/vc-verification`, {
    method: 'POST',
    headers: { 'Content-Type': contentTypeFor(format) },
    body,
    timeoutMs: 90_000,
  });
  const status =
    typeof exchange.body === 'object' && exchange.body ? exchange.body.verificationStatus : undefined;
  return { exchange, verificationStatus: status };
}

/** A minimal presentation definition asking for any credential of the given type. */
export function presentationDefinition(id, credentialType) {
  return {
    id,
    purpose: 'PS02 playground stack smoke test',
    input_descriptors: [
      {
        id: `${id}-descriptor`,
        constraints: {
          fields: [{ path: ['$.type'], filter: { type: 'array', contains: { const: credentialType } } }],
        },
      },
    ],
  };
}

/**
 * Creates an authorization request (POST /vp-request, expect 201) and polls its status once
 * (GET /vp-request/{requestId}/status, expect 200). The status call is a long poll: verify-service answers
 * when a presentation arrives or after INJI_VP_REQUEST_LONG_POLLING_TIMEOUT (55 s in compose.yaml).
 */
export async function createAndPollVpRequest(verifyUrl, exchanges) {
  const created = await request('vp-request', `${verifyUrl}/v1/verify/vp-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'ps02-stack-smoke',
      presentationDefinition: presentationDefinition('ps02-smoke-farmer', 'FarmerCredential'),
    }),
  });
  exchanges.push(created);
  if (created.status !== 201) return { created, status: undefined };
  const requestId = created.body.requestId;
  const status = await request('vp-request status', `${verifyUrl}/v1/verify/vp-request/${requestId}/status`, {
    timeoutMs: 75_000,
  });
  exchanges.push(status);
  return { created, status };
}
