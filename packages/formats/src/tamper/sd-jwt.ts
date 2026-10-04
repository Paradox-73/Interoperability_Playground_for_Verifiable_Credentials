/**
 * Tamper primitives for SD-JWT VC (RFC 9901, draft-ietf-oauth-sd-jwt-vc-19). Each one returns a
 * changed compact SD-JWT that a correct verifier must reject, and names the rule that rejects it.
 *
 * Primitives that change the issuer-signed part or the disclosures keep an existing KB-JWT as it
 * was: its `sd_hash` then no longer covers what is presented. To make the verifier's disclosure or
 * signature check the only one that fails, follow them with `resignKeyBinding` (the holder signs a
 * KB-JWT over the tampered SD-JWT). Disclosure tampering has to be done on the presentation this way:
 * a holder library (`@sd-jwt/core`) refuses to present a credential whose disclosures it cannot match.
 */
import { randomBytes } from 'node:crypto';
import { decodeCompactJws, signCompactJws, type JoseHeader } from '../keys/jws.js';
import { generateKeyPair, type KeyPair } from '../keys/keys.js';
import { createTestCertificate, type TestCertificate } from '../keys/x509.js';
import { computeSdHash, decodeDisclosure, splitSdJwt, type SdJwtParts } from '../sd-jwt/common.js';
import { base64UrlEncode } from '../util/encoding.js';
import { flipJwsSignature, resignJws } from './jws.js';

/** Puts the parts back together: `<JWT>~<D1>~...~<Dn>~[<KB-JWT>]`. */
export function joinSdJwt(parts: Pick<SdJwtParts, 'issuerJwt' | 'disclosures' | 'kbJwt'>): string {
  return `${[parts.issuerJwt, ...parts.disclosures].join('~')}~${parts.kbJwt ?? ''}`;
}

/**
 * Flips one byte of the issuer signature (RFC 9901 section 7.1 step 2b must then fail).
 * Disclosures and any KB-JWT are kept.
 */
export function flipSdJwtIssuerSignature(sdJwt: string, index?: number): string {
  const parts = splitSdJwt(sdJwt);
  return joinSdJwt({ ...parts, issuerJwt: flipJwsSignature(parts.issuerJwt, index) });
}

/**
 * Flips one byte of the KB-JWT signature (RFC 9901 section 7.3 step 5c must then fail).
 */
export function flipKeyBindingSignature(sdJwt: string, index?: number): string {
  const parts = splitSdJwt(sdJwt);
  if (parts.kbJwt === undefined) throw new TypeError('the SD-JWT has no KB-JWT to tamper with');
  return joinSdJwt({ ...parts, kbJwt: flipJwsSignature(parts.kbJwt, index) });
}

function findDisclosure(parts: SdJwtParts, claim: string): number {
  const index = parts.disclosures.findIndex((encoded) => decodeDisclosure(encoded).name === claim);
  if (index < 0) throw new TypeError(`the SD-JWT has no disclosure for claim "${claim}"`);
  return index;
}

/**
 * Replaces the value of the disclosure of `claim`, keeping its salt and name. The new disclosure's
 * digest is not in any `_sd` array, so RFC 9901 section 7.1 step 3 (every disclosure must be
 * referenced by a digest) rejects it.
 */
export function alterDisclosure(sdJwt: string, claim: string, value: unknown): string {
  const parts = splitSdJwt(sdJwt);
  const index = findDisclosure(parts, claim);
  const original = decodeDisclosure(parts.disclosures[index]!);
  const disclosures = [...parts.disclosures];
  disclosures[index] = base64UrlEncode(JSON.stringify([original.salt, claim, value]));
  return joinSdJwt({ ...parts, disclosures });
}

/**
 * Appends a disclosure the issuer never signed (fresh salt, any claim). RFC 9901 section 7.1 step 3
 * rejects an SD-JWT with a disclosure whose digest the issuer-signed JWT does not contain.
 */
export function addUnreferencedDisclosure(sdJwt: string, claim: string, value: unknown): string {
  const parts = splitSdJwt(sdJwt);
  const salt = base64UrlEncode(randomBytes(16));
  const extra = base64UrlEncode(JSON.stringify([salt, claim, value]));
  return joinSdJwt({ ...parts, disclosures: [...parts.disclosures, extra] });
}

