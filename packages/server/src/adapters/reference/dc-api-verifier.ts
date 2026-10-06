/**
 * `ref-verifier-dc-api`: the reference verifier asking through the W3C Digital Credentials API instead of a
 * QR code (OpenID4VP 1.0 Appendix A). It creates an unsigned request with `response_mode` `dc_api`, which a
 * page of this server passes to `navigator.credentials.get()`; the page posts the browser's answer back to
 * `/ref/verifier/dc-api/responses/{handle}`, and the verifier checks that the presentation is bound to the
 * origin of that page (`origin:<origin>`).
 *
 * The request is identified by its URL on this server (`/ref/verifier/dc-api/requests/{handle}`), which is what
 * wallets in this playground receive as `requestUri`: the browser wallet role shows it to the person, and the
 * reference wallet answers it in-process the way a browser and a platform wallet together would.
 */
import {
  RoleError,
  type Health,
  type PresentationRequestRef,
  type PresentationSpec,
  type RoleDescriptor,
  type RunContext,
  type VerificationResult,
  type VerifierRole,
} from '@inji-playground/protocol';
import { toVerificationResult } from '@inji-playground/oid4vp';
import type { CaptureHub } from '../../recording/capture-hub.js';
import { INBOUND_TARGETS } from '../../recording/inbound.js';
import type { ReferenceHosting } from '../../hosting/reference-hosting.js';
import { SERVER_VERSION } from '../../version.js';
import { processHealth, toRoleError } from './common.js';

/** Path of a Digital Credentials API request on the verifier, as wallets of this playground see it. */
export const DC_API_REQUEST_PATH = '/dc-api/requests/';

/** True when `requestUri` names a Digital Credentials API request of the reference verifier. */
export function isDcApiRequestUri(requestUri: string): boolean {
  try {
    return new URL(requestUri).pathname.includes(`/ref/verifier${DC_API_REQUEST_PATH}`);
  } catch {
    return false;
  }
}

/** The response URL that belongs to a request URL (`.../requests/{h}` -> `.../responses/{h}`). */
export function dcApiResponseUri(requestUri: string): string {
  return requestUri.replace('/dc-api/requests/', '/dc-api/responses/');
}

export class ReferenceDcApiVerifierRole implements VerifierRole {
  readonly #hosting: ReferenceHosting;
  readonly #hub: CaptureHub;
  readonly #origins: readonly string[];

  /** @param origins the origins of this server's pages (`selfOriginsFor`), which may call the browser API */
  constructor(hosting: ReferenceHosting, hub: CaptureHub, origins: readonly string[]) {
    this.#hosting = hosting;
    this.#hub = hub;
    this.#origins = origins;
  }

  describe(): RoleDescriptor {
    return {
      id: 'ref-verifier-dc-api',
      kind: 'verifier',
      name: 'Reference verifier (Digital Credentials API)',
      ecosystem: 'reference',
      version: SERVER_VERSION,
      interaction: 'automatic',
      description:
        'The reference verifier asking through the W3C Digital Credentials API: an unsigned OpenID4VP 1.0 request with response_mode dc_api, answered through the browser and bound to the page origin.',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'],
        proofTypes: ['Ed25519Signature2020', 'eddsa-rdfc-2022', 'EdDSA', 'ES256'],
        didMethods: ['did:key', 'did:jwk', 'did:web'],
        vpProfiles: ['final-1.0'],
        responseModes: ['dc_api'],
      },
      notes: [
        'OpenID4VP 1.0 Appendix A: the Digital Credentials API exists only for OpenID4VP 1.0, so the inji-draft profile is not offered.',
        `Pages of these origins may ask: ${this.#origins.join(', ')}.`,
      ],
    };
  }

  health(): Promise<Health> {
    return processHealth();
  }

  createRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestRef> {
    if (spec.format === 'mso_mdoc') {
      throw new RoleError('verifier.format-unsupported', 'the reference verifier does not request mso_mdoc');
    }
    // The browser page fetches the request and posts the answer without naming the run.
    this.#hub.claim(ctx.runId, INBOUND_TARGETS.verifier);
    try {
      const verifier = this.#hosting.verifier;
      const created = verifier.createDcApiRequest({
        format: spec.format,
        origins: this.#origins,
        query: {
          ...(spec.credentialType ? { type: spec.credentialType } : {}),
          ...(spec.claims ? { claims: spec.claims } : {}),
        },
      });
      ctx.emit({
        type: 'artifact',
        runId: ctx.runId,
        kind: 'request-object',
        raw: JSON.stringify(created.request, null, 2),
      });
      return Promise.resolve({
        requestUri: `${verifier.baseUrl}${DC_API_REQUEST_PATH}${created.handle}`,
        handle: created.handle,
        queryKind: 'dcql_query',
        nonce: created.nonce,
        clientId: created.clientIds[0]!,
      });
    } catch (error) {
      throw toRoleError(error, 'vp');
    }
  }

  async awaitResult(ctx: RunContext, ref: PresentationRequestRef): Promise<VerificationResult> {
    try {
      const report = await this.#hosting.verifier.awaitResult(ref.handle, {
        signal: ctx.signal,
        timeoutMs: 3_600_000,
      });
      return toVerificationResult(report);
    } catch (error) {
      throw toRoleError(error, 'vp');
    }
  }
}
