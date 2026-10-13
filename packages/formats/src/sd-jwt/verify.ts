/**
 * Verifier side of SD-JWT VC. Each step follows RFC 9901 section 7.1 (the SD-JWT) and section 7.3
 * (the KB-JWT), as SD-JWT VC draft 19 section 2.4 requires.
 *
 * `@sd-jwt/sd-jwt-vc` is used for disclosure processing only (section 7.1 steps 3-5). Signature,
 * issuer key, validity window and every KB-JWT check are done here: version 0.21.1 verifies a KB-JWT
 * only when a nonce is passed (and silently skips it otherwise) and compares `aud` only when
 * `expectedKeyBindingAudience` is passed too, so relying on it would make the verifier's policy depend
 * on how it is called.
 */
import { FormatError, errorMessage } from '../errors.js';
import type { DidResolver } from '../did/resolver.js';
import { parseDidUrl } from '../did/resolver.js';
import {
  decodeCompactJws,
  verifyDecodedJws,
  type DecodedJws,
  type JoseHeader,
  type JwtPayload,
} from '../keys/jws.js';
import { toPublicJwk, type PublicJwk } from '../keys/keys.js';
import { validateX5c } from '../keys/x509.js';
import { isRecord } from '../util/encoding.js';
import { computeSdHash, decodeDisclosure, sdJwtLibrary, splitSdJwt, SD_JWT_VC_TYPES } from './common.js';

export interface KeyBindingPolicy {
  /** Nonce from the authorization request (RFC 9901 section 7.3 step 5f). */
  nonce: string;
  /** The verifier's client_id (OpenID4VP 1.0 Appendix B.3.6). */
  audience: string;
  /** Oldest acceptable KB-JWT `iat`, in seconds before now. Default 300. */
  maxAgeSeconds?: number;
}

export interface VerifySdJwtVcOptions {
  /**
   * Key binding policy. Required on purpose: whether to check key binding must be decided by the
   * verifier, never by whether a KB-JWT happens to be present (RFC 9901 section 7.3 step 1).
   */
  keyBinding: KeyBindingPolicy | false;
  /** Resolves `kid` DID URLs of the issuer and `cnf.kid` of the holder. */
  didResolver?: DidResolver;
  /** Issuer keys known out of band (for example from JWT VC Issuer Metadata, SD-JWT VC section 4). */
  issuerKeys?: PublicJwk[];
  /** x5c policy: trust anchors (base64 DER or PEM) and whether an untrusted chain is rejected. */
  x5c?: { trustAnchors?: string[]; requireTrusted?: boolean };
  /** Accepted `typ` values. Default: `dc+sd-jwt` and `vc+sd-jwt`. */
  allowedTypes?: readonly string[];
  /** Accepted signature algorithms. Default: ES256, EdDSA, Ed25519. */
  allowedAlgorithms?: readonly string[];
  expectedVct?: string | readonly string[];
  expectedIssuer?: string;
  /** Claims that must be present after disclosures are processed. */
  requiredClaims?: readonly string[];
  now?: Date;
  /** Tolerance for clock differences, in seconds. Default 60. */
  clockSkewSeconds?: number;
}

export interface IssuerKeyInfo {
  source: 'did' | 'x5c' | 'configured';
  jwk: PublicJwk;
  kid?: string;
  /**
   * For a DID key, the DID (which `iss`, when present, must equal). For x5c and configured keys, `iss` as
   * written: it is never a DID, but it is not checked against the certificate or the configured key, so any
   * key that chains to a trust anchor can write any issuer URL there.
   */
  issuer?: string;
  /** For x5c: whether the chain ends at a configured trust anchor. */
  trusted?: boolean;
  /** For DIDs: resolution notes, such as a non-canonical did:jwk. */
  warnings?: string[];
}

export interface SdJwtVcVerification {
  header: JoseHeader;
  /** Processed payload: disclosed claims inserted, `_sd` and `_sd_alg` removed. */
  claims: JwtPayload;
  /** Names of the claims that were disclosed selectively. */
  disclosed: string[];
  issuerKey: IssuerKeyInfo;
  /** Present when key binding was checked. */
  keyBinding?: { header: JoseHeader; payload: JwtPayload; holderJwk: PublicJwk };
  warnings: string[];
}

