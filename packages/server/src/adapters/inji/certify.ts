/**
 * `inji-certify`: Inji Certify 0.14.0 of the local stack (pre-authorized code profile) as the issuer of a
 * run. It creates a credential offer through `POST /v1/certify/pre-authorized-data` with the farmer test
 * claims; the wallet then redeems it at Certify (its URLs name `certify-nginx` inside the compose network,
 * which the network map turns into the host port).
 *
 * What was measured on 2026-10-05 and shapes this role:
 * - Certify accepts a holder proof only under an algorithm name its configuration lists: ES256, RS256 and,
 *   since the stack lists it for FarmerCredential, Ed25519 (RFC 9864); `EdDSA` is refused (gap G9). The
 *   reference wallet picks its key from the metadata (Ed25519 for ldp_vc, P-256 for SD-JWT VC and mso_mdoc).
 * - `/pre-authorized-data` refuses claims a configuration does not advertise (`unknown_claims`), and
 *   answers HTTP 200 with a MOSIP `errors` envelope when it refuses.
 * - The SD-JWT VC names its signing key by an `x5c` leaf certificate issued by Certify's
 *   `CERTIFY_VC_SIGN_ED25519` certificate. The role fetches Certify's certificates once and passes them to
 *   the reference verifier as trust anchors, as an issuer publishes its trust list. The mso_mdoc of
 *   FarmerMdoc (2026-10-06) carries the `CERTIFY_VC_SIGN_EC_R1` certificate in its x5chain.
 */
import {
  RoleError,
  type CredentialFormat,
  type Health,
  type IssuanceRequest,
  type IssuanceStart,
  type IssuerRole,
  type RoleDescriptor,
  type RunContext,
} from '@inji-playground/protocol';
import { INJI_VERSIONS, probe } from './common.js';

/** Credential configurations of the imported Certify sample (SQL seed and certify-seed). */
export const CERTIFY_CONFIGURATION_FOR_FORMAT: Partial<Record<CredentialFormat, string>> = {
  ldp_vc: 'FarmerCredential',
  'vc+sd-jwt': 'FarmerSdJwt',
  // Added by certify-seed (config/seed/farmer-mdoc.credential-configuration.json): namespace and doctype
  // test.ps02.playground.farmer.1, signed with the CERTIFY_VC_SIGN_EC_R1 key and its certificate in x5chain.
  mso_mdoc: 'FarmerMdoc',
};

/** Synthetic holder data, as in the upstream farmer sample; only advertised claims are sent. */
export const FARMER_CLAIMS: Readonly<Record<string, string>> = Object.freeze({
  fullName: 'Asha Test',
  mobileNumber: '9000000000',
  phone: '9000000000',
  dateOfBirth: '1990-01-01',
  gender: 'Female',
  state: 'Karnataka',
  district: 'Bengaluru Urban',
  villageOrTown: 'Test Town',
  postalCode: '560001',
  landArea: '2 acres',
  landOwnershipType: 'Owner',
  primaryCropType: 'Rice',
  secondaryCropType: 'Millet',
  farmerID: 'FARMER-TEST-001',
});

/** Certify key manager applications whose certificates sign or issue credential signing keys. */
const CERTIFICATE_APPLICATIONS = [
  'ROOT',
  'CERTIFY_VC_SIGN_ED25519',
  'CERTIFY_VC_SIGN_EC_R1',
  'CERTIFY_VC_SIGN_EC_K1',
];

export interface InjiCertifyOptions {
  /** Base URL of certify-nginx as this server reaches it. */
  baseUrl: string;
  /** Receives Certify's certificates (PEM), for the reference verifier's x5c trust anchors. */
  onTrustAnchors?: (pems: string[]) => void;
}

interface IssuerMetadata {
  credential_issuer: string;
  credential_configurations_supported?: Record<
    string,
    {
      format?: string;
      claims?: Record<string, unknown>;
      credential_definition?: { credentialSubject?: Record<string, unknown> };
    }
  >;
}

export class InjiCertifyRole implements IssuerRole {
  readonly #options: InjiCertifyOptions;
  #trustAnchorsLoaded = false;

  constructor(options: InjiCertifyOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') };
  }

