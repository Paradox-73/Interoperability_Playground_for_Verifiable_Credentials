/**
 * `@inji-playground/formats/tamper`: primitives that corrupt credentials and presentations in one
 * precise way each, for the replay-and-tamper scenarios (`@inji-playground/scenarios`).
 *
 * Exported under their own path (not from the package root) because none of them belongs in a normal
 * issue, hold, present or verify flow; importing them is a visible decision.
 */
export { flipByte, flipJwsSignature, resignJws, type ResignJwsChanges } from './jws.js';
export {
  addUnreferencedDisclosure,
  alterDisclosure,
  dropDisclosure,
  flipKeyBindingSignature,
  flipSdJwtIssuerSignature,
  forgeWithSelfSignedX5c,
  joinSdJwt,
  resignKeyBinding,
  selfIssueSdJwt,
  type ForgeX5cOptions,
  type ForgedX5c,
  type KeyBindingChanges,
  type SelfIssueOptions,
  type SelfIssued,
} from './sd-jwt.js';
export { flipEmbeddedCredentialProof, flipProofValue, representLdpVp, type RepresentOptions } from './ldp.js';
export {
  addUnreferencedMdocElement,
  alterMdocElement,
  firstMdocElement,
  flipMdocIssuerSignature,
  forgeMdocWithSelfSignedX5chain,
  resignMdocDeviceSignature,
  type ForgedMdoc,
} from './mdoc.js';
