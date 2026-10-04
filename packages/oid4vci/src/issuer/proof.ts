/**
 * Validation of key proof JWTs (OpenID4VCI draft 13 section 7.2.1.1, 1.0 Appendix F.1 and F.4).
 *
 * Checks, in order: the JWT parses; `typ` is `openid4vci-proof+jwt`; `alg` is an accepted asymmetric
 * algorithm; exactly one of `kid` (a did:jwk or did:key URL) or `jwk` names the key; the signature
 * verifies with that key; `aud` is the credential issuer; `iat` is inside the allowed window. The
 * nonce is checked last by the caller, so a nonce problem is reported as such only when everything
 * else is right (it is the one error a wallet can repair by retrying).
 */
import {
  createDidJwk,
  createDidResolver,
  decodeCompactJws,
  toPublicJwk,
  verifyDecodedJws,
  type PublicJwk,
} from '@inji-playground/formats';
import { PROOF_JWT_TYP } from '../common/constants.js';
import { OAuthError } from '../common/errors.js';
import { PROOF_SIGNING_ALGS } from './configurations.js';

/** The holder key a credential will be bound to. */
export interface HolderBinding {
  publicJwk: PublicJwk;
  /** DID of the holder: from `kid`, or the did:jwk of the `jwk` header. */
  did: string;
  /** `kid` exactly as the wallet sent it (a DID URL), when it used one. */
  kid?: string;
  /** JOSE algorithm of the proof, for the run report ("holder proof"). */
  alg: string;
}

export interface ValidatedProof {
  holder: HolderBinding;
  nonce: string | undefined;
  payload: Record<string, unknown>;
}

export interface ProofCheckOptions {
  /** The credential issuer identifier the proof must name in `aud`. */
  audience: string;
  nowSeconds: number;
  /** How old `iat` may be, in seconds. */
  maxAgeSeconds: number;
  /** How far in the future `iat` may be (clock skew), in seconds. */
  skewSeconds: number;
}

// did:jwk and did:key resolve without network access; did:web holder keys are not accepted.
const holderDidResolver = createDidResolver({ methods: ['jwk', 'key'] });

const invalidProof = (description: string) => new OAuthError('invalid_proof', description);

export async function validateProofJwt(jwt: unknown, options: ProofCheckOptions): Promise<ValidatedProof> {
  if (typeof jwt !== 'string' || jwt.length === 0) throw invalidProof('proof jwt is missing');
  let decoded;
  try {
    decoded = decodeCompactJws(jwt);
  } catch {
    throw invalidProof('proof is not a compact JWS');
  }
  const { header, payload } = decoded;
  if (header.typ !== PROOF_JWT_TYP) {
    throw invalidProof(`proof typ must be ${PROOF_JWT_TYP}, got ${String(header.typ)}`);
  }
  const alg = header.alg;
  if (
    typeof alg !== 'string' ||
    !(PROOF_SIGNING_ALGS as readonly string[]).includes(alg === 'Ed25519' ? 'EdDSA' : alg)
  ) {
    throw invalidProof(
      `proof alg ${String(alg)} is not accepted; use one of ${PROOF_SIGNING_ALGS.join(', ')}`,
    );
  }
  const keyMembers = ['kid', 'jwk', 'x5c'].filter((name) => header[name] !== undefined);
  if (keyMembers.length !== 1) {
    throw invalidProof(
      'proof header must name the key with exactly one of kid or jwk (x5c is not supported)',
    );
  }

  let holder: HolderBinding;
  if (header.jwk !== undefined) {
    let publicJwk: PublicJwk;
    try {
      publicJwk = toPublicJwk(header.jwk);
    } catch (cause) {
      throw invalidProof(
        `proof jwk is not a supported public key: ${cause instanceof Error ? cause.message : ''}`,
      );
    }
    if ('d' in (header.jwk as Record<string, unknown>))
      throw invalidProof('proof jwk contains a private key');
    holder = { publicJwk, did: createDidJwk(publicJwk), alg };
  } else if (typeof header.kid === 'string') {
    if (!header.kid.startsWith('did:'))
      throw invalidProof('proof kid must be a DID URL (did:jwk or did:key)');
    try {
      const resolved = await holderDidResolver.resolveVerificationMethod(header.kid, 'authentication');
      holder = {
        publicJwk: resolved.publicJwk,
        did: header.kid.split('#')[0]!,
        kid: header.kid,
        alg,
      };
    } catch (cause) {
      throw invalidProof(
        `proof kid cannot be resolved: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  } else {
    throw invalidProof('proof key must be given as kid or jwk; x5c is not supported');
  }

  if (!verifyDecodedJws(decoded, holder.publicJwk)) throw invalidProof('proof signature does not verify');

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(options.audience)) {
    throw invalidProof(
      `proof aud must be the credential issuer ${options.audience}, got ${JSON.stringify(payload.aud)}`,
    );
  }
  if (typeof payload.iat !== 'number') throw invalidProof('proof iat is missing');
  if (payload.iat > options.nowSeconds + options.skewSeconds)
    throw invalidProof('proof iat is in the future');
  if (payload.iat < options.nowSeconds - options.maxAgeSeconds) {
    throw invalidProof(`proof iat is older than ${options.maxAgeSeconds} s`);
  }
  const nonce = typeof payload.nonce === 'string' ? payload.nonce : undefined;
  return { holder, nonce, payload };
}
