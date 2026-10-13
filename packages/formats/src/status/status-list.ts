/**
 * Credential status (revocation and suspension) through a status list the issuer publishes:
 *
 * - SD-JWT VC: Token Status List (draft-ietf-oauth-status-list-21). The credential carries
 *   `status.status_list = { idx, uri }`; `uri` serves a JWT (`typ` `statuslist+jwt`) whose
 *   `status_list.lst` is the base64url ZLIB-compressed list, `bits` bits per credential, the first
 *   credential in the least significant bits of the first byte (section 4.1). 0 = valid, 1 = invalid,
 *   2 = suspended (section 7.1).
 * - ldp_vc: Bitstring Status List v1.0. `credentialStatus` is a `BitstringStatusListEntry` naming a
 *   status list credential and an index; its `encodedList` is a multibase base64url GZIP-compressed
 *   bitstring whose index 0 is the left-most bit, at least 131,072 entries long.
 *
 * The list must be signed by the credential's own issuer, so nobody else can revoke or un-revoke it.
 */
import { gunzipSync, gzipSync, inflateSync, deflateSync } from 'node:zlib';
import type { DidResolver } from '../did/resolver.js';
import { FormatError, errorMessage } from '../errors.js';
import type { DocumentLoader } from '../jsonld/document-loader.js';
import { decodeCompactJws, signCompactJws, verifyDecodedJws } from '../keys/jws.js';
import type { KeyPair } from '../keys/keys.js';
import { verifyLdpVc } from '../ldp/credential.js';
import { base64UrlDecode, base64UrlEncode, isRecord } from '../util/encoding.js';
import { fetchLimited, type FetchLimits } from '../util/limited-fetch.js';

export type StatusEntry =
  | { kind: 'token-status-list'; uri: string; idx: number }
  | { kind: 'bitstring'; statusListCredential: string; statusListIndex: number; statusPurpose: string }
  /** A status mechanism this module does not implement; reported, never treated as checked. */
  | { kind: 'unsupported'; type: string };

const TOKEN_STATUS_SPEC = 'draft-ietf-oauth-status-list-21';
const BITSTRING_SPEC = 'W3C Bitstring Status List v1.0';
/** Smallest bitstring the specification allows (16 KB, for group privacy). */
export const BITSTRING_MIN_ENTRIES = 131_072;
/** Decompressed lists are refused above this size (a small compressed body can inflate a lot). */
const MAX_LIST_BYTES = 8 * 1024 * 1024;

/**
 * The status entries of a credential: SD-JWT VC claims (`status`) or an ldp_vc (`credentialStatus`).
 * Empty when it has none.
 */
export function statusEntriesOf(credential: Record<string, unknown>): StatusEntry[] {
  const status = credential.status;
  if (isRecord(status)) {
    const list = status.status_list;
    if (!isRecord(list) || typeof list.uri !== 'string' || !Number.isSafeInteger(list.idx)) {
      const types = Object.keys(status);
      return [{ kind: 'unsupported', type: types.length > 0 ? types.join(', ') : 'status' }];
    }
    return [{ kind: 'token-status-list', uri: list.uri, idx: list.idx as number }];
  }
  const raw = credential.credentialStatus;
  if (raw === undefined) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((entry): StatusEntry => {
    const type = isRecord(entry) ? entry.type : undefined;
    if (!isRecord(entry) || type !== 'BitstringStatusListEntry') {
      return { kind: 'unsupported', type: typeof type === 'string' ? type : 'credentialStatus' };
    }
    const index = Number(entry.statusListIndex);
    if (
      typeof entry.statusListCredential !== 'string' ||
      typeof entry.statusPurpose !== 'string' ||
      !Number.isSafeInteger(index) ||
      index < 0
    ) {
      throw new FormatError('STATUS_LIST_INVALID', 'a BitstringStatusListEntry is malformed', {
        spec: `${BITSTRING_SPEC} section 2.1`,
        details: { entry },
      });
    }
    return {
      kind: 'bitstring',
      statusListCredential: entry.statusListCredential,
      statusListIndex: index,
      statusPurpose: entry.statusPurpose,
    };
  });
}

export interface StatusCheckOptions extends FetchLimits {
  /** The credential's issuer as verified (its DID); the list must be signed by it. */
  issuer: string;
  didResolver: DidResolver;
  documentLoader: DocumentLoader;
  now?: Date;
}

/**
 * Fetches the list an entry names, checks it is the issuer's and current, and reads the credential's
 * status. Resolves with a line for the report when the credential is valid; rejects with
 * `STATUS_REVOKED` or `STATUS_SUSPENDED` when it is not, and with `STATUS_LIST_*` when the list cannot be
 * used. An `unsupported` entry is the caller's to report: it rejects here.
 */
