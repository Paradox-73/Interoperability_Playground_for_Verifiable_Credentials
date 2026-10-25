// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Type declarations for the JavaScript-only libraries this package calls, limited to the members it
 * uses. Source files that import one of these modules reference this file with
 * `/// <reference path=...>`, so packages that compile this package's sources see the declarations too.
 */

declare module '@digitalbazaar/vc' {
  export type DocumentLoader = (
    url: string,
  ) => Promise<{ contextUrl: null; documentUrl: string; document: unknown }>;

  export interface LinkedDataSuite {
    readonly type?: string;
  }

  export interface VerifyResult {
    verified: boolean;
    error?: Error & { errors?: Error[] };
    results?: { verified: boolean; error?: Error & { errors?: Error[] } }[];
    presentationResult?: VerifyResult;
    credentialResults?: (VerifyResult & { credentialId?: string })[];
  }

  export function issue(options: {
    credential: Record<string, unknown>;
    suite: LinkedDataSuite;
    documentLoader: DocumentLoader;
    now?: string | Date;
  }): Promise<Record<string, unknown>>;

  export function verifyCredential(options: {
    credential: Record<string, unknown>;
    suite: LinkedDataSuite | LinkedDataSuite[];
    documentLoader: DocumentLoader;
    now?: string | Date;
    checkStatus?: (options: unknown) => Promise<{ verified: boolean }>;
  }): Promise<VerifyResult>;

  export function createPresentation(options: {
    verifiableCredential?: Record<string, unknown> | Record<string, unknown>[];
    id?: string;
    holder?: string;
    now?: string | Date;
    version?: 1.0 | 2.0;
  }): Record<string, unknown>;

  export function signPresentation(options: {
    presentation: Record<string, unknown>;
    suite: LinkedDataSuite;
    documentLoader: DocumentLoader;
    challenge: string;
    domain?: string;
  }): Promise<Record<string, unknown>>;

  export function verify(options: {
    presentation: Record<string, unknown>;
    suite: LinkedDataSuite | LinkedDataSuite[];
    documentLoader: DocumentLoader;
    challenge: string;
    domain?: string;
    now?: string | Date;
    checkStatus?: (options: unknown) => Promise<{ verified: boolean }>;
  }): Promise<VerifyResult>;
}

declare module '@digitalbazaar/ed25519-multikey' {
  export interface Ed25519MultikeySigner {
    id: string;
    algorithm: string;
    sign(options: { data: Uint8Array }): Promise<Uint8Array>;
  }
  export interface Ed25519MultikeyKeyPair {
    id?: string;
    controller?: string;
    publicKeyMultibase: string;
    signer(): Ed25519MultikeySigner;
  }
  export function fromJwk(options: {
    jwk: Record<string, unknown>;
    secretKey?: boolean;
    id?: string;
    controller?: string;
  }): Promise<Ed25519MultikeyKeyPair>;
}

declare module '@digitalbazaar/ed25519-signature-2020' {
  import type { LinkedDataSuite } from '@digitalbazaar/vc';
  import type { Ed25519MultikeySigner } from '@digitalbazaar/ed25519-multikey';
  export class Ed25519Signature2020 implements LinkedDataSuite {
    constructor(options?: { signer?: Ed25519MultikeySigner; date?: string | Date });
    readonly type: string;
  }
}

declare module '@digitalbazaar/data-integrity' {
  import type { LinkedDataSuite } from '@digitalbazaar/vc';
  import type { Ed25519MultikeySigner } from '@digitalbazaar/ed25519-multikey';
  export class DataIntegrityProof implements LinkedDataSuite {
    constructor(options: { signer?: Ed25519MultikeySigner; cryptosuite: unknown; date?: string | Date });
    readonly type: string;
  }
}

declare module '@digitalbazaar/eddsa-rdfc-2022-cryptosuite' {
  export const cryptosuite: { name: string };
}

declare module '@digitalbazaar/data-integrity-context' {
  const context: { contexts: Map<string, unknown>; constants: Record<string, string> };
  export default context;
}

declare module '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite' {
  export const cryptosuite: { name: string };
}

declare module '@digitalbazaar/ecdsa-multikey' {
  import type { Ed25519MultikeySigner } from '@digitalbazaar/ed25519-multikey';
  export interface EcdsaMultikeyKeyPair {
    id?: string;
    controller?: string;
    publicKeyMultibase: string;
    signer(): Ed25519MultikeySigner;
  }
  export function fromJwk(options: {
    jwk: Record<string, unknown>;
    secretKey?: boolean;
    id?: string;
    controller?: string;
  }): Promise<EcdsaMultikeyKeyPair>;
}

declare module '@digitalbazaar/security-document-loader' {
  export interface SecurityLoader {
    documents: Map<string, unknown>;
  }
  export function securityLoader(): SecurityLoader;
}

declare module '@injistack/pixelpass' {
  /** zlib-compresses (CBOR first, when the input is JSON) and base45-encodes `data`. */
  export function generateQRData(data: string, header?: string): string;
  export function decode(data: string): string;
}
