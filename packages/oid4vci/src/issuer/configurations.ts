/**
 * Credential configurations of the reference issuer and how each is described in issuer metadata.
 *
 * Every configuration carries display name, logo, `background_color` and `text_color`. OpenID4VCI
 * marks them optional, but Mimoto refuses the whole issuer when one configuration lacks them
 * (`CredentialSupportedDisplayResponse.java:30-54`, measured as gap G4), so the reference issuer
 * always sends them.
 *
 * The same configuration is written differently per protocol version:
 * - draft 13 (Appendix A): `display` at the top of the configuration; claim descriptions under
 *   `credential_definition.credentialSubject` (ldp_vc) or `claims` (SD-JWT).
 * - 1.0 (section 12.2.4, Appendix A): `display` and `claims` (a list of `{path, display}`) move into
 *   `credential_metadata`.
 *
 * `mso_mdoc` (draft 13 Appendix A.2, 1.0 Appendix A.2): `doctype` instead of a type or `vct`; claims are
 * grouped by namespace (draft 13: `claims.{namespace}.{element}`; 1.0: `path: [namespace, element]`);
 * the holder key is a COSE_Key (`cose_key` binding); signing algorithms are JOSE names in draft 13 and
 * COSE algorithm identifiers in 1.0 (Appendix A.2.2: `-7` for ES256).
 */
import {
  CREDENTIALS_V1_URL,
  CREDENTIALS_V2_URL,
  PLAYGROUND_CONTEXT_V1_URL,
  type LdpProofSuite,
} from '@inji-playground/formats';
import type { VciProfile } from '@inji-playground/protocol';

export type IssuedFormat = 'ldp_vc' | 'vc+sd-jwt' | 'dc+sd-jwt' | 'mso_mdoc';

export interface CredentialDisplay {
  name: string;
  locale: string;
  description?: string;
  logo: { uri: string; alt_text: string };
  background_color: string;
  text_color: string;
}

export interface ClaimDescription {
  /** Claim name in `credentialSubject` (ldp_vc) or at the top of the SD-JWT payload. */
  name: string;
  label: string;
  mandatory?: boolean;
}

export interface CredentialConfiguration {
  id: string;
  format: IssuedFormat;
  /** OAuth scope that asks for this credential in the authorization code flow. */
  scope: string;
  /** ldp_vc only. */
  ldp?: { suite: LdpProofSuite; contexts: string[]; types: string[] };
  /** SD-JWT VC only. */
  vct?: string;
  /** SD-JWT VC only: the issuer's JOSE algorithm. */
  sdJwtAlg?: 'EdDSA' | 'ES256';
  /** mso_mdoc only: the docType and the namespace that holds the claims (signed with ES256). */
  mdoc?: { doctype: string; namespace: string };
  /** `display.name`; logo and colours are added from the issuer's branding. */
  name: string;
  description: string;
  claims: ClaimDescription[];
  /** Validity of an issued credential when the offer does not set one. */
  validitySeconds: number;
  /** Key proof algorithms of this configuration; default `PROOF_SIGNING_ALGS`. */
  proofSigningAlgs?: readonly string[];
}

/**
 * Algorithms the issuer accepts in key proof JWTs (ES256 first: the combination Certify accepted).
 * `Ed25519` is the fully specified name of EdDSA with Ed25519 (RFC 9864); Mimoto 0.22.0 picks its
 * Ed25519 wallet key only when the issuer lists that name, and it signs every ldp_vp with that key (G22).
 */
export const PROOF_SIGNING_ALGS = ['ES256', 'EdDSA', 'Ed25519'] as const;

/** Holder binding methods the issuer accepts in proof JWTs (`kid` DID URL, or `jwk` header). */
export const BINDING_METHODS = ['did:jwk', 'did:key', 'jwk'] as const;

export const FARMER_VCT = 'https://playground.ps02.test/vct/farmer/v1';
/** docType and namespace of the playground's farmer mdoc (a test doctype, not an ISO one). */
export const FARMER_MDOC_DOCTYPE = 'test.ps02.playground.farmer.1';
export const FARMER_MDOC_NAMESPACE = 'test.ps02.playground.farmer.1';

/** COSE algorithm identifier of ES256 (RFC 9053 section 2.1), as OpenID4VCI 1.0 Appendix A.2.2 lists it. */
const COSE_ES256 = -7;

