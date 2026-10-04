import type { StepId } from './enums.js';

/** A specification and the section of it that defines a protocol step. */
export interface SpecReference {
  name: string;
  url: string;
  /** Section title in the specification, so readers can find it in any version of the text. */
  section: string;
}

export interface StepInfo {
  /** What happens, in words a newcomer understands; shown first on the timeline. */
  label: string;
  /** The protocol's own term, shown second. */
  protocolTerm: string;
  spec?: SpecReference;
}

const OID4VCI = 'OpenID for Verifiable Credential Issuance 1.0';
const OID4VCI_URL = 'https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html';
const OID4VP = 'OpenID for Verifiable Presentations 1.0';
const OID4VP_URL = 'https://openid.net/specs/openid-4-verifiable-presentations-1_0.html';

/**
 * Plain-language label, protocol term and specification reference of every step. The final 1.0
 * specifications are linked because the draft texts Inji implements keep the same section titles.
 */
export const STEP_INFO: Readonly<Record<StepId, StepInfo>> = {
  'issuer.offer': {
    label: 'Issuer prepares a credential offer for the wallet',
    protocolTerm: 'Credential Offer',
    spec: { name: OID4VCI, url: OID4VCI_URL, section: 'Credential Offer' },
  },
  'issuer.metadata': {
    label: 'Wallet reads what the issuer can issue',
    protocolTerm: 'Credential Issuer Metadata',
    spec: { name: OID4VCI, url: OID4VCI_URL, section: 'Credential Issuer Metadata' },
  },
  'as.metadata': {
    label: 'Wallet finds the issuer’s authorization server',
    protocolTerm: 'OAuth 2.0 Authorization Server Metadata',
    spec: {
      name: 'RFC 8414 OAuth 2.0 Authorization Server Metadata',
      url: 'https://www.rfc-editor.org/rfc/rfc8414',
      section: 'Obtaining Authorization Server Metadata',
    },
  },
  token: {
    label: 'Wallet exchanges the one-time code for an access token',
    protocolTerm: 'Token Request',
    spec: { name: OID4VCI, url: OID4VCI_URL, section: 'Token Endpoint' },
  },
  nonce: {
    label: 'Wallet asks the issuer for a fresh nonce to sign',
    protocolTerm: 'Nonce Request',
    spec: { name: OID4VCI, url: OID4VCI_URL, section: 'Nonce Endpoint' },
  },
  credential: {
    label: 'Wallet proves it holds its key and receives the credential',
    protocolTerm: 'Credential Request',
    spec: { name: OID4VCI, url: OID4VCI_URL, section: 'Credential Endpoint' },
  },
  'verifier.request': {
    label: 'Verifier creates a request saying which credential it needs',
    protocolTerm: 'Authorization Request',
    spec: { name: OID4VP, url: OID4VP_URL, section: 'Authorization Request' },
  },
  'wallet.fetch-request': {
    label: 'Wallet downloads the verifier’s signed request',
    protocolTerm: 'Request Object by reference (request_uri)',
    spec: { name: OID4VP, url: OID4VP_URL, section: 'Authorization Request' },
  },
  'wallet.submit': {
    label: 'Wallet sends the presentation to the verifier',
    protocolTerm: 'Authorization Response (direct_post)',
    spec: { name: OID4VP, url: OID4VP_URL, section: 'Response Mode "direct_post"' },
  },
  'verifier.result': {
    label: 'Verifier checks signatures, dates and holder binding',
    protocolTerm: 'Verification result',
  },
  'person.action': {
    label: 'Waiting for a person to scan the QR code or open the link',
    protocolTerm: 'Cross-device or same-device flow',
  },
  'playground.admin': {
    label: 'Playground prepares the run',
    protocolTerm: 'Set-up call (not part of the protocol)',
  },
};
