// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * @inji-playground/oid4vci: a reference OpenID4VCI issuer (draft 13 and 1.0), a test authorization
 * server that stands in for eSignet, and the wallet's issuance client. Independent of Inji's code:
 * written from the specifications, so Inji modules can be tested against something that is not Inji.
 */
export * from './common/constants.js';
export * from './common/errors.js';
export { pkceChallenge, randomToken, type Clock } from './common/util.js';
export * from './common/well-known.js';

export * from './issuer/configurations.js';
export { validateProofJwt, type HolderBinding, type ValidatedProof } from './issuer/proof.js';
export {
  generateIssuerKeys,
  type IssuanceOptions,
  type IssuedCredential,
  type IssuerDidMethod,
  type IssuerKeys,
  type MdocCertificates,
} from './issuer/signing.js';
export * from './issuer/server.js';

export * from './as/identity.js';
export * from './as/server.js';

export * from './client/holder.js';
export * from './client/messages.js';
export * from './client/wallet-client.js';

export * from './testing/inject-fetch.js';