const FARMER_CLAIMS: ClaimDescription[] = [
  { name: 'farmerId', label: 'Farmer ID', mandatory: true },
  { name: 'givenName', label: 'Given name' },
  { name: 'familyName', label: 'Family name' },
  { name: 'birthDate', label: 'Date of birth' },
  { name: 'state', label: 'State' },
  { name: 'landArea', label: 'Land area' },
  { name: 'primaryCropType', label: 'Primary crop' },
];

/**
 * Test claims for a credential subject when the offer brings none. Values follow the first row of
 * the upstream farmer sample (see `as/identity.ts`), so a reference credential and a Certify
 * credential for the same farmer can be compared side by side.
 */
export const DEFAULT_FARMER_CLAIMS: Readonly<Record<string, string>> = {
  farmerId: '2154189532',
  givenName: 'Gorge',
  familyName: 'Cooper',
  birthDate: '1990-05-25',
  state: 'Karnataka',
  landArea: '3 hectares',
  primaryCropType: 'Maize',
};

const YEAR = 365 * 24 * 3600;

/**
 * The four configurations the plan asks for (two ldp_vc data models and both SD-JWT VC names), one
 * ldp_vc that accepts only ES256 key proofs (a probe of gap G22), and the farmer as an mso_mdoc.
 */
