// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `ref-wallet`: a headless wallet in the playground server. It receives credentials with the
 * OpenID4VCI client of `@inji-playground/oid4vci` and presents them with the OpenID4VP client of
 * `@inji-playground/oid4vp`; every HTTP call goes through the run's recording fetch.
 *
 * Holder keys are made per run: Ed25519 for ldp_vc (an ldp_vp is signed with Ed25519Signature2020 or
 * eddsa-rdfc-2022), ES256 for SD-JWT VC (the combination Inji Certify accepted in the local trial), both
 * bound by did:jwk; and for mso_mdoc a P-256 key sent as `jwk` in the key proof, which the issuer turns
 * into the mdoc's COSE_Key device key (`cose_key` binding, OpenID4VCI 1.0 Appendix A.2.2). The key is
 * kept until the run presents, in a small per-run store.
 *
 * The run's scenario (`@inji-playground/scenarios`) decides how the wallet presents: the holder DID
 * form, presenting a credential the request did not ask for, and the presentation tamper applied just
 * before the post. For `vp-replay` the wallet replays the `vp_token` it last sent, untampered, to the
 * same verifier in the same format and profile, so such a run needs an earlier happy run.
 */
import {
  RoleError,
  type CredentialFormat,
  type Health,
  type HeldCredential,
  type IssuanceStart,
  type PresentationRequestRef,
  type RoleDescriptor,
  type RunContext,
  type SubmissionReceipt,
  type WalletRole,
} from '@inji-playground/protocol';
import {
  acceptOffer,
  createHolderKey,
  fetchViaAuthorizationCode,
  type HolderKey,
  type IssuanceResult,
} from '@inji-playground/oid4vci';
import {
  PresentationClient,
  dcApiResponse,
  resolveDcApiRequest,
  type DcApiRequest,
  type DcApiResponse,
  type PresentationClientOptions,
  type ResolvedRequest,
} from '@inji-playground/oid4vp';
import {
  findScenarioDefinition,
  respondWithScenario,
  walletClientOptions,
  type ScenarioDefinition,
} from '@inji-playground/scenarios';
import { REFERENCE_WALLET_CLIENT_ID, type ReferenceHosting } from '../../hosting/reference-hosting.js';
import { SERVER_VERSION } from '../../version.js';
import { credentialFacts, processHealth, runFetch, toRoleError } from './common.js';
import { dcApiResponseUri, isDcApiRequestUri } from './dc-api-verifier.js';

/** Runs whose holder keys are kept at most; older ones are dropped (their runs have long ended). */
const MAX_HELD_RUNS = 100;
/** Earlier presentations kept for `vp-replay`, one per verifier, profile and format. */
const MAX_EARLIER_PRESENTATIONS = 100;

export interface ReferenceWalletOptions {
  /** Verifiers with unprefixed client ids the wallet trusts (Inji Verify), with their response URIs. */
  preRegisteredClients?: PresentationClientOptions['preRegisteredClients'];
}

export class ReferenceWalletRole implements WalletRole {
  readonly #hosting: ReferenceHosting;
  readonly #options: ReferenceWalletOptions;
  readonly #holderKeys = new Map<string, HolderKey>();
  readonly #earlier = new Map<string, string>();

  constructor(hosting: ReferenceHosting, options: ReferenceWalletOptions = {}) {
    this.#hosting = hosting;
    this.#options = options;
  }

