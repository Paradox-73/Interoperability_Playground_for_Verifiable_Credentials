/**
 * The JSON a query is evaluated against, for each format: the credential itself for `ldp_vc`, and the
 * SD-JWT payload with every disclosure put back in place for SD-JWT VC (RFC 9901 section 7.1 step 3,
 * without the signature checks, which belong to the verifier).
 */
import {
  decodeSdJwt,
  disclosureDigest,
  isRecord,
  splitSdJwt,
  type JsonObject,
} from '@inji-playground/formats';
import { isSdJwtVcFormat, type PresentableFormat } from '../common/constants.js';
import { Oid4vpError } from '../common/errors.js';

/** A credential as a wallet holds it; `HeldCredential` of the protocol package fits this shape. */
export interface StoredCredential {
  id: string;
  /** Any format string; only `ldp_vc`, `vc+sd-jwt` and `dc+sd-jwt` can be presented. */
  format: string;
  /** JSON string for `ldp_vc`, compact SD-JWT (`<JWT>~<disclosures>~`) for SD-JWT VC. */
  raw: string;
}

export interface CredentialView {
  format: PresentableFormat;
  /** Claims as the query sees them. */
  json: JsonObject;
  /** `type` of a W3C credential, empty for SD-JWT VC. */
  types: string[];
  /** `vct` of an SD-JWT VC. */
  vct?: string;
}

export function credentialView(credential: StoredCredential): CredentialView {
  if (credential.format === 'ldp_vc') {
    let json: unknown;
    try {
      json = JSON.parse(credential.raw);
    } catch (cause) {
      throw new Oid4vpError('NO_MATCHING_CREDENTIAL', `credential ${credential.id} is not JSON`, { cause });
    }
    if (!isRecord(json))
      throw new Oid4vpError('NO_MATCHING_CREDENTIAL', `credential ${credential.id} is not an object`);
    return { format: 'ldp_vc', json, types: credentialTypes(json) };
  }
  if (isSdJwtVcFormat(credential.format)) {
    const json = sdJwtClaims(credential.raw);
    return {
      format: credential.format,
      json,
      types: [],
      ...(typeof json.vct === 'string' ? { vct: json.vct } : {}),
    };
  }
  throw new Oid4vpError('NO_MATCHING_CREDENTIAL', `format ${credential.format} cannot be presented`);
}

export function credentialTypes(credential: JsonObject): string[] {
  const type = credential.type;
  if (typeof type === 'string') return [type];
  return Array.isArray(type) ? type.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** SD-JWT payload with disclosed claims inserted and `_sd` / `_sd_alg` removed. */
export function sdJwtClaims(compact: string): JsonObject {
  const decoded = decodeSdJwt(compact);
  const byDigest = new Map<string, unknown[]>();
  for (const encoded of splitSdJwt(compact).disclosures) {
    const disclosure = decodeDisclosureArray(encoded);
    if (disclosure) byDigest.set(disclosureDigest(encoded), disclosure);
  }
  const rebuilt = expand(decoded.payload, byDigest);
  if (!isRecord(rebuilt)) return {};
  delete rebuilt._sd_alg;
  return rebuilt;
}

function decodeDisclosureArray(encoded: string): unknown[] | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function expand(value: unknown, byDigest: Map<string, unknown[]>): unknown {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const element of value) {
      // Array element disclosure: {"...": digest} (RFC 9901 section 4.2.4.2).
      if (isRecord(element) && typeof element['...'] === 'string' && Object.keys(element).length === 1) {
        const disclosure = byDigest.get(element['...']);
        if (disclosure?.length === 2) out.push(expand(disclosure[1], byDigest));
        continue;
      }
      out.push(expand(element, byDigest));
    }
    return out;
  }
  if (!isRecord(value)) return value;
  const out: JsonObject = {};
  for (const [name, member] of Object.entries(value)) {
    if (name === '_sd') continue;
    out[name] = expand(member, byDigest);
  }
  const digests = Array.isArray(value._sd) ? value._sd : [];
  for (const digest of digests) {
    const disclosure = typeof digest === 'string' ? byDigest.get(digest) : undefined;
    if (disclosure?.length === 3 && typeof disclosure[1] === 'string') {
      out[disclosure[1]] = expand(disclosure[2], byDigest);
    }
  }
  return out;
}
