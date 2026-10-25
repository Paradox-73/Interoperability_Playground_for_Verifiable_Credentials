// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Shared pieces of SD-JWT (RFC 9901) handling: splitting the compact form, decoding disclosures,
 * hashing, and the `@sd-jwt/sd-jwt-vc` instance wired to this package's keys.
 */
import { randomBytes } from 'node:crypto';
import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';
import { FormatError } from '../errors.js';
import { decodeCompactJws, type JoseHeader, type JwtPayload } from '../keys/jws.js';
import { signBytes, verifyBytes, type KeyPair, type PublicJwk } from '../keys/keys.js';
import { base64UrlDecodeToString, base64UrlEncode, sha256, utf8Encode } from '../util/encoding.js';

/**
 * `typ` values of the issuer-signed JWT. `dc+sd-jwt` is the current one (SD-JWT VC draft 19
 * section 2.2.1); `vc+sd-jwt` is the earlier name that Inji's stable releases still issue.
 */
export type SdJwtVcType = 'vc+sd-jwt' | 'dc+sd-jwt';
export const SD_JWT_VC_TYPES: readonly SdJwtVcType[] = ['vc+sd-jwt', 'dc+sd-jwt'];

export interface SdJwtParts {
  issuerJwt: string;
  /** Disclosures as sent (base64url strings), in order. */
  disclosures: string[];
  /** KB-JWT, when the holder added one (SD-JWT+KB). */
  kbJwt?: string;
  /** `<Issuer-signed JWT>~<Disclosure 1>~...~<Disclosure N>~`: the input of `sd_hash`. */
  sdJwtWithoutKb: string;
}

/** Splits `<Issuer-signed JWT>~<Disclosure>~...~[<KB-JWT>]` (RFC 9901 section 4). */
export function splitSdJwt(compact: string): SdJwtParts {
  const text = compact.trim();
  const parts = text.split('~');
  if (parts.length < 2 || parts[0] === '') {
    throw new FormatError('SDJWT_MALFORMED', 'an SD-JWT is "<Issuer-signed JWT>~<Disclosures>~[<KB-JWT>]"', {
      spec: 'RFC 9901 section 4',
    });
  }
  const issuerJwt = parts[0]!;
  const last = parts[parts.length - 1]!;
  const disclosures = parts.slice(1, -1);
  if (disclosures.some((disclosure) => disclosure.length === 0)) {
    throw new FormatError('SDJWT_MALFORMED', 'empty disclosure between "~" separators', {
      spec: 'RFC 9901 section 4',
    });
  }
  const sdJwtWithoutKb = `${[issuerJwt, ...disclosures].join('~')}~`;
  return last === ''
    ? { issuerJwt, disclosures, sdJwtWithoutKb }
    : { issuerJwt, disclosures, kbJwt: last, sdJwtWithoutKb };
}

export interface DecodedDisclosure {
  /** base64url SHA-256 of the disclosure string, as listed in `_sd` (RFC 9901 section 4.2.3). */
  digest: string;
  salt: string;
  /** Claim name; absent for an array element disclosure (RFC 9901 section 4.2.2). */
  name?: string;
  value: unknown;
  encoded: string;
}

export function decodeDisclosure(encoded: string): DecodedDisclosure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecodeToString(encoded));
  } catch (cause) {
    throw new FormatError('SDJWT_DISCLOSURE_INVALID', 'disclosure is not base64url-encoded JSON', {
      cause,
      spec: 'RFC 9901 section 4.2',
    });
  }
  const digest = disclosureDigest(encoded);
  if (
    Array.isArray(parsed) &&
    parsed.length === 3 &&
    typeof parsed[0] === 'string' &&
    typeof parsed[1] === 'string'
  ) {
    return { digest, salt: parsed[0], name: parsed[1], value: parsed[2] as unknown, encoded };
  }
  if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string') {
    return { digest, salt: parsed[0], value: parsed[1] as unknown, encoded };
  }
  throw new FormatError(
    'SDJWT_DISCLOSURE_INVALID',
    'disclosure must be [salt, name, value] or [salt, value]',
    {
      spec: 'RFC 9901 sections 4.2.1 and 4.2.2',
    },
  );
}

export function disclosureDigest(encoded: string): string {
  return base64UrlEncode(sha256(encoded));
}

/** `sd_hash` of a KB-JWT (RFC 9901 section 4.3.1), with the only `_sd_alg` supported here, sha-256. */
export function computeSdHash(sdJwtWithoutKb: string): string {
  return base64UrlEncode(sha256(sdJwtWithoutKb));
}

export interface DecodedSdJwt {
  header: JoseHeader;
  /** Issuer-signed payload as sent: digests in `_sd`, no disclosed values. */
  payload: JwtPayload;
  disclosures: DecodedDisclosure[];
  kb?: { header: JoseHeader; payload: JwtPayload };
}

/** Decodes every part without checking anything, for the protocol inspector and tamper scenarios. */
export function decodeSdJwt(compact: string): DecodedSdJwt {
  const parts = splitSdJwt(compact);
  const { header, payload } = decodeCompactJws(parts.issuerJwt, 'SDJWT_MALFORMED');
  const decoded: DecodedSdJwt = { header, payload, disclosures: parts.disclosures.map(decodeDisclosure) };
  if (parts.kbJwt !== undefined) {
    const kb = decodeCompactJws(parts.kbJwt, 'KB_JWT_MALFORMED');
    decoded.kb = { header: kb.header, payload: kb.payload };
  }
  return decoded;
}

async function hasher(data: string | ArrayBuffer, alg: string): Promise<Uint8Array> {
  if (alg.toLowerCase() !== 'sha-256') {
    throw new FormatError('SDJWT_ALG_REJECTED', `_sd_alg "${alg}" is not supported (only sha-256)`, {
      spec: 'RFC 9901 section 4.1.1',
    });
  }
  return Promise.resolve(sha256(typeof data === 'string' ? data : new Uint8Array(data)));
}

/** 128-bit salts, the minimum RFC 9901 section 9.3 recommends. */
function saltGenerator(length: number): Promise<string> {
  return Promise.resolve(base64UrlEncode(randomBytes(Math.max(length, 16))));
}

const signerFor = (keyPair: KeyPair) => (data: string) =>
  base64UrlEncode(signBytes(keyPair.privateJwk, utf8Encode(data)));

/** Library instance for one operation; keys are bound per call, never shared between roles. */
export function sdJwtLibrary(options: {
  issuerKey?: KeyPair;
  holderKey?: KeyPair;
  issuerPublicJwk?: PublicJwk;
}): SDJwtVcInstance {
  const { issuerKey, holderKey, issuerPublicJwk } = options;
  return new SDJwtVcInstance({
    hasher,
    hashAlg: 'sha-256',
    saltGenerator,
    ...(issuerKey ? { signer: signerFor(issuerKey), signAlg: issuerKey.alg } : {}),
    ...(holderKey ? { kbSigner: signerFor(holderKey), kbSignAlg: holderKey.alg } : {}),
    ...(issuerPublicJwk
      ? {
          verifier: (data: string, signature: string) =>
            verifyBytes(issuerPublicJwk, utf8Encode(data), Buffer.from(signature, 'base64url')),
        }
      : {}),
  });
}
