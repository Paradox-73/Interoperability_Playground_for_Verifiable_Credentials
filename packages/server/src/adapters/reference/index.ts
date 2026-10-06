/**
 * The reference roles (non-Inji, written from the specifications) as selector entries: `ref-issuer`,
 * `ref-wallet`, `ref-verifier`. They are always registered: reference runs need no Docker.
 */
import type { AnyRole } from '@inji-playground/protocol';
import type { ReferenceHosting } from '../../hosting/reference-hosting.js';
import type { CaptureHub } from '../../recording/capture-hub.js';
import { ReferenceIssuerRole } from './issuer.js';
import { ReferenceVerifierRole } from './verifier.js';
import { ReferenceWalletRole, type ReferenceWalletOptions } from './wallet.js';

export { DEFAULT_CONFIGURATION_FOR_FORMAT, ReferenceIssuerRole } from './issuer.js';
export { ReferenceVerifierRole } from './verifier.js';
export { ReferenceDcApiVerifierRole, dcApiResponseUri, isDcApiRequestUri } from './dc-api-verifier.js';
export { ReferenceWalletRole, type ReferenceWalletOptions } from './wallet.js';
export { credentialFacts, toRoleError } from './common.js';

export function referenceRoles(
  hosting: ReferenceHosting,
  hub: CaptureHub,
  wallet: ReferenceWalletOptions = {},
): AnyRole[] {
  return [
    new ReferenceIssuerRole(hosting, hub),
    new ReferenceWalletRole(hosting, wallet),
    new ReferenceVerifierRole(hosting, hub),
  ];
}