/**
 * Removes the disclosure of `claim`. Leaving out a disclosure is legitimate selective disclosure
 * (RFC 9901 section 7.2), so on a credential this is not an attack; on a presentation it breaks the
 * KB-JWT's `sd_hash` (section 7.3 step 5g), which is what a scenario uses it for.
 */
export function dropDisclosure(sdJwt: string, claim: string): string {
  const parts = splitSdJwt(sdJwt);
  const index = findDisclosure(parts, claim);
  return joinSdJwt({ ...parts, disclosures: parts.disclosures.filter((_, position) => position !== index) });
}

export interface KeyBindingChanges {
  nonce?: string;
  aud?: string;
  /** Seconds since the epoch. */
  iat?: number;
  /** Any other payload member; `undefined` removes it. */
  payload?: Record<string, unknown>;
}

/**
 * Signs the KB-JWT again with `holderKey` after changing its claims. `sd_hash` is recomputed over the
 * SD-JWT as presented, so only the changed claims differ from a correct presentation: a wrong
 * `nonce` or `aud` is then caught by RFC 9901 section 7.3 step 5f alone.
 *
 * With a key that is not the one in `cnf`, the result is a presentation by another holder, caught by
 * step 5c (KB-JWT signature).
 */
export function resignKeyBinding(sdJwt: string, changes: KeyBindingChanges, holderKey: KeyPair): string {
  const parts = splitSdJwt(sdJwt);
  if (parts.kbJwt === undefined) throw new TypeError('the SD-JWT has no KB-JWT to sign again');
  const payload: Record<string, unknown> = {
    ...changes.payload,
    sd_hash: computeSdHash(parts.sdJwtWithoutKb),
    ...(changes.nonce === undefined ? {} : { nonce: changes.nonce }),
    ...(changes.aud === undefined ? {} : { aud: changes.aud }),
    ...(changes.iat === undefined ? {} : { iat: changes.iat }),
  };
  return joinSdJwt({ ...parts, kbJwt: resignJws(parts.kbJwt, { payload }, holderKey) });
}

export interface ForgedX5c {
  /** The forged SD-JWT, without a KB-JWT (the holder adds one when presenting). */
  sdJwt: string;
  /** The forger's key and its self-signed certificate (test-only, generated on every call). */
  keyPair: KeyPair;
  certificate: TestCertificate;
}

export interface ForgeX5cOptions {
  /** The forger's key; default a fresh P-256 key. */
  keyPair?: KeyPair;
  /** Subject of the self-signed certificate; default names a made-up issuer. */
  subject?: string;
  /** DNS names for the certificate, for example the host of the `iss` URL the forger claims. */
  dnsNames?: string[];
  /** Payload members to change while forging (for example a claim value); `undefined` removes one. */
  payload?: Record<string, unknown>;
}

/**
 * Re-signs the issuer-signed JWT with the forger's own key, naming that key by a self-signed
 * certificate in `x5c` instead of the issuer's `kid`. Payload, `iss`, `cnf` and disclosures stay, so
 * the credential still looks like the issuer's and the holder can still present it.
 *
 * A verifier must reject it: an `x5c` chain has to end at a trust anchor the verifier configured
 * (SD-JWT VC draft 19 section 2.5; RFC 7515 section 4.1.6), and a key the forger made up cannot.
 * This is the probe of gap G7 (a verifier that checks the signature against the leaf certificate
 * without validating the chain).
 */
export async function forgeWithSelfSignedX5c(
  sdJwt: string,
  options: ForgeX5cOptions = {},
): Promise<ForgedX5c> {
  const parts = splitSdJwt(sdJwt);
  const keyPair = options.keyPair ?? generateKeyPair('ES256');
  const certificate = await createTestCertificate({
    subject: options.subject ?? 'CN=Forged Issuer, O=Inji Interop Playground tamper test (test only)',
    keyPair,
    ...(options.dnsNames ? { dnsNames: options.dnsNames } : {}),
  });
  const decoded = decodeCompactJws(parts.issuerJwt);
  const { kid: _kid, x5c: _x5c, alg: _alg, ...rest } = decoded.header;
  const header: JoseHeader = { ...rest, x5c: [certificate.x5c] };
  const payload: Record<string, unknown> = { ...decoded.payload };
  for (const [name, value] of Object.entries(options.payload ?? {})) {
    if (value === undefined) delete payload[name];
    else payload[name] = value;
  }
  const issuerJwt = signCompactJws(header, payload, keyPair);
  return { sdJwt: joinSdJwt({ issuerJwt, disclosures: parts.disclosures }), keyPair, certificate };
}