export const DEFAULT_CONFIGURATIONS: readonly CredentialConfiguration[] = [
  {
    id: 'FarmerCredential_ldp_vc',
    format: 'ldp_vc',
    scope: 'farmer_ldp_vc',
    ldp: {
      suite: 'Ed25519Signature2020',
      contexts: [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
      types: ['VerifiableCredential', 'FarmerCredential'],
    },
    name: 'Farmer credential (W3C VC 1.1)',
    description: 'Farmer identity, W3C VC Data Model 1.1 signed with Ed25519Signature2020',
    claims: FARMER_CLAIMS,
    validitySeconds: YEAR,
  },
  {
    id: 'FarmerCredential_ldp_vc_v2',
    format: 'ldp_vc',
    scope: 'farmer_ldp_vc_v2',
    ldp: {
      suite: 'eddsa-rdfc-2022',
      contexts: [CREDENTIALS_V2_URL, PLAYGROUND_CONTEXT_V1_URL],
      types: ['VerifiableCredential', 'FarmerCredential'],
    },
    name: 'Farmer credential (W3C VC 2.0)',
    description: 'Farmer identity, W3C VC Data Model 2.0 with DataIntegrityProof eddsa-rdfc-2022',
    claims: FARMER_CLAIMS,
    validitySeconds: YEAR,
  },
  {
    // Probe of G22 (scenario holder-proof-es256): the same credential, but key proofs only with ES256, the
    // list the Inji Certify sample has for FarmerCredential. A wallet must still present with the bound key.
    id: 'FarmerCredential_ldp_vc_es256_proof',
    format: 'ldp_vc',
    scope: 'farmer_ldp_vc_es256_proof',
    ldp: {
      suite: 'Ed25519Signature2020',
      contexts: [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
      types: ['VerifiableCredential', 'FarmerCredential'],
    },
    name: 'Farmer credential (W3C VC 1.1, ES256 key proofs)',
    description: 'Farmer identity, W3C VC Data Model 1.1; the issuer accepts only ES256 key proofs',
    claims: FARMER_CLAIMS,
    validitySeconds: YEAR,
    proofSigningAlgs: ['ES256'],
  },
  {
    id: 'FarmerCredential_vc_sd_jwt',
    format: 'vc+sd-jwt',
    scope: 'farmer_vc_sd_jwt',
    vct: FARMER_VCT,
    sdJwtAlg: 'EdDSA',
    name: 'Farmer credential (SD-JWT, vc+sd-jwt)',
    description: 'Farmer identity as an SD-JWT VC with the format name Inji stable uses',
    claims: FARMER_CLAIMS,
    validitySeconds: YEAR,
  },
  {
    id: 'FarmerCredential_dc_sd_jwt',
    format: 'dc+sd-jwt',
    scope: 'farmer_dc_sd_jwt',
    vct: FARMER_VCT,
    sdJwtAlg: 'ES256',
    name: 'Farmer credential (SD-JWT, dc+sd-jwt)',
    description: 'Farmer identity as an SD-JWT VC with the format name of OpenID4VCI 1.0',
    claims: FARMER_CLAIMS,
    validitySeconds: YEAR,
  },
  {
    id: 'FarmerCredential_mso_mdoc',
    format: 'mso_mdoc',
    scope: 'farmer_mso_mdoc',
    mdoc: { doctype: FARMER_MDOC_DOCTYPE, namespace: FARMER_MDOC_NAMESPACE },
    name: 'Farmer credential (mdoc, mso_mdoc)',
    description: 'Farmer identity as an ISO/IEC 18013-5 mdoc, MSO signed with ES256 and an x5chain',
    claims: FARMER_CLAIMS,
    validitySeconds: YEAR,
    // The device key is a P-256 COSE_Key (ISO 18013-5 section 9.1.5.2), so only ES256 key proofs fit.
    proofSigningAlgs: ['ES256'],
  },
];

export interface IssuerBranding {
  name: string;
  logoUri: string;
  backgroundColor: string;
  textColor: string;
  locale: string;
}

export function credentialDisplay(
  config: CredentialConfiguration,
  branding: IssuerBranding,
): CredentialDisplay[] {
  return [
    {
      name: config.name,
      locale: branding.locale,
      description: config.description,
      logo: { uri: branding.logoUri, alt_text: `${branding.name} logo` },
      background_color: branding.backgroundColor,
      text_color: branding.textColor,
    },
  ];
}

/** Algorithms named in `credential_signing_alg_values_supported`. */
function signingAlgs(config: CredentialConfiguration, profile: VciProfile): (string | number)[] {
  if (config.format === 'ldp_vc') return [config.ldp!.suite];
  if (config.format === 'mso_mdoc') return profile === 'v1' ? [COSE_ES256] : ['ES256'];
  return [config.sdJwtAlg ?? 'EdDSA'];
}

/** One entry of `credential_configurations_supported` in the shape of the given protocol version. */
export function configurationMetadata(
  config: CredentialConfiguration,
  profile: VciProfile,
  branding: IssuerBranding,
): Record<string, unknown> {
  const display = credentialDisplay(config, branding);
  const claimDisplay = (claim: ClaimDescription) => [{ name: claim.label, locale: branding.locale }];
  const common = {
    format: config.format,
    scope: config.scope,
    cryptographic_binding_methods_supported:
      config.format === 'mso_mdoc' ? ['cose_key'] : [...BINDING_METHODS],
    credential_signing_alg_values_supported: signingAlgs(config, profile),
    proof_types_supported: {
      jwt: { proof_signing_alg_values_supported: [...(config.proofSigningAlgs ?? PROOF_SIGNING_ALGS)] },
    },
  };
  if (config.format === 'mso_mdoc') {
    const { doctype, namespace } = config.mdoc!;
    if (profile === 'draft13') {
      const elements = Object.fromEntries(
        config.claims.map((claim) => [
          claim.name,
          { ...(claim.mandatory ? { mandatory: true } : {}), display: claimDisplay(claim) },
        ]),
      );
      return { ...common, doctype, claims: { [namespace]: elements }, display };
    }
    return {
      ...common,
      doctype,
      credential_metadata: {
        display,
        claims: config.claims.map((claim) => ({
          path: [namespace, claim.name],
          ...(claim.mandatory ? { mandatory: true } : {}),
          display: claimDisplay(claim),
        })),
      },
    };
  }
  if (profile === 'draft13') {
    const claims = Object.fromEntries(
      config.claims.map((claim) => [
        claim.name,
        { ...(claim.mandatory ? { mandatory: true } : {}), display: claimDisplay(claim) },
      ]),
    );
    return config.format === 'ldp_vc'
      ? {
          ...common,
          credential_definition: {
            '@context': config.ldp!.contexts,
            type: config.ldp!.types,
            credentialSubject: claims,
          },
          display,
          order: config.claims.map((claim) => claim.name),
        }
      : { ...common, vct: config.vct, claims, display, order: config.claims.map((claim) => claim.name) };
  }
  const subjectPath = (claim: ClaimDescription) =>
    config.format === 'ldp_vc' ? ['credentialSubject', claim.name] : [claim.name];
  return {
    ...common,
    ...(config.format === 'ldp_vc'
      ? { credential_definition: { '@context': config.ldp!.contexts, type: config.ldp!.types } }
      : { vct: config.vct }),
    credential_metadata: {
      display,
      claims: config.claims.map((claim) => ({
        path: subjectPath(claim),
        ...(claim.mandatory ? { mandatory: true } : {}),
        display: claimDisplay(claim),
      })),
    },
  };
}

/** A small logo served by the issuer, so metadata never points at an outside host. */
export const ISSUER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Reference issuer">
<rect width="64" height="64" rx="12" fill="#0b5d4b"/>
<path d="M18 40c8-16 20-20 28-20-2 10-8 22-24 24" fill="none" stroke="#f4f1e8" stroke-width="4" stroke-linecap="round"/>
<circle cx="22" cy="44" r="3" fill="#f4f1e8"/>
</svg>`;
