// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packages that compile these sources need the declarations too (vendor.d.ts)
/// <reference path="../vendor.d.ts" />
/**
 * Credential size and QR payload length, for the "credential too large for a QR code" gap.
 *
 * Inji encodes credentials for QR codes with PixelPass: JSON is CBOR-encoded, zlib-compressed and
 * base45-encoded. Base45 uses exactly the 45 characters of the QR alphanumeric mode, so the base45
 * length is what has to fit into the QR code's alphanumeric capacity.
 */
import { generateQRData } from '@injistack/pixelpass';
import type { CredentialSize } from '@inji-playground/protocol';
import { utf8Encode } from '../util/encoding.js';

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/** Alphanumeric capacity of a version 40 QR code per error correction level (ISO/IEC 18004, Table 7). */
export const QR_V40_ALPHANUMERIC: Readonly<Record<QrErrorCorrection, number>> = {
  L: 4296,
  M: 3391,
  Q: 2420,
  H: 1852,
};

/** PixelPass encodes with level L unless told otherwise (`DEFAULT_ECC_LEVEL`, pixelpass 0.8.0). */
export const PIXELPASS_DEFAULT_ECC: QrErrorCorrection = 'L';

/**
 * PixelPass text for a credential, exactly as Inji would put it in a QR code. A JSON-LD credential is
 * passed as its JSON text; an SD-JWT as the compact string (PixelPass then compresses the raw text).
 */
export function pixelPassText(credential: string | object): string {
  const text = typeof credential === 'string' ? credential : JSON.stringify(credential);
  let isJson = true;
  try {
    JSON.parse(text);
  } catch {
    isJson = false;
  }
  if (isJson) return generateQRData(text);
  // PixelPass logs "Data is not JSON" before falling back to plain zlib; that is expected for an
  // SD-JWT, so the message is kept out of the server log for this one synchronous call.
  const original = console.error;
  console.error = () => undefined;
  try {
    return generateQRData(text);
  } finally {
    console.error = original;
  }
}

/** Size of a credential and whether its PixelPass form fits the largest QR code (level L). */
export function credentialSize(credential: string | object): CredentialSize {
  const text = typeof credential === 'string' ? credential : JSON.stringify(credential);
  const pixelpassChars = pixelPassText(text).length;
  return {
    bytes: utf8Encode(text).length,
    pixelpassChars,
    fitsQrV40: pixelpassChars <= QR_V40_ALPHANUMERIC[PIXELPASS_DEFAULT_ECC],
  };
}

/** Which error correction levels a QR payload of `chars` alphanumeric characters still fits at version 40. */
export function qrLevelsThatFit(chars: number): QrErrorCorrection[] {
  return (Object.keys(QR_V40_ALPHANUMERIC) as QrErrorCorrection[]).filter(
    (level) => chars <= QR_V40_ALPHANUMERIC[level],
  );
}