  describe(): RoleDescriptor {
    return {
      id: 'inji-certify',
      kind: 'issuer',
      name: 'Inji Certify',
      ecosystem: 'inji',
      version: INJI_VERSIONS.certify,
      interaction: 'automatic',
      description:
        'Inji Certify from the local stack in its pre-authorized code profile, with the farmer sample (FarmerCredential ldp_vc, FarmerSdJwt vc+sd-jwt), issuing under did:web:certify.ps02.test.',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'mso_mdoc'],
        proofTypes: ['Ed25519Signature2020', 'EdDSA'],
        didMethods: ['did:web'],
        vciProfiles: ['draft13'],
        issuance: ['credential-offer'],
      },
      notes: [
        'Holder proofs: ES256, RS256, or Ed25519 under its RFC 9864 name (the stack lists it for FarmerCredential); alg EdDSA is refused (gap G9).',
        'Pre-authorized code profile: Certify has no authorization endpoint here (gap G6), so wallets that only run the authorization code flow, such as Inji Web through Mimoto, cannot use it.',
      ],
    };
  }

  health(): Promise<Health> {
    return probe(`${this.#options.baseUrl}/v1/certify/issuance/.well-known/openid-credential-issuer`);
  }

  async startIssuance(ctx: RunContext, request: IssuanceRequest): Promise<IssuanceStart> {
    const configurationId =
      request.credentialConfigurationId ?? CERTIFY_CONFIGURATION_FOR_FORMAT[request.format];
    if (!configurationId) {
      throw new RoleError(
        'issuer.format-unsupported',
        `the Inji Certify sample has no credential configuration for ${request.format}`,
      );
    }
    const base = this.#options.baseUrl;
    // The first metadata call after a cold start took 52 s (2026-10-04); the Inji step timeout allows it.
    const metadataResponse = await ctx.http.fetch(
      `${base}/v1/certify/issuance/.well-known/openid-credential-issuer`,
      {
        signal: ctx.signal,
      },
    );
    if (!metadataResponse.ok) {
      throw new RoleError(
        'issuer.metadata-failed',
        `Certify issuer metadata answered HTTP ${metadataResponse.status}`,
      );
    }
    const metadata = (await metadataResponse.json()) as IssuerMetadata;
    const configuration = metadata.credential_configurations_supported?.[configurationId];
    if (!configuration) {
      throw new RoleError('issuer.configuration-unknown', `Certify does not advertise ${configurationId}`);
    }

    // An mdoc configuration lists claims per namespace; its template reads the farmer fields by name.
    const advertised =
      configuration.format === 'mso_mdoc'
        ? []
        : Object.keys(configuration.credential_definition?.credentialSubject ?? configuration.claims ?? {});
    const source = request.claims ?? FARMER_CLAIMS;
    // Certify checks mso_mdoc pre-authorized claims against the namespaces of `claims` (unknown_claims
    // otherwise, measured 2026-10-06), so the farmer data goes under each namespace.
    const namespaces = configuration.format === 'mso_mdoc' ? Object.keys(configuration.claims ?? {}) : [];
    const claims =
      namespaces.length > 0
        ? Object.fromEntries(namespaces.map((namespace) => [namespace, { ...source }]))
        : advertised.length === 0
          ? { ...source }
          : Object.fromEntries(Object.entries(source).filter(([name]) => advertised.includes(name)));
    const created = await ctx.http.fetch(`${base}/v1/certify/pre-authorized-data`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential_configuration_id: configurationId, claims, expires_in: 600 }),
      signal: ctx.signal,
    });
    const body = (await created.json().catch(() => undefined)) as
      | {
          credential_offer_uri?: string;
          credential_offer?: string;
          errors?: Array<{ errorCode?: string; errorMessage?: string }>;
        }
      | undefined;
    const refused = body?.errors?.map((error) => error.errorCode ?? error.errorMessage ?? 'error') ?? [];
    if (!created.ok || refused.length > 0) {
      throw new RoleError(
        'issuer.offer-refused',
        `Certify refused the pre-authorized data (HTTP ${created.status}${refused.length > 0 ? `: ${refused.join(', ')}` : ''})`,
      );
    }
    const offerUri = body?.credential_offer_uri ?? body?.credential_offer;
    if (!offerUri) throw new RoleError('issuer.offer-missing', 'Certify answered without a credential offer');

    await this.#publishTrustAnchors();
    return {
      mode: 'credential-offer',
      offerUri,
      credentialIssuer: metadata.credential_issuer,
      credentialConfigurationIds: [configurationId],
    };
  }

  async #publishTrustAnchors(): Promise<void> {
    if (this.#trustAnchorsLoaded || !this.#options.onTrustAnchors) return;
    this.#trustAnchorsLoaded = await publishCertifyTrustAnchors(
      this.#options.baseUrl,
      this.#options.onTrustAnchors,
    );
  }
}