const DEFAULT_ALGORITHMS = ['ES256', 'EdDSA', 'Ed25519'];

export async function verifySdJwtVc(
  compact: string,
  options: VerifySdJwtVcOptions,
): Promise<SdJwtVcVerification> {
  const now = options.now ?? new Date();
  const skew = options.clockSkewSeconds ?? 60;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const allowedAlgorithms = options.allowedAlgorithms ?? DEFAULT_ALGORITHMS;
  const warnings: string[] = [];

  // RFC 9901 section 7.1 step 1: separate the issuer-signed JWT, the disclosures and the KB-JWT.
  const parts = splitSdJwt(compact);
  const issuerJws = decodeCompactJws(parts.issuerJwt, 'SDJWT_MALFORMED');
  const { header, payload } = issuerJws;

  // Explicit typing (SD-JWT VC section 2.2.1, RFC 9901 section 9.11).
  const allowedTypes = options.allowedTypes ?? SD_JWT_VC_TYPES;
  if (typeof header.typ !== 'string' || !allowedTypes.includes(header.typ)) {
    throw new FormatError(
      'SDJWT_TYP_UNEXPECTED',
      `typ "${String(header.typ)}" is not one of ${allowedTypes.join(', ')}`,
      {
        spec: 'SD-JWT VC draft 19 section 2.2.1',
        details: { typ: header.typ },
      },
    );
  }
  // Step 2a: algorithm deemed secure, never "none".
  if (typeof header.alg !== 'string' || header.alg === 'none' || !allowedAlgorithms.includes(header.alg)) {
    throw new FormatError('SDJWT_ALG_REJECTED', `alg "${String(header.alg)}" is not accepted`, {
      spec: 'RFC 9901 section 7.1 step 2a',
    });
  }

  // Step 2c: the signing key must belong to the issuer (SD-JWT VC section 2.5).
  const issuerKey = await resolveIssuerKey(issuerJws, options, now);
  // Step 2b: signature.
  if (!verifyDecodedJws(issuerJws, issuerKey.jwk)) {
    throw new FormatError('SDJWT_SIGNATURE_INVALID', 'issuer signature does not verify', {
      spec: 'RFC 9901 section 7.1 step 2b',
      details: { kid: header.kid },
    });
  }
  // Step 2d: _sd_alg understood.
  if (payload._sd_alg !== undefined && payload._sd_alg !== 'sha-256') {
    throw new FormatError(
      'SDJWT_ALG_REJECTED',
      `_sd_alg ${JSON.stringify(payload._sd_alg)} is not supported`,
      {
        spec: 'RFC 9901 section 7.1 step 2d',
      },
    );
  }
  // Step 6 (done early because SD-JWT VC keeps nbf and exp out of disclosures, section 2.2.2.3).
  checkTimeWindow(payload, nowSeconds, skew);

  // Steps 3-5: disclosures. The library also re-checks the signature with the key resolved above.
  let claims: JwtPayload;
  try {
    const result = await sdJwtLibrary({ issuerPublicJwk: issuerKey.jwk }).verify(parts.sdJwtWithoutKb, {
      currentDate: nowSeconds,
      skewSeconds: skew,
      // The library would fetch `status.status_list.uri` with an unlimited global fetch; status is checked
      // by `checkStatusEntry` instead, with the address and size limits of `fetchLimited`.
      disableStatusVerification: true,
    });
    claims = result.payload;
  } catch (cause) {
    throw new FormatError(
      'SDJWT_DISCLOSURE_INVALID',
      `disclosures do not match the issuer-signed JWT: ${errorMessage(cause)}`,
      {
        cause,
        spec: 'RFC 9901 section 7.1 steps 3-5',
      },
    );
  }
  const disclosed = parts.disclosures
    .map(decodeDisclosure)
    .flatMap((disclosure) => (disclosure.name ? [disclosure.name] : []));

  checkClaims(claims, options);
  if (issuerKey.warnings) warnings.push(...issuerKey.warnings);

  const verification: SdJwtVcVerification = { header, claims, disclosed, issuerKey, warnings };
  if (options.keyBinding === false) {
    if (parts.kbJwt !== undefined)
      warnings.push('KB-JWT present but key binding was not requested; it was not checked');
    return verification;
  }
  verification.keyBinding = await verifyKeyBinding(parts, claims, options.keyBinding, {
    ...options,
    now,
    skew,
    nowSeconds,
  });
  return verification;
}

