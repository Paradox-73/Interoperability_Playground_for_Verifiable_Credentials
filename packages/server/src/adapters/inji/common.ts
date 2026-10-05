/**
 * Shared by the Inji adapters: where the stack's services are, which image versions the stack runs,
 * health probes, and the `openid4vp://` request Inji Verify's own front ends build from a
 * `/vp-request` (or `/vp-session-request`) answer.
 */
import type { CredentialFormat, Health } from '@inji-playground/protocol';
import type { Config } from '../../config/index.js';
import { proxyTargets } from '../../recording/targets.js';

/** Image tags of `deploy/inji-stack/compose.yaml`; a report names the versions a run met. */
export const INJI_VERSIONS = {
  certify: '0.14.0',
  verifyService: '0.18.2',
  verifyUi: '0.18.2',
  mimoto: '0.22.0',
  injiWeb: '0.17.0',
} as const;

export const INJI_IMAGES = {
  certify: `injistack/inji-certify-with-plugins:${INJI_VERSIONS.certify}`,
  verifyService: `injistack/inji-verify-service:${INJI_VERSIONS.verifyService}`,
  verifyUi: `injistack/inji-verify-ui:${INJI_VERSIONS.verifyUi}`,
  mimoto: `injistack/mimoto:${INJI_VERSIONS.mimoto}`,
  injiWeb: `injistack/inji-web:${INJI_VERSIONS.injiWeb}`,
} as const;

/**
 * Client ids the playground uses at Inji Verify. Inji Verify 0.18 sends them unprefixed, which makes
 * them pre-registered clients (OpenID4VP 1.0 section 5.9.1); the reference wallet knows them.
 */
export const INJI_VERIFY_CLIENT_ID = 'ps02-playground';
export const INJI_VERIFY_SDK_CLIENT_ID = 'ps02-playground-sdk';

/** Base URLs of the Inji services for the server's own calls (host ports, or names in the bundle). */
export function injiUrls(config: Config) {
  const targets = proxyTargets(config);
  return {
    certify: targets.certify!.url.replace(/\/+$/, ''),
    verify: targets.verify!.url.replace(/\/+$/, ''),
    mimoto: targets.mimoto!.url.replace(/\/+$/, ''),
  };
}

/**
 * The `response_uri` Inji Verify hands wallets: `INJI_VERIFY_SUBMISSION_BASE_URL` of the stack (default
 * `http://verify-service:8080/v1/verify`) plus its direct-post path.
 */
export function injiVerifyResponseUris(
  config: Pick<Config, 'injiVerifySubmissionBaseUrl' | 'publicUrl'>,
): string[] {
  const bases = [
    config.injiVerifySubmissionBaseUrl,
    ...(config.publicUrl ? [`${config.publicUrl}/v1/verify`] : []),
  ];
  return bases.map((base) => `${base.replace(/\/+$/, '')}/vp-submission/direct-post`);
}

/** GET `url`; `up` on 2xx within the timeout, `down` otherwise. Never throws. */
export async function probe(url: string, timeoutMs = 8_000): Promise<Health> {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    return response.ok
      ? { status: 'up', checkedAt }
      : { status: 'down', checkedAt, detail: `HTTP ${response.status} from ${url}` };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.cause instanceof Error
          ? error.cause.message
          : error.message
        : String(error);
    return { status: 'down', checkedAt, detail: `${url}: ${reason}` };
  }
}

/** The farmer credential the playground asks Inji Verify for, as a Presentation Exchange definition. */
export function farmerPresentationDefinition(
  format: CredentialFormat,
  credentialType?: string,
): Record<string, unknown> {
  const sdJwt = format === 'vc+sd-jwt' || format === 'dc+sd-jwt';
  const formats = sdJwt
    ? {
        [format]: {
          'sd-jwt_alg_values': ['ES256', 'EdDSA', 'RS256'],
          'kb-jwt_alg_values': ['ES256', 'EdDSA', 'RS256'],
        },
      }
    : { ldp_vc: { proof_type: ['Ed25519Signature2020', 'Ed25519Signature2018', 'RsaSignature2018'] } };
  const field = sdJwt
    ? {
        path: ['$.vct'],
        filter: { type: 'string', ...(credentialType ? { const: credentialType } : {}) },
      }
    : {
        path: ['$.type'],
        filter: { type: 'array', contains: { const: credentialType ?? 'FarmerCredential' } },
      };
  return {
    id: `ps02-farmer-${format.replace(/\W+/g, '-')}`,
    purpose: 'Inji Interoperability Playground: present the farmer credential issued in this run',
    format: formats,
    input_descriptors: [{ id: 'farmer-credential', format: formats, constraints: { fields: [field] } }],
  };
}

/** `/vp-request` and `/vp-session-request` answers of verify-service 0.18 (the SDK's `QrData`). */
export interface InjiVpRequest {
  transactionId: string;
  requestId: string;
  authorizationDetails?: {
    clientId: string;
    presentationDefinition?: Record<string, unknown>;
    presentationDefinitionUri?: string;
    nonce: string;
    responseUri: string;
    responseType?: string;
    responseMode?: string;
  };
  requestUri?: string;
  expiresAt?: number;
}

/**
 * The wallet request exactly as `@injistack/react-inji-verify-sdk` 0.18.1 and the Inji Verify UI encode
 * it: `openid4vp://` with the authorization details by value and `state` = the request id.
 */
export function walletRequestUri(
  created: InjiVpRequest,
  clientName = 'Inji Interoperability Playground',
): string {
  const params = new URLSearchParams();
  const details = created.authorizationDetails;
  params.set('client_id', details?.clientId ?? '');
  if (created.requestUri) {
    params.set('request_uri', created.requestUri);
  } else if (details) {
    params.set('state', created.requestId);
    params.set('response_mode', details.responseMode ?? 'direct_post');
    params.set('response_type', details.responseType ?? 'vp_token');
    params.set('nonce', details.nonce);
    params.set('response_uri', details.responseUri);
    if (details.presentationDefinitionUri) {
      params.set('presentation_definition_uri', details.presentationDefinitionUri);
    } else {
      params.set('presentation_definition', JSON.stringify(details.presentationDefinition ?? {}));
    }
    params.set(
      'client_metadata',
      JSON.stringify({
        client_name: clientName,
        vp_formats: {
          ldp_vp: { proof_type: ['Ed25519Signature2018', 'Ed25519Signature2020', 'RsaSignature2018'] },
          'vc+sd-jwt': {
            'sd-jwt_alg_values': ['RS256', 'ES256', 'ES256K', 'EdDSA'],
            'kb-jwt_alg_values': ['RS256', 'ES256', 'ES256K', 'EdDSA'],
          },
        },
      }),
    );
  }
  return `openid4vp://authorize?${params.toString()}`;
}
