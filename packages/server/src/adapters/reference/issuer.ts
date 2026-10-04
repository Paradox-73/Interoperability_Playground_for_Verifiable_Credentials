/**
 * `ref-issuer`: the playground's own OpenID4VCI issuer (hosted at `/ref/issuer`) as the issuer column
 * of a run. It creates a pre-authorized credential offer passed by reference, so the wallet's first
 * request (fetching the offer) is a recorded exchange like every other step.
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
import type { CaptureHub } from '../../recording/capture-hub.js';
import { INBOUND_TARGETS } from '../../recording/inbound.js';
import type { ReferenceHosting } from '../../hosting/reference-hosting.js';
import { SERVER_VERSION } from '../../version.js';
import { processHealth } from './common.js';

/** Credential configuration the issuer offers for each format, unless the run names one. */
export const DEFAULT_CONFIGURATION_FOR_FORMAT: Partial<Record<CredentialFormat, string>> = {
  ldp_vc: 'FarmerCredential_ldp_vc',
  'vc+sd-jwt': 'FarmerCredential_vc_sd_jwt',
  'dc+sd-jwt': 'FarmerCredential_dc_sd_jwt',
};

export class ReferenceIssuerRole implements IssuerRole {
  readonly #hosting: ReferenceHosting;
  readonly #hub: CaptureHub;

  constructor(hosting: ReferenceHosting, hub: CaptureHub) {
    this.#hosting = hosting;
    this.#hub = hub;
  }

  describe(): RoleDescriptor {
    return {
      id: 'ref-issuer',
      kind: 'issuer',
      name: 'Reference issuer',
      ecosystem: 'reference',
      version: SERVER_VERSION,
      interaction: 'automatic',
      description:
        'OpenID4VCI issuer written from the specifications (draft 13 and 1.0), independent of Inji; pre-authorized code offers.',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'],
        proofTypes: ['Ed25519Signature2020', 'eddsa-rdfc-2022', 'EdDSA', 'ES256'],
        didMethods: ['did:key', 'did:jwk', 'did:web'],
        vciProfiles: ['draft13', 'v1'],
        issuance: ['credential-offer', 'wallet-initiated'],
      },
      notes: ['ldp_vc as VC 1.1 with Ed25519Signature2020 unless a VC 2.0 configuration is requested.'],
    };
  }

  health(): Promise<Health> {
    return processHealth();
  }

  startIssuance(ctx: RunContext, request: IssuanceRequest): Promise<IssuanceStart> {
    const configurationId = request.credentialConfigurationId ?? DEFAULT_CONFIGURATION_FOR_FORMAT[request.format];
    const configuration = this.#hosting.issuer.configurations.find((entry) => entry.id === configurationId);
    if (!configurationId || !configuration) {
      throw new RoleError(
        'issuer.configuration-unknown',
        `the reference issuer has no credential configuration for ${request.format}${configurationId ? ` (${configurationId})` : ''}`,
      );
    }
    // A phone or another outside wallet that scans the offer reaches /ref/issuer and /ref/as without
    // saying which run it belongs to; the claims tie its requests to this run.
    this.#hub.claim(ctx.runId, INBOUND_TARGETS.issuer);
    this.#hub.claim(ctx.runId, INBOUND_TARGETS.as);
    const offer = this.#hosting.issuer.createOffer({
      profile: request.vciProfile,
      configurationId,
      byReference: true,
      ...(request.claims ? { claims: request.claims } : {}),
    });
    return Promise.resolve({
      mode: 'credential-offer',
      offerUri: offer.offerUri,
      credentialIssuer: offer.credentialIssuer,
      credentialConfigurationIds: offer.credentialConfigurationIds,
    });
  }
}