async function resolveIssuerKey(
  jws: DecodedJws,
  options: VerifySdJwtVcOptions,
  now: Date,
): Promise<IssuerKeyInfo> {
  const { header, payload } = jws;
  if (header.x5c !== undefined) {
    const chain = await validateX5c(header.x5c, {
      now,
      ...(options.x5c?.trustAnchors ? { trustAnchors: options.x5c.trustAnchors } : {}),
    });
    if (options.x5c?.requireTrusted && !chain.trusted) {
      throw new FormatError(
        'X5C_UNTRUSTED',
        `x5c chain for ${chain.leafSubject} does not end at a trust anchor`,
        {
          spec: 'SD-JWT VC draft 19 section 2.5 (Inline X.509 Certificates)',
        },
      );
    }
    refuseDidIssuer(payload.iss, 'an x5c');
    return {
      source: 'x5c',
      jwk: chain.leafJwk,
      trusted: chain.trusted,
      ...(typeof payload.iss === 'string' ? { issuer: payload.iss } : {}),
    };
  }

  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const iss = typeof payload.iss === 'string' ? payload.iss : undefined;
  // Inji names the issuer key with a DID URL in `kid` (inji/inji-wallet#2578); a bare fragment is
  // read relative to an `iss` that is a DID.
  const didUrl = kid?.startsWith('did:')
    ? kid
    : kid?.startsWith('#') && iss?.startsWith('did:')
      ? `${iss}${kid}`
      : undefined;
  if (didUrl !== undefined) {
    if (!options.didResolver) {
      throw new FormatError(
        'SDJWT_ISSUER_KEY_UNRESOLVED',
        `kid ${didUrl} is a DID URL but no DID resolver was given`,
      );
    }
    // A DID key speaks only for its DID: an `iss` that is another DID, or not a DID at all (an issuer URL,
    // whose keys come from its metadata or x5c), would let anyone sign with their own did:key and name any
    // issuer they like.
    const keyDid = parseDidUrl(didUrl).did;
    if (iss !== undefined && iss !== keyDid) {
      throw new FormatError('SDJWT_ISSUER_MISMATCH', `kid ${didUrl} does not belong to issuer ${iss}`, {
        spec: 'RFC 9901 section 7.1 step 2c; SD-JWT VC draft 19 section 2.5 (a DID key names a DID issuer)',
        details: { kid: didUrl, iss },
      });
    }
    try {
      const resolved = await options.didResolver.resolveVerificationMethod(didUrl, 'assertionMethod');
      return {
        source: 'did',
        jwk: resolved.publicJwk,
        kid: resolved.verificationMethod.id,
        issuer: keyDid,
        ...(resolved.resolution.didResolutionMetadata.warnings
          ? { warnings: resolved.resolution.didResolutionMetadata.warnings }
          : {}),
      };
    } catch (cause) {
      throw new FormatError(
        'SDJWT_ISSUER_KEY_UNRESOLVED',
        `issuer key ${didUrl} could not be resolved: ${errorMessage(cause)}`,
        {
          cause,
          spec: 'SD-JWT VC draft 19 section 2.5',
        },
      );
    }
  }

  const configured = (options.issuerKeys ?? []).filter((jwk) => kid === undefined || jwk.kid === kid);
  if (configured.length > 0) {
    refuseDidIssuer(iss, 'a configured');
    return {
      source: 'configured',
      jwk: toPublicJwk(configured[0]),
      ...(kid ? { kid } : {}),
      ...(iss ? { issuer: iss } : {}),
    };
  }

  throw new FormatError(
    'SDJWT_ISSUER_KEY_UNRESOLVED',
    'no x5c, no DID kid and no configured key for this issuer',
    {
      spec: 'SD-JWT VC draft 19 section 2.5',
      details: { kid, iss },
    },
  );
}

