// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Writing and reading `client_id` values in both profiles.
 *
 * - Drafts 21-23 as Inji uses them: a bare DID (`did:key:...`) means the DID scheme, which needs a
 *   signed request object (`VerifiablePresentationRequestServiceImpl.java:103`, inji-openid4vp
 *   `DidSchemeAuthorizationRequestHandler.kt`). The `redirect_uri` scheme is named by the separate
 *   `client_id_scheme` parameter (draft 21 section 5.7) and its `client_id` is the response URI.
 * - OpenID4VP 1.0 section 5.9: the scheme is a prefix, `decentralized_identifier:did:...` or
 *   `redirect_uri:https://...`. A value without a known prefix is a pre-registered client.
 */
import type { VpProfile } from '@inji-playground/protocol';
import { DECENTRALIZED_IDENTIFIER_PREFIX, REDIRECT_URI_PREFIX, type ClientIdScheme } from './constants.js';
import { Oid4vpError } from './errors.js';

/** The `client_id` (and, for draft `redirect_uri`, the `client_id_scheme`) a verifier sends. */
export function formatClientId(
  profile: VpProfile,
  scheme: ClientIdScheme,
  identifier: string,
): { clientId: string; clientIdScheme?: string } {
  if (profile === 'final-1.0') {
    return {
      clientId: `${scheme === 'did' ? DECENTRALIZED_IDENTIFIER_PREFIX : REDIRECT_URI_PREFIX}${identifier}`,
    };
  }
  return scheme === 'did'
    ? { clientId: identifier }
    : { clientId: identifier, clientIdScheme: 'redirect_uri' };
}

export type ParsedClientIdScheme =
  | 'did'
  | 'redirect_uri'
  | 'pre-registered'
  | 'x509_san_dns'
  | 'x509_hash'
  | 'verifier_attestation'
  | 'openid_federation'
  | 'origin'
  | 'https';

export interface ParsedClientId {
  scheme: ParsedClientIdScheme;
  /** The DID or the redirect URI without the prefix. */
  identifier: string;
  /** True when the scheme came from a 1.0 prefix (`decentralized_identifier:`, `redirect_uri:`). */
  prefixed: boolean;
}

const OTHER_PREFIXES: ParsedClientIdScheme[] = [
  'x509_san_dns',
  'x509_hash',
  'verifier_attestation',
  'openid_federation',
  'origin',
];

/** Reads a `client_id` as a wallet receives it, with the draft `client_id_scheme` parameter if any. */
export function parseClientId(clientId: string, clientIdSchemeParameter?: string): ParsedClientId {
  if (clientId.startsWith(DECENTRALIZED_IDENTIFIER_PREFIX)) {
    return {
      scheme: 'did',
      identifier: clientId.slice(DECENTRALIZED_IDENTIFIER_PREFIX.length),
      prefixed: true,
    };
  }
  if (clientId.startsWith(REDIRECT_URI_PREFIX)) {
    return { scheme: 'redirect_uri', identifier: clientId.slice(REDIRECT_URI_PREFIX.length), prefixed: true };
  }
  if (clientIdSchemeParameter !== undefined) {
    if (clientIdSchemeParameter === 'did' || clientIdSchemeParameter === 'redirect_uri') {
      return { scheme: clientIdSchemeParameter, identifier: clientId, prefixed: false };
    }
    throw new Oid4vpError(
      'CLIENT_ID_UNSUPPORTED',
      `client_id_scheme "${clientIdSchemeParameter}" is not supported by the reference wallet`,
      { spec: 'OpenID4VP draft 21 section 5.7' },
    );
  }
  // Draft 22-23 prefix "did:" and Inji's bare DID client ids.
  if (clientId.startsWith('did:')) return { scheme: 'did', identifier: clientId, prefixed: false };
  const prefix = clientId.slice(0, Math.max(clientId.indexOf(':'), 0));
  const other = OTHER_PREFIXES.find((candidate) => candidate === prefix);
  if (other !== undefined) {
    return { scheme: other, identifier: clientId.slice(prefix.length + 1), prefixed: true };
  }
  if (prefix === 'https') return { scheme: 'https', identifier: clientId, prefixed: false };
  return { scheme: 'pre-registered', identifier: clientId, prefixed: false };
}
