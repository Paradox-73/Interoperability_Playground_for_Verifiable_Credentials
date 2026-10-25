// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * One resolver for every DID method the playground meets: did:key and did:jwk offline, did:web over
 * HTTP(S) with the host override map. Both credential formats use it: the SD-JWT verifier to find the
 * issuer and holder keys, the JSON-LD document loader to dereference verification methods.
 */
import { FormatError } from '../errors.js';
import type { PublicJwk } from '../keys/keys.js';
import { resolveDidJwk } from './did-jwk.js';
import { resolveDidKey, type DidKeyOptions } from './did-key.js';
import { resolveDidWeb, type DidWebOptions } from './did-web.js';
import type {
  DidDocument,
  DidResolutionResult,
  ParsedDidUrl,
  VerificationMethod,
  VerificationRelationship,
} from './types.js';
import { verificationMethodToJwk } from './verification-method.js';

export interface DidResolverOptions extends DidWebOptions {
  didKey?: DidKeyOptions;
  /** Keep resolved did:web documents for this many milliseconds. Default 60 s; 0 disables. */
  webCacheMs?: number;
  /** Methods to accept. Default: key, jwk, web. */
  methods?: readonly string[];
}

export interface ResolvedVerificationMethod {
  verificationMethod: VerificationMethod;
  publicJwk: PublicJwk;
  didDocument: DidDocument;
  resolution: DidResolutionResult;
}

export interface DidResolver {
  resolve(did: string): Promise<DidResolutionResult>;
  /**
   * Finds a verification method by DID URL (`did:...#fragment`) and checks that the DID document
   * authorises it for `relationship`. A bare DID selects the first method listed for `relationship`.
   */
  resolveVerificationMethod(
    didUrl: string,
    relationship?: VerificationRelationship,
  ): Promise<ResolvedVerificationMethod>;
}

const DID_URL = /^did:([a-z0-9]+):([^#?/]+)(?:[^#]*)(?:#(.*))?$/;

export function parseDidUrl(didUrl: string): ParsedDidUrl {
  const match = DID_URL.exec(didUrl);
  if (!match)
    throw new FormatError('DID_INVALID', `not a DID URL: ${didUrl}`, {
      spec: 'DID Core section 3.2 (DID URL syntax)',
    });
  const [, method, methodSpecificId, fragment] = match as unknown as [
    string,
    string,
    string,
    string | undefined,
  ];
  const parsed: ParsedDidUrl = { did: `did:${method}:${methodSpecificId}`, method, methodSpecificId };
  if (fragment !== undefined) parsed.fragment = fragment;
  return parsed;
}

export function createDidResolver(options: DidResolverOptions = {}): DidResolver {
  const methods = new Set(options.methods ?? ['key', 'jwk', 'web']);
  const webCacheMs = options.webCacheMs ?? 60_000;
  const webCache = new Map<string, { expires: number; result: Promise<DidResolutionResult> }>();

  async function resolve(did: string): Promise<DidResolutionResult> {
    const { method, did: bareDid } = parseDidUrl(did);
    if (bareDid !== did)
      throw new FormatError('DID_INVALID', `expected a DID without path or fragment: ${did}`);
    if (!methods.has(method)) {
      throw new FormatError(
        'DID_METHOD_UNSUPPORTED',
        `DID method "${method}" is not enabled (enabled: ${[...methods].join(', ')})`,
      );
    }
    switch (method) {
      case 'key':
        return resolveDidKey(did, options.didKey);
      case 'jwk':
        return resolveDidJwk(did);
      case 'web': {
        const cached = webCache.get(did);
        if (cached && cached.expires > Date.now()) return cached.result;
        const result = resolveDidWeb(did, options);
        if (webCacheMs > 0) {
          webCache.set(did, { expires: Date.now() + webCacheMs, result });
          // A failed fetch must not stay cached: the next run may find the host up.
          result.catch(() => webCache.delete(did));
        }
        return result;
      }
      default:
        throw new FormatError('DID_METHOD_UNSUPPORTED', `DID method "${method}" is not supported`);
    }
  }

  async function resolveVerificationMethod(
    didUrl: string,
    relationship?: VerificationRelationship,
  ): Promise<ResolvedVerificationMethod> {
    const parsed = parseDidUrl(didUrl);
    const resolution = await resolve(parsed.did);
    const document = resolution.didDocument;
    const methods = document.verificationMethod ?? [];
    const authorised = relationship ? (document[relationship] ?? []) : undefined;
    const matchesId = (id: string): boolean => sameMethodId(id, didUrl, document.id);

    let method: VerificationMethod | undefined;
    if (parsed.fragment === undefined) {
      const first = authorised?.[0] ?? methods[0];
      method =
        typeof first === 'string'
          ? methods.find((candidate) => sameMethodId(candidate.id, first, document.id))
          : first;
    } else {
      method =
        methods.find((candidate) => matchesId(candidate.id)) ??
        authorised?.find(
          (entry): entry is VerificationMethod => typeof entry !== 'string' && matchesId(entry.id),
        );
    }
    if (!method) {
      throw new FormatError(
        'VERIFICATION_METHOD_NOT_FOUND',
        `${didUrl} is not a verification method of ${document.id}`,
      );
    }
    const methodId = method.id;
    if (
      authorised &&
      !authorised.some((entry) =>
        sameMethodId(typeof entry === 'string' ? entry : entry.id, methodId, document.id),
      )
    ) {
      throw new FormatError(
        'VERIFICATION_METHOD_NOT_FOUND',
        `${methodId} is not listed under "${relationship}" in ${document.id}`,
        { spec: 'DID Core section 5.3 (verification relationships)' },
      );
    }
    return {
      verificationMethod: method,
      publicJwk: verificationMethodToJwk(method),
      didDocument: document,
      resolution,
    };
  }

  return { resolve, resolveVerificationMethod };
}

/** Verification method ids may be relative (`#key-1`) in a DID document; compare them absolute. */
function sameMethodId(a: string, b: string, did: string): boolean {
  const absolute = (id: string): string => (id.startsWith('#') ? `${did}${id}` : id);
  return absolute(a) === absolute(b);
}