/**
 * A DID issuer speaks only through a key of its DID document. An x5c or configured key that claimed a
 * DID `iss` would skip the verifier's DID trust list and be reported under, say, Inji Certify's DID.
 */
function refuseDidIssuer(iss: unknown, keySource: string): void {
  if (typeof iss !== 'string' || !iss.startsWith('did:')) return;
  throw new FormatError('SDJWT_ISSUER_MISMATCH', `${keySource} key cannot sign for the DID issuer ${iss}`, {
    spec: 'RFC 9901 section 7.1 step 2c; SD-JWT VC draft 19 section 2.5 (a DID issuer uses a DID key)',
    details: { iss },
  });
}

function checkTimeWindow(payload: JwtPayload, nowSeconds: number, skew: number): void {
  for (const name of ['iat', 'nbf', 'exp'] as const) {
    if (payload[name] !== undefined && typeof payload[name] !== 'number') {
      throw new FormatError('SDJWT_MALFORMED', `${name} must be a NumericDate`, {
        spec: 'RFC 7519 section 4.1',
      });
    }
  }
  if (typeof payload.exp === 'number' && nowSeconds - skew >= payload.exp) {
    throw new FormatError(
      'SDJWT_EXPIRED',
      `credential expired at ${new Date(payload.exp * 1000).toISOString()}`,
      {
        spec: 'RFC 9901 section 7.1 step 6; RFC 7519 section 4.1.4',
        details: { exp: payload.exp, now: nowSeconds },
      },
    );
  }
  if (typeof payload.nbf === 'number' && nowSeconds + skew < payload.nbf) {
    throw new FormatError(
      'SDJWT_NOT_YET_VALID',
      `credential not valid before ${new Date(payload.nbf * 1000).toISOString()}`,
      {
        spec: 'RFC 9901 section 7.1 step 6; RFC 7519 section 4.1.5',
        details: { nbf: payload.nbf, now: nowSeconds },
      },
    );
  }
}

function checkClaims(claims: JwtPayload, options: VerifySdJwtVcOptions): void {
  if (typeof claims.vct !== 'string') {
    throw new FormatError('SDJWT_CLAIM_MISSING', 'vct is required', {
      spec: 'SD-JWT VC draft 19 section 2.2.2.3',
    });
  }
  if (options.expectedVct !== undefined) {
    const expected = typeof options.expectedVct === 'string' ? [options.expectedVct] : options.expectedVct;
    if (!expected.includes(claims.vct)) {
      throw new FormatError(
        'SDJWT_VCT_MISMATCH',
        `vct "${claims.vct}" is not one of ${expected.join(', ')}`,
        {
          spec: 'SD-JWT VC draft 19 section 2.2.2.1',
          details: { vct: claims.vct, expected },
        },
      );
    }
  }
  if (options.expectedIssuer !== undefined && claims.iss !== options.expectedIssuer) {
    throw new FormatError(
      'SDJWT_ISSUER_MISMATCH',
      `iss "${String(claims.iss)}" is not ${options.expectedIssuer}`,
      {
        spec: 'RFC 9901 section 7.1 step 2c',
      },
    );
  }
  const missing = (options.requiredClaims ?? []).filter((name) => claims[name] === undefined);
  if (missing.length > 0) {
    throw new FormatError('SDJWT_CLAIM_MISSING', `required claims not disclosed: ${missing.join(', ')}`, {
      details: { missing },
    });
  }
}