export async function checkStatusEntry(entry: StatusEntry, options: StatusCheckOptions): Promise<string> {
  switch (entry.kind) {
    case 'token-status-list':
      return checkTokenStatusList(entry, options);
    case 'bitstring':
      return checkBitstringStatusList(entry, options);
    case 'unsupported':
      throw new FormatError('STATUS_LIST_INVALID', `status type ${entry.type} is not supported`);
  }
}

async function checkTokenStatusList(
  entry: Extract<StatusEntry, { kind: 'token-status-list' }>,
  options: StatusCheckOptions,
): Promise<string> {
  const token = await fetchLimited(
    {
      url: entry.uri,
      accept: 'application/statuslist+jwt',
      codes: { insecure: 'STATUS_LIST_UNAVAILABLE', failed: 'STATUS_LIST_UNAVAILABLE' },
    },
    options,
  );
  const invalid = (message: string, section: string, details?: Record<string, unknown>) =>
    new FormatError('STATUS_LIST_INVALID', message, {
      spec: `${TOKEN_STATUS_SPEC} ${section}`,
      details: { uri: entry.uri, ...details },
    });
  const decoded = decodeCompactJws(token.trim(), 'STATUS_LIST_INVALID');
  const { header, payload } = decoded;
  if (header.typ !== 'statuslist+jwt') {
    throw invalid('the status list token must have typ statuslist+jwt', 'section 5.1', { typ: header.typ });
  }
  if (typeof header.kid !== 'string' || header.kid.split('#')[0] !== options.issuer) {
    throw invalid('the status list token is not signed by a key of the credential issuer', 'section 8.3', {
      kid: header.kid,
      issuer: options.issuer,
    });
  }
  let key;
  try {
    key = await options.didResolver.resolveVerificationMethod(header.kid, 'assertionMethod');
  } catch (cause) {
    throw invalid(`cannot resolve the status list token key: ${errorMessage(cause)}`, 'section 8.3');
  }
  if (!verifyDecodedJws(decoded, key.publicJwk)) {
    throw invalid('the status list token signature is invalid', 'section 8.3');
  }
  if (payload.sub !== entry.uri) {
    throw invalid('the status list token sub is not the uri the credential names', 'section 8.3 step 4a', {
      sub: payload.sub,
    });
  }
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw invalid('the status list token has expired', 'section 8.3 step 4c', { exp: payload.exp });
  }
  const list = payload.status_list;
  if (!isRecord(list) || typeof list.lst !== 'string' || ![1, 2, 4, 8].includes(list.bits as number)) {
    throw invalid('status_list needs bits (1, 2, 4 or 8) and lst', 'section 4.2');
  }
  const status = tokenStatusAt(list.lst, list.bits as number, entry.idx);
  if (status === 0) return `valid (Token Status List, idx ${entry.idx})`;
  throw new FormatError(
    status === 2 ? 'STATUS_SUSPENDED' : 'STATUS_REVOKED',
    status === 2 ? 'the credential is suspended' : 'the credential is revoked',
    { spec: `${TOKEN_STATUS_SPEC} section 7.1`, details: { uri: entry.uri, idx: entry.idx, status } },
  );
}

async function checkBitstringStatusList(
  entry: Extract<StatusEntry, { kind: 'bitstring' }>,
  options: StatusCheckOptions,
): Promise<string> {
  const url = entry.statusListCredential;
  const text = await fetchLimited(
    {
      url,
      accept: 'application/vc+ld+json, application/ld+json, application/json',
      codes: { insecure: 'STATUS_LIST_UNAVAILABLE', failed: 'STATUS_LIST_UNAVAILABLE' },
    },
    options,
  );
  const invalid = (message: string, section: string, cause?: unknown) =>
    new FormatError('STATUS_LIST_INVALID', message, {
      spec: `${BITSTRING_SPEC} ${section}`,
      details: { statusListCredential: url },
      cause,
    });
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch (cause) {
    throw invalid('the status list credential is not JSON', 'section 3.2', cause);
  }
  let verified;
  try {
    verified = await verifyLdpVc(list, {
      documentLoader: options.documentLoader,
      ...(options.now ? { now: options.now } : {}),
    });
  } catch (cause) {
    throw invalid(`the status list credential does not verify: ${errorMessage(cause)}`, 'section 3.2', cause);
  }
  if (verified.issuer !== options.issuer) {
    throw invalid(
      `the status list credential is issued by ${verified.issuer}, not by the credential issuer`,
      'section 3.2 (validate algorithm)',
    );
  }
  const subject = isRecord(list) ? list.credentialSubject : undefined;
  if (!isRecord(subject) || typeof subject.encodedList !== 'string') {
    throw invalid('the status list credential has no credentialSubject.encodedList', 'section 2.2');
  }
  if (subject.statusPurpose !== entry.statusPurpose) {
    throw invalid(
      `the list is for ${String(subject.statusPurpose)}, the entry for ${entry.statusPurpose}`,
      'section 3.2 (validate algorithm)',
    );
  }
  const set = bitstringStatusAt(subject.encodedList, entry.statusListIndex);
  if (!set) return `valid (Bitstring Status List, ${entry.statusPurpose} index ${entry.statusListIndex})`;
  const suspended = entry.statusPurpose === 'suspension';
  throw new FormatError(
    suspended ? 'STATUS_SUSPENDED' : 'STATUS_REVOKED',
    suspended ? 'the credential is suspended' : `the credential is revoked (${entry.statusPurpose})`,
    {
      spec: `${BITSTRING_SPEC} section 2.1 (statusPurpose)`,
      details: { statusListCredential: url, statusListIndex: entry.statusListIndex },
    },
  );
}

