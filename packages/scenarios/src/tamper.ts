/**
 * Carries out a scenario's credential and presentation tampering with the primitives of
 * `@inji-playground/formats/tamper`.
 *
 * Presentation tampering works on the encoded `vp_token` form field exactly as the wallet would post
 * it (OpenID4VP 1.0 section 8.1): a JSON string or object for one presentation, an array for several
 * (drafts), or an object keyed by DCQL credential query id (1.0). Every presentation inside is changed.
 */
import { randomBytes } from 'node:crypto';
import {
  addUnreferencedDisclosure,
  alterDisclosure,
  flipProofValue,
  flipSdJwtIssuerSignature,
  forgeWithSelfSignedX5c,
  representLdpVp,
  resignKeyBinding,
} from '@inji-playground/formats/tamper';
import {
  createDidKey,
  decodeSdJwt,
  didKeyVerificationMethodId,
  generateKeyPair,
  isRecord,
  type DocumentLoader,
  type JsonObject,
  type KeyPair,
} from '@inji-playground/formats';
import type { VpProfile } from '@inji-playground/protocol';
import type { CredentialTamper, PresentationTamper } from './catalogue.js';

const isSdJwt = (format: string): boolean => format === 'vc+sd-jwt' || format === 'dc+sd-jwt';

/** A credential as a wallet holds it: the format and the raw text (JSON for ldp_vc). */
export interface RawCredential {
  /** A `CredentialFormat`, or the format id another role reported. */
  format: string;
  raw: string;
}

/** Returns the raw credential after `tamper`; the input is not changed. */
export async function tamperCredential(tamper: CredentialTamper, credential: RawCredential): Promise<string> {
  switch (tamper) {
    case 'flip-issuer-signature':
      if (isSdJwt(credential.format)) return flipSdJwtIssuerSignature(credential.raw);
      if (credential.format === 'ldp_vc') {
        return JSON.stringify(flipProofValue(JSON.parse(credential.raw) as JsonObject));
      }
      break;
    case 'forge-x5c':
      if (isSdJwt(credential.format)) return (await forgeWithSelfSignedX5c(credential.raw)).sdJwt;
      break;
  }
  throw new TypeError(`credential tamper "${tamper}" does not apply to format ${credential.format}`);
}

/** What a presentation tamper needs from the wallet and the request it answers. */
export interface PresentationTamperContext {
  /** A `CredentialFormat`, or the format id another role reported. */
  format: string;
  profile: VpProfile;
  /** Nonce and client_id of the request being answered. */
  nonce: string;
  clientId: string;
  /** The wallet's own holder key, to sign a KB-JWT again after a change. */
  holderKey: KeyPair;
  /** JSON-LD document loader, to sign an ldp_vp again (`present-as-other-holder`). */
  documentLoader?: DocumentLoader;
  /** A `vp_token` form field the wallet posted to an earlier request (`replay-earlier`). */
  earlierVpToken?: string;
}

/** Audience of a verifier that is not the one asking (for `kb-wrong-aud`). */
export const OTHER_VERIFIER_CLIENT_ID = 'redirect_uri:https://other-verifier.ps02.test/response';
/** Claim added by `add-unreferenced-disclosure`. */
export const INJECTED_CLAIM = 'playgroundInjectedClaim';

/** Returns the `vp_token` form field after `tamper`. */
export async function tamperPresentation(
  tamper: PresentationTamper,
  vpTokenField: string,
  context: PresentationTamperContext,
): Promise<string> {
  if (tamper === 'replay-earlier') {
    if (context.earlierVpToken === undefined) {
      throw new TypeError('replay-earlier needs a vp_token the wallet sent to an earlier request');
    }
    return context.earlierVpToken;
  }
  return mapPresentations(vpTokenField, context.profile, (presentation) =>
    tamperOne(tamper, presentation, context),
  );
}

async function tamperOne(
  tamper: Exclude<PresentationTamper, 'replay-earlier'>,
  presentation: unknown,
  context: PresentationTamperContext,
): Promise<unknown> {
  if (typeof presentation === 'string' && isSdJwt(context.format)) {
    const holder = context.holderKey;
    switch (tamper) {
      case 'alter-disclosure': {
        const target = decodeSdJwt(presentation).disclosures.find((disclosure) => disclosure.name);
        if (!target?.name) throw new TypeError('the presentation discloses no named claim to alter');
        const altered = typeof target.value === 'string' ? `${target.value} (altered)` : 'altered';
        return resignKeyBinding(alterDisclosure(presentation, target.name, altered), {}, holder);
      }
      case 'add-unreferenced-disclosure':
        return resignKeyBinding(addUnreferencedDisclosure(presentation, INJECTED_CLAIM, true), {}, holder);
      case 'kb-wrong-nonce':
        return resignKeyBinding(presentation, { nonce: randomBytes(16).toString('base64url') }, holder);
      case 'kb-wrong-aud':
        return resignKeyBinding(presentation, { aud: OTHER_VERIFIER_CLIENT_ID }, holder);
      case 'present-as-other-holder':
        return resignKeyBinding(presentation, {}, generateKeyPair(holder.alg));
    }
  }
  if (isRecord(presentation) && context.format === 'ldp_vc' && tamper === 'present-as-other-holder') {
    if (!context.documentLoader)
      throw new TypeError('present-as-other-holder needs a document loader for ldp_vp');
    const keyPair = generateKeyPair('EdDSA');
    const did = createDidKey(keyPair.publicJwk);
    return representLdpVp(presentation, {
      key: { keyPair, verificationMethod: didKeyVerificationMethodId(did) },
      challenge: context.nonce,
      domain: context.clientId,
      documentLoader: context.documentLoader,
    });
  }
  throw new TypeError(`presentation tamper "${tamper}" does not apply to format ${context.format}`);
}

/**
 * Applies `change` to every presentation in a `vp_token` form field and encodes the result the same
 * way. `final-1.0` tokens are objects keyed by credential query id with an array of presentations each;
 * draft tokens are one presentation (a JSON string for SD-JWT, an object for ldp_vp) or an array.
 */
export async function mapPresentations(
  vpTokenField: string,
  profile: VpProfile,
  change: (presentation: unknown) => Promise<unknown>,
): Promise<string> {
  const token: unknown = JSON.parse(vpTokenField);
  if (profile === 'final-1.0' && isRecord(token)) {
    const changed: Record<string, unknown[]> = {};
    for (const [queryId, value] of Object.entries(token)) {
      const list = Array.isArray(value) ? value : [value];
      changed[queryId] = await Promise.all(list.map(change));
    }
    return JSON.stringify(changed);
  }
  if (Array.isArray(token)) return JSON.stringify(await Promise.all(token.map(change)));
  return JSON.stringify(await change(token));
}
