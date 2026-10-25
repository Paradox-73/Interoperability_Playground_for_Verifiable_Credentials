// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * A small CBOR decoder (RFC 8949 section 3) for the inspector, and the mdoc view built on it: an
 * `mso_mdoc` credential or presentation travels as base64url CBOR (OpenID4VCI 1.0 Appendix A.2.4,
 * OpenID4VP 1.0 Appendix B.2.6), which the inspector shows as JSON instead of opaque text.
 *
 * Decoding only: no signature or digest is checked here (the verifier role's result says whether the
 * mdoc is valid). Written here rather than taken from a CBOR library so the browser bundle stays small
 * and the decoder accepts exactly what the view needs.
 */
import { base64UrlToBytes, bytesToBase64Url, type JsonObject, type JsonValue } from './decode';

class CborTag {
  constructor(
    readonly tag: number,
    readonly value: unknown,
  ) {}
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new RangeError('CBOR item runs past the end');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  private uint(info: number): number {
    if (info < 24) return info;
    const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (size === 0) throw new RangeError(`unsupported CBOR additional information ${info}`);
    let value = 0;
    for (const byte of this.take(size)) value = value * 256 + byte;
    return value;
  }

  private float(info: number): number {
    const view = (size: number) => {
      const slice = this.take(size);
      return new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    };
    if (info === 25) {
      // Half precision (RFC 8949 Appendix D).
      const half = view(2).getUint16(0);
      const exponent = (half >> 10) & 0x1f;
      const mantissa = half & 0x3ff;
      const sign = half & 0x8000 ? -1 : 1;
      if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
      if (exponent === 31) return mantissa ? Number.NaN : sign * Number.POSITIVE_INFINITY;
      return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
    }
    return info === 26 ? view(4).getFloat32(0) : view(8).getFloat64(0);
  }

