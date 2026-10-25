// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * What the Inji Verify SDK panel asks for: a DIF Presentation Exchange definition for the playground's
 * farmer credential in the run's format. Shared by the panel and the server-side `inji-verify-sdk` role,
 * which rebuilds the same request for the wallet.
 */
import type { CredentialFormat } from '@inji-playground/protocol';

/** Client id the panel sends to verify-service (`/vp-session-request`). */
export const SDK_CLIENT_ID = 'ps02-playground-sdk';

const FARMER_TYPE = 'FarmerCredential';
/** Matches the farmer vct of every issuer: `https://playground.ps02.test/vct/farmer/v1`, Certify's urn. */
const FARMER_VCT_PATTERN = '[Ff]armer';

export interface SdkPresentationDefinition {
  id: string;
  purpose: string;
  format: Record<string, Record<string, string[]>>;
  input_descriptors: Array<{
    id: string;
    format: Record<string, Record<string, string[]>>;
    constraints: { fields: Array<{ path: string[]; filter: Record<string, unknown> }> };
  }>;
}

export function presentationDefinitionFor(format: CredentialFormat): SdkPresentationDefinition {
  const sdJwt = format === 'vc+sd-jwt' || format === 'dc+sd-jwt';
  const formats = sdJwt
    ? { [format]: { 'sd-jwt_alg_values': ['ES256', 'EdDSA'], 'kb-jwt_alg_values': ['ES256', 'EdDSA'] } }
    : { ldp_vc: { proof_type: ['Ed25519Signature2020', 'Ed25519Signature2018', 'RsaSignature2018'] } };
  // `pattern` as well: Inji wallets (Mimoto) refuse a field filter without one (gap G23). For SD-JWT VC any
  // farmer credential: the reference issuer's vct is an https URL, Inji Certify's an urn, and both contain
  // "farmer". Inji Verify keeps `pattern` but drops `const` and `contains` (G17), so the pattern must allow
  // every issuer the panel can meet.
  const field = sdJwt
    ? { path: ['$.vct'], filter: { type: 'string', pattern: FARMER_VCT_PATTERN } }
    : { path: ['$.type'], filter: { type: 'array', contains: { const: FARMER_TYPE }, pattern: FARMER_TYPE } };
  return {
    id: `ps02-farmer-${format.replace(/\W+/g, '-')}`,
    purpose: 'Inji Interoperability Playground: present the farmer credential issued in this run',
    format: formats,
    input_descriptors: [{ id: 'farmer-credential', format: formats, constraints: { fields: [field] } }],
  };
}
