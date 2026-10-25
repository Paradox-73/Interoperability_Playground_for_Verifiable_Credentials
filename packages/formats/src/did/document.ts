// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * DID documents for roles that host their own did:web document (the reference issuer and verifier).
 */
import type { PublicJwk } from '../keys/keys.js';
import { jwkThumbprint } from '../keys/keys.js';
import { buildVerificationMethod, contextForVerificationMethodType } from './verification-method.js';
import {
  DID_CONTEXT_V1,
  type DidDocument,
  type VerificationMethodType,
  type VerificationRelationship,
} from './types.js';

export interface DidDocumentKey {
  publicJwk: PublicJwk;
  /** Fragment of the verification method id. Default: the JWK thumbprint (RFC 7638). */
  fragment?: string;
  /** Default: Ed25519VerificationKey2020 for Ed25519 (as Inji Certify publishes), JsonWebKey2020 for P-256. */
  type?: VerificationMethodType;
  /** Default: authentication and assertionMethod. */
  relationships?: VerificationRelationship[];
}

export function buildDidDocument(did: string, keys: DidDocumentKey[]): DidDocument {
  const contexts = new Set<string>([DID_CONTEXT_V1]);
  const document: DidDocument = { '@context': [], id: did, verificationMethod: [] };
  for (const key of keys) {
    const type = key.type ?? (key.publicJwk.kty === 'OKP' ? 'Ed25519VerificationKey2020' : 'JsonWebKey2020');
    const id = `${did}#${key.fragment ?? jwkThumbprint(key.publicJwk)}`;
    document.verificationMethod!.push(buildVerificationMethod(id, did, key.publicJwk, type));
    const context = contextForVerificationMethodType(type);
    if (context) contexts.add(context);
    for (const relationship of key.relationships ?? ['authentication', 'assertionMethod']) {
      (document[relationship] ??= []).push(id);
    }
  }
  document['@context'] = [...contexts];
  return document;
}