  describe(): RoleDescriptor {
    return {
      id: 'ref-wallet',
      kind: 'wallet',
      name: 'Reference wallet (headless)',
      ecosystem: 'reference',
      version: SERVER_VERSION,
      interaction: 'automatic',
      description:
        'Headless wallet in the playground server: OpenID4VCI and OpenID4VP clients written from the specifications, independent of Inji.',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc'],
        proofTypes: ['ES256', 'EdDSA', 'Ed25519Signature2020', 'eddsa-rdfc-2022'],
        didMethods: ['did:jwk', 'did:key', 'did:web'],
        vciProfiles: ['draft13', 'v1'],
        vpProfiles: ['inji-draft', 'final-1.0'],
        issuance: ['credential-offer', 'wallet-initiated'],
        // dc_api: answers a Digital Credentials API request in-process, as a browser and a platform wallet would.
        responseModes: ['direct_post', 'dc_api'],
      },
    };
  }

  health(): Promise<Health> {
    return processHealth();
  }

  async receiveCredential(ctx: RunContext, start: IssuanceStart): Promise<HeldCredential> {
    let result: IssuanceResult;
    let holderKey: HolderKey | undefined;
    try {
      const fetch = runFetch(ctx);
      // The orchestrator already showed `issuer.offer` while the issuer made the offer; resolving it by
      // reference is recorded and tagged as the offer step, but does not move the timeline back.
      const onStep = (step: Parameters<RunContext['enterStep']>[0]): void => {
        if (step !== 'issuer.offer') ctx.enterStep(step);
      };
      if (start.mode === 'credential-offer') {
        // The offer does not say the format before it is resolved; the configuration id usually does.
        holderKey = holderKeyFor(guessFormat(start.credentialConfigurationIds[0]));
        result = await acceptOffer(start.offerUri, {
          fetch,
          holderKey,
          holderKeyFor: keyForMetadata,
          onStep,
        });
      } else {
        holderKey = holderKeyFor(guessFormat(start.credentialConfigurationId));
        result = await fetchViaAuthorizationCode(start.credentialIssuer, {
          configurationId: start.credentialConfigurationId,
          clientId: REFERENCE_WALLET_CLIENT_ID,
          redirectUri: this.#hosting.urls.walletCallback,
          clientAuth: { method: 'none' },
          fetch,
          holderKey,
          holderKeyFor: keyForMetadata,
          onStep,
        });
      }
    } catch (error) {
      throw toRoleError(error, 'vci');
    }

    const received = result.credentials[0];
    if (!received) throw new RoleError('wallet.no-credential', 'the issuer answered without a credential');
    const format = received.format as CredentialFormat;
    if (format !== 'ldp_vc' && format !== 'vc+sd-jwt' && format !== 'dc+sd-jwt' && format !== 'mso_mdoc') {
      throw new RoleError('wallet.format-unsupported', `the reference wallet cannot hold ${received.format}`);
    }
    this.#remember(ctx.runId, result.holderKey);
    const facts = credentialFacts(received.raw, format);
    return {
      id: `${ctx.runId}-credential`,
      format,
      raw: received.raw,
      credentialIssuer: result.credentialIssuer,
      credentialConfigurationId: received.configurationId,
      ...(result.holderKey.kid ? { holderKeyId: result.holderKey.kid } : {}),
      holderProofType: result.holderKey.keyPair.alg,
      ...(facts.proofType ? { proofType: facts.proofType } : {}),
      ...(facts.issuerDid ? { issuerDid: facts.issuerDid } : {}),
      receivedAt: new Date().toISOString(),
    };
  }

  async present(
    ctx: RunContext,
    request: PresentationRequestRef,
    credential: HeldCredential,
  ): Promise<SubmissionReceipt> {
    const holderKey = this.#holderKeys.get(ctx.runId);
    if (!holderKey) {
      throw new RoleError(
        'wallet.holder-key-missing',
        'the reference wallet holds no key for this run (the server restarted after issuance?)',
        { category: 'environment' },
      );
    }
    const scenario: Partial<ScenarioDefinition> = findScenarioDefinition(ctx.scenario.id) ?? {};
    if (isDcApiRequestUri(request.requestUri)) {
      try {
        return await this.#presentDcApi(ctx, request, credential, holderKey, scenario);
      } catch (error) {
        throw toRoleError(error, 'vp');
      } finally {
        this.#holderKeys.delete(ctx.runId);
      }
    }
    const client = new PresentationClient({
      fetch: runFetch(ctx),
      holder: {
        keyPair: holderKey.keyPair,
        did: holderKey.did,
        ...(holderKey.kid ? { verificationMethod: holderKey.kid } : {}),
      },
      documentLoader: this.#hosting.documentLoader,
      didResolver: this.#hosting.didResolver,
      ...walletClientOptions(scenario),
      ...(this.#options.preRegisteredClients
        ? { preRegisteredClients: this.#options.preRegisteredClients }
        : {}),
    });
    const hookTamper = ctx.hooks.tamperPresentation?.bind(ctx.hooks);
    const earlierKey = (resolved: ResolvedRequest): string =>
      `${resolved.clientId} ${resolved.profile} ${credential.format}`;
    let sentVpToken: string | undefined;
    try {
      const submission = await respondWithScenario(
        client,
        request.requestUri,
        [{ id: credential.id, format: credential.format, raw: credential.raw }],
        scenario,
        {
          holderKey: holderKey.keyPair,
          documentLoader: this.#hosting.documentLoader,
          earlierVpToken: (resolved) =>
            scenario.presentationTamper === 'replay-earlier'
              ? this.#earlierFor(earlierKey(resolved), resolved)
              : undefined,
          signal: ctx.signal,
          beforePost: () => ctx.enterStep('wallet.submit'),
          finalVpToken: async (vpToken, format) => {
            sentVpToken = hookTamper ? await hookTamper(vpToken, format as CredentialFormat) : vpToken;
            return sentVpToken;
          },
        },
      );
      if (sentVpToken !== undefined) {
        ctx.emit({
          type: 'artifact',
          runId: ctx.runId,
          kind: 'vp-token',
          format: credential.format,
          raw: sentVpToken,
        });
        const genuine = !scenario.presentationTamper && !scenario.credentialTamper && !hookTamper;
        if (genuine && submission.status >= 200 && submission.status < 300) {
          this.#keepEarlier(earlierKey(submission.request), sentVpToken);
        }
      }
      return {
        submittedAt: new Date().toISOString(),
        status: submission.status,
        ...(submission.redirectUri ? { redirectUri: submission.redirectUri } : {}),
      };
    } catch (error) {
      throw toRoleError(error, 'vp');
    } finally {
      this.#holderKeys.delete(ctx.runId);
    }
  }

  /**
   * A Digital Credentials API request (OpenID4VP 1.0 Appendix A), answered the way a browser and a wallet on
   * the device would: read the request, answer it for the page's origin (the verifier's own origin, where
   * its page runs), and post the answer as the page does. Presentation tampers come through the run's hook.
   */
  async #presentDcApi(
    ctx: RunContext,
    request: PresentationRequestRef,
    credential: HeldCredential,
    holderKey: HolderKey,
    scenario: Partial<ScenarioDefinition>,
  ): Promise<SubmissionReceipt> {
    if (scenario.presentationTamper && !ctx.hooks.tamperPresentation) {
      throw new RoleError(
        'wallet.scenario-unsupported',
        `the scenario ${ctx.scenario.id} changes the presentation in a way the Digital Credentials API path does not apply`,
      );
    }
    const fetch = runFetch(ctx);
    const origin = new URL(request.requestUri).origin;
    ctx.enterStep('wallet.fetch-request');
    const fetched = await fetch(request.requestUri, { headers: { accept: 'application/json' } });
    if (!fetched.ok) {
      throw new RoleError(
        'wallet.request-unavailable',
        `the Digital Credentials API request answered HTTP ${fetched.status}`,
      );
    }
    const answer = await this.answerDcApi(
      ctx.runId,
      (await fetched.json()) as DcApiRequest,
      origin,
      credential,
      holderKey,
    );
    const hookTamper = ctx.hooks.tamperPresentation?.bind(ctx.hooks);
    if (hookTamper) {
      const grouped = answer.data.vp_token as Record<string, unknown[]>;
      for (const [queryId, presentations] of Object.entries(grouped)) {
        grouped[queryId] = await Promise.all(
          presentations.map(async (presentation) => {
            const encoded = typeof presentation === 'string' ? presentation : JSON.stringify(presentation);
            const changed = await hookTamper(encoded, credential.format);
            return typeof presentation === 'string' ? changed : (JSON.parse(changed) as unknown);
          }),
        );
      }
    }
    ctx.emit({
      type: 'artifact',
      runId: ctx.runId,
      kind: 'vp-token',
      format: credential.format,
      raw: JSON.stringify(answer.data.vp_token),
    });
    ctx.enterStep('wallet.submit');
    const posted = await fetch(dcApiResponseUri(request.requestUri), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(answer),
    });
    return { submittedAt: new Date().toISOString(), status: posted.status };
  }

  /**
   * The answer a wallet returns through `navigator.credentials.get()` for `request`, from a page at `origin`,
   * with the credential and holder key this wallet holds for the run. Used by `present` and by the browser
   * wallet role, whose page asks the playground to answer when the browser has no wallet for the request.
   */
  async answerDcApi(
    runId: string,
    request: DcApiRequest,
    origin: string,
    credential: HeldCredential,
    holderKey = this.#holderKeys.get(runId),
  ): Promise<DcApiResponse> {
    if (!holderKey) {
      throw new RoleError('wallet.holder-key-missing', 'the reference wallet holds no key for this run', {
        category: 'environment',
      });
    }
    const client = new PresentationClient({
      // The request came with the call; answering it needs no network.
      fetch: (url) =>
        Promise.reject(new Error(`no network call expected in a Digital Credentials API answer (${url})`)),
      holder: {
        keyPair: holderKey.keyPair,
        did: holderKey.did,
        ...(holderKey.kid ? { verificationMethod: holderKey.kid } : {}),
      },
      documentLoader: this.#hosting.documentLoader,
      didResolver: this.#hosting.didResolver,
    });
    const resolved = resolveDcApiRequest(request, origin);
    const matches = client.selectCredentials(resolved, [
      { id: credential.id, format: credential.format, raw: credential.raw },
    ]);
    return dcApiResponse(await client.buildResponse(resolved, matches));
  }

  /** Forgets the holder key of a run whose presentation another role made (the browser wallet). */
  release(runId: string): void {
    this.#holderKeys.delete(runId);
  }

  /** The presentation to replay; throws, before anything is posted, when there is none. */
  #earlierFor(key: string, resolved: ResolvedRequest): string {
    const earlier = this.#earlier.get(key);
    if (earlier !== undefined) return earlier;
    throw new RoleError(
      'wallet.no-earlier-presentation',
      `vp-replay sends again a vp_token this wallet sent earlier to the same verifier (${resolved.clientId}, ${resolved.profile}); run the happy path with this verifier and format first`,
      { category: 'environment' },
    );
  }

  #keepEarlier(key: string, vpToken: string): void {
    this.#earlier.delete(key);
    this.#earlier.set(key, vpToken);
    while (this.#earlier.size > MAX_EARLIER_PRESENTATIONS) {
      const oldest = this.#earlier.keys().next().value;
      if (oldest === undefined) break;
      this.#earlier.delete(oldest);
    }
  }

  #remember(runId: string, key: HolderKey): void {
    this.#holderKeys.set(runId, key);
    while (this.#holderKeys.size > MAX_HELD_RUNS) {
      const oldest = this.#holderKeys.keys().next().value;
      if (oldest === undefined) break;
      this.#holderKeys.delete(oldest);
    }
  }
}