async function verifyKeyBinding(
  parts: ReturnType<typeof splitSdJwt>,
  claims: JwtPayload,
  policy: KeyBindingPolicy,
  context: VerifySdJwtVcOptions & { nowSeconds: number; skew: number },
): Promise<NonNullable<SdJwtVcVerification['keyBinding']>> {
  const spec = (step: string): string => `RFC 9901 section 7.3 step ${step}`;
  // Step 2: key binding required but not provided.
  if (parts.kbJwt === undefined) {
    throw new FormatError('KB_JWT_MISSING', 'key binding is required but the presentation has no KB-JWT', {
      spec: spec('2'),
    });
  }
  // Step 5a: holder key from cnf (RFC 9901 section 4.1.2, RFC 7800 section 3).
  const holderJwk = await resolveHolderKey(claims.cnf, context.didResolver);
  const kb = decodeCompactJws(parts.kbJwt, 'KB_JWT_MALFORMED');
  // Steps 5b and 5c: algorithm and signature.
  const allowedAlgorithms = context.allowedAlgorithms ?? DEFAULT_ALGORITHMS;
  if (
    typeof kb.header.alg !== 'string' ||
    !allowedAlgorithms.includes(kb.header.alg) ||
    !verifyDecodedJws(kb, holderJwk)
  ) {
    throw new FormatError('KB_JWT_SIGNATURE_INVALID', 'KB-JWT is not signed by the holder key in cnf', {
      spec: spec('5b-5c'),
      details: { alg: kb.header.alg },
    });
  }
  // Step 5d: explicit type.
  if (kb.header.typ !== 'kb+jwt') {
    throw new FormatError('KB_JWT_MALFORMED', `KB-JWT typ must be "kb+jwt", got "${String(kb.header.typ)}"`, {
      spec: spec('5d'),
    });
  }
  // Step 5e: iat inside the acceptable window.
  const { iat, nonce, aud, sd_hash: sdHash } = kb.payload;
  const maxAge = policy.maxAgeSeconds ?? 300;
  if (
    typeof iat !== 'number' ||
    iat > context.nowSeconds + context.skew ||
    iat < context.nowSeconds - maxAge - context.skew
  ) {
    throw new FormatError(
      'KB_JWT_IAT_OUT_OF_WINDOW',
      `KB-JWT iat is missing or outside the last ${maxAge} s`,
      {
        spec: spec('5e'),
        details: { iat, now: context.nowSeconds, maxAgeSeconds: maxAge },
      },
    );
  }
  // Step 5f: bound to this transaction (nonce) and to this verifier (aud).
  if (nonce !== policy.nonce) {
    throw new FormatError('KB_JWT_NONCE_MISMATCH', 'KB-JWT nonce does not match the request nonce', {
      spec: spec('5f'),
      details: { expected: policy.nonce, received: nonce },
    });
  }
  // aud is a single string (RFC 9901 section 4.3); an array is not accepted even if it contains ours.
  if (aud !== policy.audience) {
    throw new FormatError('KB_JWT_AUDIENCE_MISMATCH', 'KB-JWT aud is not this verifier', {
      spec: `${spec('5f')}; OpenID4VP 1.0 Appendix B.3.6`,
      details: { expected: policy.audience, received: aud },
    });
  }
  // Step 5g: sd_hash over the issuer JWT and the disclosures actually presented.
  const expectedHash = computeSdHash(parts.sdJwtWithoutKb);
  if (sdHash !== expectedHash) {
    throw new FormatError('KB_JWT_SD_HASH_MISMATCH', 'KB-JWT sd_hash does not cover the presented SD-JWT', {
      spec: `${spec('5g')}; RFC 9901 section 4.3.1`,
      details: { expected: expectedHash, received: sdHash },
    });
  }
  return { header: kb.header, payload: kb.payload, holderJwk };
}

async function resolveHolderKey(cnf: unknown, resolver: DidResolver | undefined): Promise<PublicJwk> {
  const spec = 'RFC 9901 section 7.3 step 5a; SD-JWT VC draft 19 section 2.2.2.3 (cnf)';
  if (!isRecord(cnf)) {
    throw new FormatError(
      'KB_JWT_HOLDER_KEY_UNRESOLVED',
      'the credential has no cnf claim, so no holder key',
      { spec },
    );
  }
  try {
    if (cnf.jwk !== undefined) return toPublicJwk(cnf.jwk);
    if (typeof cnf.kid === 'string' && cnf.kid.startsWith('did:') && resolver) {
      return (await resolver.resolveVerificationMethod(cnf.kid, 'authentication')).publicJwk;
    }
  } catch (cause) {
    throw new FormatError(
      'KB_JWT_HOLDER_KEY_UNRESOLVED',
      `holder key in cnf could not be read: ${errorMessage(cause)}`,
      {
        cause,
        spec,
      },
    );
  }
  throw new FormatError('KB_JWT_HOLDER_KEY_UNRESOLVED', 'cnf has neither a jwk nor a resolvable DID kid', {
    spec,
    details: { cnf },
  });
}
