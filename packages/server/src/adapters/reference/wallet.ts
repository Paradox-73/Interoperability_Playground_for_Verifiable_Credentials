/**
 * `ref-wallet`: a headless wallet in the playground server. It receives credentials with the
 * OpenID4VCI client of `@inji-playground/oid4vci` and presents them with the OpenID4VP client of
 * `@inji-playground/oid4vp`; every HTTP call goes through the run's recording fetch.
 *
 * Holder keys are made per run: Ed25519 for ldp_vc (an ldp_vp is signed with Ed25519Signature2020 or
 * eddsa-rdfc-2022), ES256 for SD-JWT VC (the combination Inji Certify accepted in the local trial). Both
 * are bound by did:jwk. The key is kept until the run presents, in a small per-run store.
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
import { PresentationClient } from '@inji-playground/oid4vp';
import { REFERENCE_WALLET_CLIENT_ID, type ReferenceHosting } from '../../hosting/reference-hosting.js';
import { SERVER_VERSION } from '../../version.js';
import { credentialFacts, processHealth, runFetch, toRoleError } from './common.js';

/** Runs whose holder keys are kept at most; older ones are dropped (their runs have long ended). */
const MAX_HELD_RUNS = 100;

export class ReferenceWalletRole implements WalletRole {
  readonly #hosting: ReferenceHosting;
  readonly #holderKeys = new Map<string, HolderKey>();

  constructor(hosting: ReferenceHosting) {
    this.#hosting = hosting;
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
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'],
        proofTypes: ['ES256', 'EdDSA', 'Ed25519Signature2020', 'eddsa-rdfc-2022'],
        didMethods: ['did:jwk', 'did:key', 'did:web'],
        vciProfiles: ['draft13', 'v1'],
        vpProfiles: ['inji-draft', 'final-1.0'],
        issuance: ['credential-offer', 'wallet-initiated'],
        responseModes: ['direct_post'],
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
        result = await acceptOffer(start.offerUri, { fetch, holderKey, onStep });
      } else {
        holderKey = holderKeyFor(guessFormat(start.credentialConfigurationId));
        result = await fetchViaAuthorizationCode(start.credentialIssuer, {
          configurationId: start.credentialConfigurationId,
          clientId: REFERENCE_WALLET_CLIENT_ID,
          redirectUri: this.#hosting.urls.walletCallback,
          clientAuth: { method: 'none' },
          fetch,
          holderKey,
          onStep,
        });
      }
    } catch (error) {
      throw toRoleError(error, 'vci');
    }

    const received = result.credentials[0];
    if (!received) throw new RoleError('wallet.no-credential', 'the issuer answered without a credential');
    const format = received.format as CredentialFormat;
    if (format !== 'ldp_vc' && format !== 'vc+sd-jwt' && format !== 'dc+sd-jwt') {
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
    const client = new PresentationClient({
      fetch: runFetch(ctx),
      holder: {
        keyPair: holderKey.keyPair,
        did: holderKey.did,
        ...(holderKey.kid ? { verificationMethod: holderKey.kid } : {}),
      },
      documentLoader: this.#hosting.documentLoader,
      didResolver: this.#hosting.didResolver,
    });
    try {
      const resolved = await client.resolveRequest(request.requestUri, ctx.signal);
      const matches = client.selectCredentials(resolved, [
        { id: credential.id, format: credential.format, raw: credential.raw },
      ]);
      const response = await client.buildResponse(resolved, matches);
      ctx.enterStep('wallet.submit');
      const tamper = ctx.hooks.tamperPresentation?.bind(ctx.hooks);
      let sentVpToken = response.form.vp_token ?? '';
      const submission = await client.submit(resolved, response, {
        signal: ctx.signal,
        beforeSubmit: async (vpToken, { format }) => {
          sentVpToken = tamper ? await tamper(vpToken, format) : vpToken;
          return sentVpToken;
        },
      });
      ctx.emit({
        type: 'artifact',
        runId: ctx.runId,
        kind: 'vp-token',
        format: credential.format,
        raw: sentVpToken,
      });
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
  return undefined;
}

/** Ed25519 for ldp_vc (ldp_vp proofs need it), ES256 otherwise; did:jwk binding in both cases. */
function holderKeyFor(format: CredentialFormat | undefined): HolderKey {
  return format === 'ldp_vc' ? createHolderKey('EdDSA', 'did:jwk') : createHolderKey('ES256', 'did:jwk');
}
