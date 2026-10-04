/**
 * Issuing SD-JWT VCs (draft-ietf-oauth-sd-jwt-vc-19 on RFC 9901).
 */
import type { DisclosureFrame } from '@sd-jwt/core';
import { FormatError, errorMessage } from '../errors.js';
import { toPublicJwk, type KeyPair, type PublicJwk } from '../keys/keys.js';
import { sdJwtLibrary, type SdJwtVcType } from './common.js';

/** How the issuer's key is named in the JOSE header: by `kid` (a DID URL for Inji), or by `x5c`. */
export interface SdJwtIssuerKey {
  keyPair: KeyPair;
  kid?: string;
  /** Certificate chain, end-entity first, each element base64 DER. */
  x5c?: string[];
}

/** Holder key for key binding: the key itself (`cnf.jwk`) or a reference to it (`cnf.kid`, a DID URL). */
export type HolderBinding = { jwk: PublicJwk } | { kid: string };

/**
 * Which claims become disclosures (RFC 9901 section 4.2). `_sd` lists the keys of this object (or the
 * indexes of this array) that are selectively disclosable; a nested object or array claim gets its own
 * frame under its name, for example `{ _sd: ['address'], address: { _sd: ['street'] } }`.
 * `_sd_decoy` adds that many decoy digests (section 4.2.5).
 */
export interface SdJwtDisclosureFrame {
  _sd?: (string | number)[];
  _sd_decoy?: number;
  [claim: string]: SdJwtDisclosureFrame | (string | number)[] | number | undefined;
}

export interface IssueSdJwtVcOptions {
  issuer: SdJwtIssuerKey;
  /** Default `dc+sd-jwt`; `vc+sd-jwt` for Inji stable compatibility. */
  typ?: SdJwtVcType;
  vct: string;
  /** Issuer identifier; for a DID-identified issuer this is the DID. */
  iss?: string;
  /** Credential claims (not the registered ones below). */
  claims: Record<string, unknown>;
  /**
   * Claims that may be disclosed selectively. Default: every top-level claim in `claims`.
   * `disclosureFrame` takes precedence for nested or array disclosures.
   */
  disclosable?: string[];
  disclosureFrame?: SdJwtDisclosureFrame;
  holder?: HolderBinding;
  issuedAt?: Date;
  notBefore?: Date;
  expiresAt?: Date;
  /** Extra header parameters (tamper scenarios use this; normal issuance does not need it). */
  extraHeader?: Record<string, unknown>;
}

const seconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/**
 * Issues an SD-JWT VC and returns `<Issuer-signed JWT>~<Disclosure>~...~` (no KB-JWT: that is added by
 * the holder at presentation time). Registered claims `iss`, `nbf`, `exp`, `cnf`, `vct` and `status`
 * stay in the clear: they must not be selectively disclosed (SD-JWT VC draft 19 section 2.2.2.3).
 */
export async function issueSdJwtVc(options: IssueSdJwtVcOptions): Promise<string> {
  const reserved = ['iss', 'nbf', 'exp', 'cnf', 'vct', 'status', 'iat', '_sd', '_sd_alg', '...'];
  const clash = Object.keys(options.claims).find((name) => reserved.includes(name));
  if (clash) {
    throw new FormatError(
      'SDJWT_MALFORMED',
      `claim "${clash}" is set through its own option, not through claims`,
    );
  }
  const payload: Record<string, unknown> = {
    ...(options.iss === undefined ? {} : { iss: options.iss }),
    iat: seconds(options.issuedAt ?? new Date()),
    ...(options.notBefore ? { nbf: seconds(options.notBefore) } : {}),
    ...(options.expiresAt ? { exp: seconds(options.expiresAt) } : {}),
    vct: options.vct,
    ...(options.holder
      ? {
          cnf:
            'jwk' in options.holder ? { jwk: toPublicJwk(options.holder.jwk) } : { kid: options.holder.kid },
        }
      : {}),
    ...options.claims,
  };
  const frame: SdJwtDisclosureFrame = options.disclosureFrame ?? {
    _sd: options.disclosable ?? Object.keys(options.claims),
  };
  const header: Record<string, unknown> = {
    ...options.extraHeader,
    typ: options.typ ?? 'dc+sd-jwt',
    ...(options.issuer.kid === undefined ? {} : { kid: options.issuer.kid }),
    ...(options.issuer.x5c === undefined ? {} : { x5c: options.issuer.x5c }),
  };
  try {
    return await sdJwtLibrary({ issuerKey: options.issuer.keyPair }).issue(
      payload as Record<string, unknown> & { vct: string },
      // The library's frame type is derived from the payload type, which is open here.
      frame as unknown as DisclosureFrame<Record<string, unknown> & { vct: string }>,
      { header },
    );
  } catch (cause) {
    if (cause instanceof FormatError) throw cause;
    throw new FormatError('SDJWT_MALFORMED', `cannot issue SD-JWT VC: ${errorMessage(cause)}`, { cause });
  }
}