/** The status of entry `idx` in a Token Status List `lst`. */
export function tokenStatusAt(lst: string, bits: number, idx: number): number {
  let bytes: Uint8Array;
  try {
    bytes = inflateSync(base64UrlDecode(lst), { maxOutputLength: MAX_LIST_BYTES });
  } catch (cause) {
    throw new FormatError('STATUS_LIST_INVALID', 'status_list.lst is not base64url ZLIB data', {
      spec: `${TOKEN_STATUS_SPEC} section 4.1`,
      cause,
    });
  }
  const perByte = 8 / bits;
  const byte = bytes[Math.floor(idx / perByte)];
  if (byte === undefined) {
    throw new FormatError('STATUS_LIST_INVALID', `idx ${idx} is outside the status list`, {
      spec: `${TOKEN_STATUS_SPEC} section 8.3 step 6`,
    });
  }
  return (byte >> ((idx % perByte) * bits)) & ((1 << bits) - 1);
}

/** Encodes one status per entry as a Token Status List `lst`. */
export function encodeTokenStatusList(statuses: ArrayLike<number>, bits: 1 | 2 | 4 | 8 = 1): string {
  const perByte = 8 / bits;
  const bytes = new Uint8Array(Math.ceil(statuses.length / perByte));
  for (let idx = 0; idx < statuses.length; idx++) {
    bytes[Math.floor(idx / perByte)]! |= (statuses[idx]! & ((1 << bits) - 1)) << ((idx % perByte) * bits);
  }
  return base64UrlEncode(deflateSync(bytes));
}

/** Whether bit `index` of a Bitstring Status List `encodedList` is set. */
export function bitstringStatusAt(encodedList: string, index: number): boolean {
  let bytes: Uint8Array;
  try {
    if (!encodedList.startsWith('u')) throw new Error('not multibase base64url (prefix u)');
    bytes = gunzipSync(base64UrlDecode(encodedList.slice(1)), { maxOutputLength: MAX_LIST_BYTES });
  } catch (cause) {
    throw new FormatError('STATUS_LIST_INVALID', 'encodedList is not multibase base64url GZIP data', {
      spec: `${BITSTRING_SPEC} section 2.2`,
      cause,
    });
  }
  const byte = bytes[Math.floor(index / 8)];
  if (byte === undefined) {
    throw new FormatError('STATUS_LIST_INVALID', `statusListIndex ${index} is outside the status list`, {
      spec: `${BITSTRING_SPEC} section 3.2 (validate algorithm)`,
    });
  }
  return ((byte >> (7 - (index % 8))) & 1) === 1;
}

/** Encodes the set indexes as a Bitstring Status List `encodedList` of `size` entries. */
export function encodeBitstringStatusList(set: Iterable<number>, size = BITSTRING_MIN_ENTRIES): string {
  const bytes = new Uint8Array(Math.ceil(size / 8));
  for (const index of set) bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
  return `u${base64UrlEncode(gzipSync(bytes))}`;
}

/** A Status List Token (JWT) for `uri`, signed by an issuer key named by its DID URL. */
export function signStatusListToken(input: {
  uri: string;
  lst: string;
  bits: 1 | 2 | 4 | 8;
  keyPair: KeyPair;
  kid: string;
  issuedAt?: Date;
  ttlSeconds?: number;
}): string {
  const iat = Math.floor((input.issuedAt ?? new Date()).getTime() / 1000);
  return signCompactJws(
    { typ: 'statuslist+jwt', kid: input.kid },
    {
      sub: input.uri,
      iat,
      ...(input.ttlSeconds === undefined ? {} : { ttl: input.ttlSeconds }),
      status_list: { bits: input.bits, lst: input.lst },
    },
    input.keyPair,
  );
}