/**
 * A Certify's signing certificates, for verifiers that check x5c chains (SD-JWT VC) and x5chain (mso_mdoc).
 * Set-up traffic of the playground, not part of the protocol, so it is not recorded in the run. True when
 * at least one certificate was published.
 */
async function publishCertifyTrustAnchors(
  baseUrl: string,
  onTrustAnchors: (pems: string[]) => void,
): Promise<boolean> {
  const pems: string[] = [];
  for (const application of CERTIFICATE_APPLICATIONS) {
    try {
      const response = await fetch(
        `${baseUrl}/v1/certify/system-info/certificate?applicationId=${application}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const body = (await response.json()) as { response?: { certificate?: string } };
      if (response.ok && body.response?.certificate) pems.push(body.response.certificate);
    } catch {
      // An application without a certificate is not an error: the sample config does not use every key.
    }
  }
  if (pems.length > 0) onTrustAnchors(pems);
  return pems.length > 0;
}

export interface InjiCertifyAcOptions {
  /** Base URL this server reaches certify-ac on directly (health only). */
  baseUrl: string;
  /** certify-ac's credential issuer identifier (its domain URL, through the playground proxy). */
  credentialIssuer: string;
  /** Receives certify-ac's certificates (PEM), for the reference verifier's trust anchors. */
  onTrustAnchors?: (pems: string[]) => void;
}

/**
 * `inji-certify-ac`: the second Inji Certify 0.14.0 of the holder-web profile, in authorization code mode
 * with the playground's test authorization server (deploy/inji-stack/config/certify-ac.properties). The run
 * starts wallet-initiated: the wallet reads certify-ac's metadata, gets a code from the test server (which
 * logs in the farmer CSV row 2154189532 without a login page) and redeems it, as Inji Web through Mimoto does.
 */
export class InjiCertifyAcRole implements IssuerRole {
  readonly #options: InjiCertifyAcOptions;
  #trustAnchorsLoaded = false;

  constructor(options: InjiCertifyAcOptions) {
    this.#options = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      credentialIssuer: options.credentialIssuer.replace(/\/+$/, ''),
    };
  }

  describe(): RoleDescriptor {
    return {
      id: 'inji-certify-ac',
      kind: 'issuer',
      name: 'Inji Certify (authorization code)',
      ecosystem: 'inji',
      version: INJI_VERSIONS.certify,
      interaction: 'automatic',
      description:
        'A second Inji Certify from the holder-web profile, in authorization code mode with the playground test authorization server and the upstream farmer CSV data provider (FarmerCredential ldp_vc, FarmerSdJwt vc+sd-jwt), issuing under did:web:certify-ac.ps02.test.',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'mso_mdoc'],
        proofTypes: ['Ed25519Signature2020', 'EdDSA'],
        didMethods: ['did:web'],
        vciProfiles: ['draft13'],
        issuance: ['wallet-initiated'],
      },
      notes: [
        'Holder proofs: ES256, RS256, or Ed25519 under its RFC 9864 name; alg EdDSA is refused (gap G9).',
        'Needs the server on 28100 with PLAYGROUND_PUBLIC_URL=https://ref.ps02.test: certify-ac checks tokens of the test authorization server there.',
      ],
    };
  }

  health(): Promise<Health> {
    return probe(`${this.#options.baseUrl}/v1/certify/issuance/.well-known/openid-credential-issuer`);
  }

  async startIssuance(_ctx: RunContext, request: IssuanceRequest): Promise<IssuanceStart> {
    const configurationId =
      request.credentialConfigurationId ?? CERTIFY_CONFIGURATION_FOR_FORMAT[request.format];
    if (!configurationId) {
      throw new RoleError('issuer.format-unsupported', `certify-ac does not issue ${request.format}`);
    }
    if (!this.#trustAnchorsLoaded && this.#options.onTrustAnchors) {
      this.#trustAnchorsLoaded = await publishCertifyTrustAnchors(
        this.#options.baseUrl,
        this.#options.onTrustAnchors,
      );
    }
    return {
      mode: 'wallet-initiated',
      credentialIssuer: this.#options.credentialIssuer,
      credentialConfigurationId: configurationId,
    };
  }
}
