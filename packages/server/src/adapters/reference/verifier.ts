/**
 * `ref-verifier`: the playground's own OpenID4VP verifier (hosted at `/ref/verifier`) as the verifier
 * column of a run. `inji-draft` sends a Presentation Exchange definition in a signed request object
 * passed by reference (`request_uri`), as Inji Verify does; `final-1.0` sends a DCQL query.
 *
 * mso_mdoc requests always name a docType (Presentation Exchange needs it as the input descriptor id,
 * ISO/IEC TS 18013-7 Annex B.3.1.1) and, unless the run names claims, ask for four of the farmer's seven
 * elements, so every mdoc run also exercises selective disclosure.
 */
import {
  type Health,
  type PresentationRequestRef,
  type PresentationSpec,
  type RoleDescriptor,
  type RunContext,
  type VerificationResult,
  type VerifierRole,
} from '@inji-playground/protocol';
import { FARMER_MDOC_DOCTYPE, FARMER_MDOC_NAMESPACE } from '@inji-playground/oid4vci';
import { toVerificationResult } from '@inji-playground/oid4vp';
import type { CaptureHub } from '../../recording/capture-hub.js';
import { INBOUND_TARGETS } from '../../recording/inbound.js';
import type { ReferenceHosting } from '../../hosting/reference-hosting.js';
import { SERVER_VERSION } from '../../version.js';
import { processHealth, toRoleError } from './common.js';

/** Farmer elements an mso_mdoc request asks for by default (birthDate, landArea and primaryCropType stay undisclosed). */
const DEFAULT_MDOC_ELEMENTS = ['farmerId', 'givenName', 'familyName', 'state'];

export class ReferenceVerifierRole implements VerifierRole {
  readonly #hosting: ReferenceHosting;
  readonly #hub: CaptureHub;

  constructor(hosting: ReferenceHosting, hub: CaptureHub) {
    this.#hosting = hosting;
    this.#hub = hub;
  }

  describe(): RoleDescriptor {
    return {
      id: 'ref-verifier',
      kind: 'verifier',
      name: 'Reference verifier',
      ecosystem: 'reference',
      version: SERVER_VERSION,
      interaction: 'automatic',
      description:
        'OpenID4VP verifier written from the specifications, independent of Inji: Presentation Exchange (inji-draft) and DCQL (final-1.0).',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc'],
        proofTypes: ['Ed25519Signature2020', 'eddsa-rdfc-2022', 'EdDSA', 'ES256'],
        didMethods: ['did:key', 'did:jwk', 'did:web'],
        vpProfiles: ['inji-draft', 'final-1.0'],
        responseModes: ['direct_post'],
      },
    };
  }

  health(): Promise<Health> {
    return processHealth();
  }

  createRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestRef> {
    const mdoc = spec.format === 'mso_mdoc';
    const credentialType = spec.credentialType ?? (mdoc ? FARMER_MDOC_DOCTYPE : undefined);
    const claims =
      spec.claims ??
      (mdoc ? DEFAULT_MDOC_ELEMENTS.map((name) => `${FARMER_MDOC_NAMESPACE}/${name}`) : undefined);
    // Outside wallets fetch the request object and post the response without naming the run.
    this.#hub.claim(ctx.runId, INBOUND_TARGETS.verifier);
    try {
      const created = this.#hosting.verifier.createRequest({
        profile: spec.vpProfile,
        format: spec.format,
        query: {
          ...(credentialType ? { type: credentialType } : {}),
          ...(claims ? { claims } : {}),
        },
        clientIdScheme: 'did',
        byReference: true,
      });
      if (created.requestObject) {
        ctx.emit({ type: 'artifact', runId: ctx.runId, kind: 'request-object', raw: created.requestObject });
      }
      return Promise.resolve(created.ref);
    } catch (error) {
      throw toRoleError(error, 'vp');
    }
  }

  async awaitResult(ctx: RunContext, ref: PresentationRequestRef): Promise<VerificationResult> {
    try {
      // The step timeout ends the wait through the signal; the library's own timeout is only a backstop.
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