  private chunks(major: number): Uint8Array {
    const parts: Uint8Array[] = [];
    for (;;) {
      if (this.bytes[this.offset] === 0xff) {
        this.offset += 1;
        break;
      }
      const head = this.take(1)[0]!;
      if (head >> 5 !== major) throw new RangeError('indefinite string with a chunk of another type');
      parts.push(this.take(this.uint(head & 0x1f)));
    }
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  read(): unknown {
    const head = this.take(1)[0]!;
    const major = head >> 5;
    const info = head & 0x1f;
    switch (major) {
      case 0:
        return this.uint(info);
      case 1:
        return -1 - this.uint(info);
      case 2:
        return info === 31 ? this.chunks(2) : new Uint8Array(this.take(this.uint(info)));
      case 3: {
        const bytes = info === 31 ? this.chunks(3) : this.take(this.uint(info));
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      }
      case 4: {
        const items: unknown[] = [];
        if (info === 31) {
          while (this.bytes[this.offset] !== 0xff) items.push(this.read());
          this.offset += 1;
        } else {
          for (let count = this.uint(info); count > 0; count -= 1) items.push(this.read());
        }
        return items;
      }
      case 5: {
        const map = new Map<unknown, unknown>();
        if (info === 31) {
          while (this.bytes[this.offset] !== 0xff) map.set(this.read(), this.read());
          this.offset += 1;
        } else {
          for (let count = this.uint(info); count > 0; count -= 1) map.set(this.read(), this.read());
        }
        return map;
      }
      case 6:
        return new CborTag(this.uint(info), this.read());
      default:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        if (info >= 25 && info <= 27) return this.float(info);
        throw new RangeError(`unsupported CBOR simple value ${info}`);
    }
  }
}

/** Decodes exactly one CBOR data item; undefined when the bytes are not that. */
export function decodeCbor(bytes: Uint8Array): { value: unknown } | undefined {
  try {
    const reader = new Reader(bytes);
    const value = reader.read();
    return reader.done ? { value } : undefined;
  } catch {
    return undefined;
  }
}

/** COSE_Sign1 labels worth naming (RFC 9052 section 3.1, RFC 9360 section 2). */
const COSE_LABELS: Record<string, string> = { '1': 'alg', '4': 'kid', '33': 'x5chain' };

function coseSign1ToJson(value: unknown[]): JsonObject {
  const [protectedBytes, unprotected, payload, signature] = value;
  const header = (raw: unknown): JsonValue => {
    const json = toJson(raw);
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return json;
    return Object.fromEntries(Object.entries(json).map(([key, member]) => [COSE_LABELS[key] ?? key, member]));
  };
  const decodedProtected =
    protectedBytes instanceof Uint8Array && protectedBytes.length > 0
      ? decodeCbor(protectedBytes)
      : undefined;
  const decodedPayload = payload instanceof Uint8Array ? decodeCbor(payload) : undefined;
  return {
    protected: decodedProtected ? header(decodedProtected.value) : toJson(protectedBytes),
    unprotected: header(unprotected),
    // issuerAuth carries MobileSecurityObjectBytes; a DeviceSignature's payload is detached (null).
    payload: decodedPayload ? toJson(decodedPayload.value) : toJson(payload),
    signature: toJson(signature),
  };
}

/**
 * CBOR as JSON: maps become objects, byte strings base64url text, tag 24 items their decoded content,
 * tdate and full-date their text, other tags `{tag, value}`; COSE_Sign1 under `issuerAuth` and
 * `deviceSignature` is shown as `{protected, unprotected, payload, signature}`.
 */
function toJson(value: unknown, key?: string): JsonValue {
  if (value === undefined) return null;
  if (value instanceof Uint8Array) return bytesToBase64Url(value);
  if (value instanceof CborTag) {
    if (value.tag === 24 && value.value instanceof Uint8Array) {
      const inner = decodeCbor(value.value);
      if (inner) return toJson(inner.value);
    }
    if ((value.tag === 0 || value.tag === 1004) && typeof value.value === 'string') return value.value;
    return { tag: value.tag, value: toJson(value.value) };
  }
  if (Array.isArray(value)) {
    if ((key === 'issuerAuth' || key === 'deviceSignature') && value.length === 4)
      return coseSign1ToJson(value);
    return value.map((item) => toJson(item));
  }
  if (value instanceof Map) {
    const out: JsonObject = {};
    for (const [member, item] of value) out[String(member)] = toJson(item, String(member));
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  // bigint (a 64-bit integer beyond 2^53 is read as a number here, so this is only a fallback).
  return typeof value === 'bigint' ? value.toString() : null;
}

export interface DecodedMdoc {
  /** What the top-level structure is. */
  structure: 'IssuerSigned' | 'Document' | 'DeviceResponse';
  value: JsonValue;
}

const MDOC_KEYS: Record<string, DecodedMdoc['structure']> = {
  documents: 'DeviceResponse',
  issuerSigned: 'Document',
  issuerAuth: 'IssuerSigned',
};

/**
 * Decodes base64url text that is an mdoc: IssuerSigned (OpenID4VCI 1.0), Inji Certify's
 * `{docType, issuerSigned}`, or a DeviceResponse (ISO/IEC 18013-5 section 8.3.2.1.2.2). Undefined for
 * anything else, so other base64url values are not mistaken for one.
 */
export function decodeMdoc(text: string): DecodedMdoc | undefined {
  const bytes = base64UrlToBytes(text.trim());
  if (!bytes || bytes.length === 0 || bytes[0]! >> 5 !== 5) return undefined;
  const decoded = decodeCbor(bytes);
  if (!decoded || !(decoded.value instanceof Map)) return undefined;
  const keys = [...decoded.value.keys()].filter((key): key is string => typeof key === 'string');
  const structure = keys.map((key) => MDOC_KEYS[key]).find((found) => found !== undefined);
  if (!structure) return undefined;
  return { structure, value: toJson(decoded.value) };
}
