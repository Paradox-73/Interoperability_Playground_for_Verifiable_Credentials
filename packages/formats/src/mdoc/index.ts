// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `mso_mdoc` (ISO/IEC 18013-5 mdoc) for OpenID4VCI 1.0 Appendix A.2 and OpenID4VP 1.0 Appendix B.2:
 * issue an IssuerSigned, present a DeviceResponse with DeviceSignature, verify it.
 */
export {
  CborTag,
  cborToJson,
  decodeCbor,
  encodeCbor,
  encodedCborTag,
  ENCODED_CBOR_TAG,
  FULL_DATE_TAG,
  TDATE_TAG,
  tdate,
} from './cbor.js';
export {
  COSE_ALG_ES256,
  COSE_HEADER,
  coseKeyToJwk,
  jwkToCoseKey,
  parseCoseSign1,
  signCoseSign1,
  verifyCoseSign1,
  x5chainHeader,
  x5chainOf,
  type CoseSign1,
  type SignCoseSign1Input,
} from './cose.js';
export * from './model.js';
export * from './issue.js';
export * from './session-transcript.js';
export * from './present.js';
export * from './verify.js';
