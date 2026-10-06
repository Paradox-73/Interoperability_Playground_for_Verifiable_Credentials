/**
 * CBOR (RFC 8949) as ISO/IEC 18013-5 uses it, through `cbor-x`.
 *
 * The encoder is configured for interoperable output: no `cbor-x` record extension, byte strings
 * without the typed-array tag 64, and map headers of the smallest size (RFC 8949 section 4.2.1).
 * Maps decode to `Map`, because COSE headers and COSE_Key use integer labels that a JavaScript object
 * would turn into strings.
 *
 * Bytes that are signed or hashed are never re-encoded from decoded values: the verifier works on the
 * byte strings it received (`#6.24` wrapped items, COSE protected headers and payloads).
 *
 * `cbor-x` extensions are global to the module. `@owf/cose` (loaded with `@sd-jwt/sd-jwt-vc`) registers
 * decoders that turn tag 24 into its own `DataItem` and tag 1004 into `DateOnly`, so what `decode`
 * returns depends on which other packages were imported. `decodeCbor` therefore turns both back into
 * plain `Tag` values, and every reader here sees the same shapes in every process.
 */
import { Encoder, Tag } from 'cbor-x';
import { FormatError } from '../errors.js';

const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: false,
  tagUint8Array: false,
  variableMapSize: true,
});

/** Tag 24: "encoded CBOR data item" (RFC 8949 section 3.4.5.1), written `#6.24(bstr .cbor X)` in ISO 18013-5. */
export const ENCODED_CBOR_TAG = 24;
/** Tag 0: date/time string (RFC 8949 section 3.4.1), the `tdate` of ISO 18013-5. */
export const TDATE_TAG = 0;
/** Tag 1004: full-date string (RFC 8943), the `full-date` of ISO 18013-5. */
export const FULL_DATE_TAG = 1004;

export { Tag as CborTag };

export function encodeCbor(value: unknown): Uint8Array {
  const bytes = encoder.encode(value);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Decodes one CBOR data item; anything else (trailing bytes, bad syntax) is `MDOC_MALFORMED`. */
export function decodeCbor(bytes: Uint8Array, what = 'CBOR data'): unknown {
  try {
    return normalise(encoder.decode(bytes) as unknown);
  } catch (cause) {
    throw new FormatError('MDOC_MALFORMED', `${what} is not well-formed CBOR`, {
      cause,
      spec: 'RFC 8949 section 3',
    });
  }
}

/** Replaces values made by other packages' `cbor-x` extensions with the `Tag` they stand for. */
function normalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || value instanceof Uint8Array || value instanceof Date) {
    return value;
  }
  if (value instanceof Tag) {
    value.value = normalise(value.value);
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) value[index] = normalise(value[index]);
    return value;
  }
  if (value instanceof Map) {
    for (const [key, member] of value) value.set(key, normalise(member));
    return value;
  }
  const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
  const buffer = (value as { buffer?: unknown }).buffer;
  if (constructorName === 'DataItem' && buffer instanceof Uint8Array)
    return new Tag(buffer, ENCODED_CBOR_TAG);
  const toIso = (value as { toISOString?: unknown }).toISOString;
  if (constructorName === 'DateOnly' && typeof toIso === 'function') {
    return new Tag(String((toIso as () => string).call(value)), FULL_DATE_TAG);
  }
  return value;
}

/** `#6.24(bstr .cbor value)`: the value encoded, wrapped in tag 24. */
export function encodedCborTag(value: unknown): Tag {
  return new Tag(encodeCbor(value), ENCODED_CBOR_TAG);
}

/** The bytes inside a tag 24 item, or `MDOC_MALFORMED` when `value` is not one. */
export function taggedBytes(value: unknown, what: string): Uint8Array {
  if (value instanceof Tag && value.tag === ENCODED_CBOR_TAG && value.value instanceof Uint8Array) {
    return value.value;
  }
  throw new FormatError('MDOC_MALFORMED', `${what} must be #6.24(bstr .cbor ...)`, {
    spec: 'ISO/IEC 18013-5 section 8.3.2.1.2.2',
  });
}

/** Decodes the item inside a tag 24 wrapper. */
export function decodeTagged(value: unknown, what: string): unknown {
  return decodeCbor(taggedBytes(value, what), what);
}

/** `tdate` (tag 0) from a Date, without milliseconds as ISO 18013-5 section 9.1.2.4 asks. */
export function tdate(date: Date): Tag {
  return new Tag(`${date.toISOString().slice(0, 19)}Z`, TDATE_TAG);
}

/** Reads a `tdate` (tag 0 string, which `cbor-x` already turns into a Date) or tag 1 epoch value. */
export function readDate(value: unknown, what: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value instanceof Tag && (value.tag === TDATE_TAG || value.tag === 1)) {
    const date =
      typeof value.value === 'number' ? new Date(value.value * 1000) : new Date(String(value.value));
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw new FormatError('MDOC_MALFORMED', `${what} is not a tdate`, {
    spec: 'ISO/IEC 18013-5 section 9.1.2.4 (ValidityInfo)',
  });
}

/** A CBOR map as a `Map`; a plain object (another decoder's output) is accepted too. */
export function asMap(value: unknown, what: string): Map<unknown, unknown> {
  if (value instanceof Map) return value as Map<unknown, unknown>;
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  ) {
    return new Map(Object.entries(value));
  }
  throw new FormatError('MDOC_MALFORMED', `${what} must be a CBOR map`);
}

export function asBytes(value: unknown, what: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  throw new FormatError('MDOC_MALFORMED', `${what} must be a byte string`);
}

export function asText(value: unknown, what: string): string {
  if (typeof value === 'string') return value;
  throw new FormatError('MDOC_MALFORMED', `${what} must be a text string`);
}

export function asArray(value: unknown, what: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new FormatError('MDOC_MALFORMED', `${what} must be a CBOR array`);
}

/**
 * A decoded CBOR value as JSON, for reports and the inspector: maps become objects, byte strings
 * base64url text, dates ISO strings, tag 24 items their decoded content, other tags `{tag, value}`.
 */
export function cborToJson(value: unknown): unknown {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64url');
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Tag) {
    if (value.tag === ENCODED_CBOR_TAG && value.value instanceof Uint8Array) {
      try {
        return cborToJson(decodeCbor(value.value));
      } catch {
        return { tag: value.tag, value: cborToJson(value.value) };
      }
    }
    if (value.tag === FULL_DATE_TAG || value.tag === TDATE_TAG) return cborToJson(value.value);
    return { tag: value.tag, value: cborToJson(value.value) };
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, member] of value) out[String(key)] = cborToJson(member);
    return out;
  }
  if (Array.isArray(value)) return value.map(cborToJson);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, member]) => [key, cborToJson(member)]));
  }
  return value;
}
