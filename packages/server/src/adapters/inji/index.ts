/**
 * Adapters for the Inji modules of the local stack (`deploy/inji-stack`): Inji Certify as an issuer,
 * Inji Verify as a verifier (its API, and its official web component in the page).
 *
 * They are registered only when `PLAYGROUND_STACK` says a stack is expected (`host` or `bundle`): without
 * one they could only fail, and the reference roles cover runs without Docker.
 */
import type { AnyRole, StackMode, StackServiceStatus, StackStatus } from '@inji-playground/protocol';
import type { Config } from '../../config/index.js';
import type { CaptureHub } from '../../recording/capture-hub.js';
import { InjiCertifyRole } from './certify.js';
import { INJI_IMAGES, injiUrls, probe } from './common.js';
import { InjiVerifyRole, InjiVerifySdkRole } from './verify.js';

export { CERTIFY_CONFIGURATION_FOR_FORMAT, FARMER_CLAIMS, InjiCertifyRole } from './certify.js';
export {
  INJI_IMAGES,
  INJI_VERIFY_CLIENT_ID,
  INJI_VERIFY_SDK_CLIENT_ID,
  INJI_VERSIONS,
  farmerPresentationDefinition,
  injiVerifyResponseUris,
  walletRequestUri,
  type InjiVpRequest,
} from './common.js';
export { InjiVerifyRole, InjiVerifySdkRole, outcomeOfInjiResult, type InjiVpResultV2 } from './verify.js';

export interface InjiRoleOptions {
  config: Config;
  hub: CaptureHub;
  /** Receives Inji Certify's certificates, for the reference verifier's x5c trust anchors. */
  onCertifyTrustAnchors?: (pems: string[]) => void;
}

/** Role implementations backed by Inji containers; none when no stack is expected. */
export function injiRoles(options?: InjiRoleOptions): AnyRole[] {
  if (!options || options.config.stack === 'off') return [];
  const urls = injiUrls(options.config);
  return [
    new InjiCertifyRole({
      baseUrl: urls.certify,
      ...(options.onCertifyTrustAnchors ? { onTrustAnchors: options.onCertifyTrustAnchors } : {}),
    }),
    new InjiVerifyRole(urls.verify),
    new InjiVerifySdkRole({ baseUrl: urls.verify, hub: options.hub }),
  ];
}

/** Health and image tags of the stack's services, probed from this server. */
export async function stackStatus(mode: StackMode, config?: Config): Promise<StackStatus> {
  const checkedAt = new Date().toISOString();
  if (mode === 'off' || !config) return { mode, checkedAt, services: [] };
  const urls = injiUrls(config);
  const services: Array<Omit<StackServiceStatus, 'health'> & { probeUrl: string }> = [
    {
      name: 'certify',
      image: INJI_IMAGES.certify,
      url: urls.certify,
      probeUrl: `${urls.certify}/v1/certify/issuance/.well-known/openid-credential-issuer`,
    },
    {
      name: 'verify-service',
      image: INJI_IMAGES.verifyService,
      url: urls.verify,
      probeUrl: `${urls.verify}/v1/verify/did.json`,
    },
    {
      name: 'mimoto',
      image: INJI_IMAGES.mimoto,
      url: urls.mimoto,
      probeUrl: `${urls.mimoto}/v1/mimoto/issuers`,
    },
  ];
  const probed = await Promise.all(
    services.map(async ({ probeUrl, ...service }) => ({ ...service, health: await probe(probeUrl, 5_000) })),
  );
  return { mode, checkedAt, services: probed };
}
