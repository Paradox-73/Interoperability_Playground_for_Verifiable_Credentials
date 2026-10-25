// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Holder side of SD-JWT VC: choose disclosures and add a Key Binding JWT (RFC 9901 sections 4.3 and 7.2).
 */
import type { PresentationFrame } from '@sd-jwt/core';
import { FormatError, errorMessage } from '../errors.js';
import type { KeyPair } from '../keys/keys.js';
import { sdJwtLibrary, splitSdJwt } from './common.js';

export interface PresentSdJwtVcOptions {
  /** The SD-JWT VC as issued (`<JWT>~<Disclosures>~`). */
  sdJwt: string;
  /**
   * Claims to disclose: top-level claim names, a presentation frame for nested claims, or `all`.
   * Disclosures not chosen are left out (RFC 9901 section 7.2).
   */
  disclose: string[] | PresentationFrame<Record<string, unknown>> | 'all';
  /** Holder key for the KB-JWT. Without it the presentation has no key binding. */
  holderKey?: KeyPair;
  /** KB-JWT `aud`: the verifier's client_id (OpenID4VP 1.0 Appendix B.3.6). */
  audience?: string;
  /** KB-JWT `nonce`: the nonce of the authorization request. */
  nonce?: string;
  issuedAt?: Date;
}

export async function presentSdJwtVc(options: PresentSdJwtVcOptions): Promise<string> {
  const { sdJwtWithoutKb } = splitSdJwt(options.sdJwt);
  const library = sdJwtLibrary(options.holderKey ? { holderKey: options.holderKey } : {});
  let frame: PresentationFrame<Record<string, unknown>> | undefined;
  if (options.disclose === 'all') {
    frame = frameFromPaths(await library.presentableKeys(sdJwtWithoutKb));
  } else if (Array.isArray(options.disclose)) {
    frame = Object.fromEntries(options.disclose.map((name) => [name, true]));
  } else {
    frame = options.disclose;
  }
  let kb: { payload: { iat: number; aud: string; nonce: string } } | undefined;
  if (options.holderKey) {
    if (options.audience === undefined || options.nonce === undefined) {
      throw new FormatError('KB_JWT_MALFORMED', 'a KB-JWT needs both aud and nonce', {
        spec: 'RFC 9901 section 4.3',
      });
    }
    kb = {
      payload: {
        iat: Math.floor((options.issuedAt ?? new Date()).getTime() / 1000),
        aud: options.audience,
        nonce: options.nonce,
      },
    };
  }
  try {
    return await library.present(sdJwtWithoutKb, frame, kb ? { kb } : {});
  } catch (cause) {
    throw new FormatError('SDJWT_MALFORMED', `cannot present SD-JWT VC: ${errorMessage(cause)}`, { cause });
  }
}

/**
 * Turns the library's encoded claim paths (`address.street`, segments escaped `~0` for `~` and `~1`
 * for `.`) into a presentation frame that selects every one of them, nested claims included.
 */
function frameFromPaths(paths: string[]): PresentationFrame<Record<string, unknown>> {
  const frame: Record<string, unknown> = {};
  for (const path of paths) {
    const segments = path.split('.').map((segment) => segment.replace(/~1/g, '.').replace(/~0/g, '~'));
    let node = frame;
    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        node[segment] ??= true;
        return;
      }
      if (typeof node[segment] !== 'object') node[segment] = {};
      node = node[segment] as Record<string, unknown>;
    });
  }
  return frame as PresentationFrame<Record<string, unknown>>;
}