/** The format a configuration id names, by the naming used by the reference issuer and Inji Certify. */
function guessFormat(configurationId: string | undefined): CredentialFormat | undefined {
  const id = (configurationId ?? '').toLowerCase();
  if (id.includes('ldp')) return 'ldp_vc';
  if (id.includes('sd_jwt') || id.includes('sd-jwt') || id.includes('sdjwt')) return 'vc+sd-jwt';
  if (id.includes('mdoc') || id.includes('mdl')) return 'mso_mdoc';
  return undefined;
}

/**
 * The key for the format the issuer metadata names: Inji Certify's configuration ids (FarmerCredential)
 * do not tell the format, and an ldp_vc needs the Ed25519 key that Inji Verify accepts in an ldp_vp (G15).
 */
function keyForMetadata(configuration: Record<string, unknown>): HolderKey {
  const format =
    typeof configuration.format === 'string' ? (configuration.format as CredentialFormat) : undefined;
  const algs = (
    configuration.proof_types_supported as { jwt?: { proof_signing_alg_values_supported?: unknown } }
  )?.jwt?.proof_signing_alg_values_supported;
  // An issuer that takes no Ed25519 proof (FarmerCredential_ldp_vc_es256_proof) gets a P-256 key.
  if (format === 'ldp_vc' && Array.isArray(algs) && !algs.includes('EdDSA') && !algs.includes('Ed25519')) {
    return createHolderKey('ES256', 'did:jwk');
  }
  return holderKeyFor(format);
}

/**
 * Ed25519 for ldp_vc (ldp_vp proofs need it), ES256 otherwise, with did:jwk binding; for mso_mdoc a
 * P-256 key named by `jwk` (the device key is a COSE_Key, not a DID).
 */
function holderKeyFor(format: CredentialFormat | undefined): HolderKey {
  if (format === 'mso_mdoc') return createHolderKey('ES256', 'jwk');
  return format === 'ldp_vc' ? createHolderKey('EdDSA', 'did:jwk') : createHolderKey('ES256', 'did:jwk');
}
