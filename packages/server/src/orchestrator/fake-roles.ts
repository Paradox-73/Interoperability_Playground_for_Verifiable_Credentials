/**
 * Fake roles for tests and for exercising the UI before real roles exist. They speak no protocol and
 * make no HTTP calls: the "credential" is a small JSON document with a SHA-256 digest standing in for a
 * signature, handed between the fakes in memory. They are registered only when
 * `PLAYGROUND_FAKE_ROLES=1` is set, their names say "Test role (fake)", and they are never used in the
 * documentation or the demo.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  CREDENTIAL_FORMATS,
  RoleError,
  type AnyRole,
  type Ecosystem,
  type Health,
  type HeldCredential,
  type Interaction,
  type IssuanceStart,
  type IssuerRole,
  type Outcome,
  type PresentationRequestRef,
  type RoleDescriptor,
  type RunContext,
  type SubmissionReceipt,
  type VerificationResult,
  type VerifierRole,
  type WalletRole,
} from '@inji-playground/protocol';

type FakeMethod = 'startIssuance' | 'receiveCredential' | 'createRequest' | 'present' | 'awaitResult';

export interface FakeRoleOptions {
  id?: string;
  name?: string;
  /** `inji` makes runs with this role live runs (serialised), as with a real Inji module. */
  ecosystem?: Ecosystem;
  interaction?: Interaction;
  version?: string;
  formats?: RoleDescriptor['capabilities']['formats'];
  vciProfiles?: RoleDescriptor['capabilities']['vciProfiles'];
  vpProfiles?: RoleDescriptor['capabilities']['vpProfiles'];
  /** Throw a `RoleError` from this method. */
  failIn?: FakeMethod;
  failWith?: { code: string; message: string; category?: 'interop' | 'environment' };
  /** Wait this long (honouring the run's signal) at the start of every method, or per method. */
  delayMs?: number | Partial<Record<FakeMethod, number>>;
  /** Never answer from this method (until the run's signal aborts); for timeout tests. */
  hangIn?: FakeMethod;
  /** Verifier only: answer this outcome instead of checking the presentation. */
  outcome?: Outcome;
  health?: Health['status'];
}

/** In-memory "network" between the fakes of one set: presentations by request handle. */
export class FakeNetwork {
  readonly submissions = new Map<string, string>();
}

const FAKE_ISSUER = 'https://fake-issuer.invalid';

function descriptor(
  kind: RoleDescriptor['kind'],
  options: FakeRoleOptions,
  defaults: Partial<RoleDescriptor>,
) {
  return {
    id: options.id ?? `fake-${kind}`,
    kind,
    name: options.name ?? `Test role (fake) ${kind}`,
    ecosystem: options.ecosystem ?? 'reference',
    version: options.version ?? 'fake',
    interaction: options.interaction ?? 'automatic',
    description: 'Development-only stand-in that speaks no protocol; for tests and UI work.',
    ...defaults,
    capabilities: {
      formats: options.formats ?? [...CREDENTIAL_FORMATS],
      proofTypes: ['FakeDigest'],
      didMethods: ['did:key'],
      ...(options.vciProfiles ? { vciProfiles: options.vciProfiles } : {}),
      ...(options.vpProfiles ? { vpProfiles: options.vpProfiles } : {}),
    },
  } satisfies RoleDescriptor;
}

/** Applies the delay, hang and failure options of a fake at the start of a method. */
async function behave(options: FakeRoleOptions, method: FakeMethod, ctx: RunContext): Promise<void> {
  const delay = typeof options.delayMs === 'number' ? options.delayMs : options.delayMs?.[method];
  if (delay) await sleep(delay, ctx.signal);
  if (options.hangIn === method) await sleep(Number.POSITIVE_INFINITY, ctx.signal);
  if (options.failIn === method) {
    const failure = options.failWith ?? { code: 'fake.failure', message: `fake failure in ${method}` };
    throw new RoleError(
      failure.code,
      failure.message,
      failure.category ? { category: failure.category } : {},
    );
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const timer = Number.isFinite(ms) ? setTimeout(done, ms) : undefined;
    function done(): void {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(timer);
      reject(signal.reason as Error);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function digest(payload: string): string {
  return createHash('sha256').update(payload).digest('base64url');
}

function health(options: FakeRoleOptions): Promise<Health> {
  return Promise.resolve({ status: options.health ?? 'up', checkedAt: new Date().toISOString() });
}

export function createFakeIssuer(options: FakeRoleOptions = {}): IssuerRole {
  const describe = descriptor('issuer', options, {});
  return {
    describe: () => describe,
    health: () => health(options),
    async startIssuance(ctx, request): Promise<IssuanceStart> {
      await behave(options, 'startIssuance', ctx);
      const offer = {
        credential_issuer: FAKE_ISSUER,
        credential_configuration_ids: [`Fake_${request.format}`],
      };
      return {
        mode: 'credential-offer',
        offerUri: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`,
        credentialIssuer: FAKE_ISSUER,
        credentialConfigurationIds: offer.credential_configuration_ids,
      };
    },
  };
}

export function createFakeWallet(network: FakeNetwork, options: FakeRoleOptions = {}): WalletRole {
  const describe = descriptor('wallet', options, {});
  const manual = (options.interaction ?? 'automatic') === 'manual';
  return {
    describe: () => describe,
    health: () => health(options),
    async receiveCredential(ctx, start): Promise<HeldCredential> {
      await behave(options, 'receiveCredential', ctx);
      if (manual && start.mode === 'credential-offer') {
        ctx.enterStep('person.action');
        await ctx.waitForPerson({
          id: randomUUID(),
          kind: 'scan-offer',
          title: 'Scan the credential offer',
          instructions: ['This fake wallet only waits: press "Done" to continue.'],
          qrText: start.offerUri,
          timeoutMs: 600_000,
        });
      }
      ctx.enterStep('credential');
      const configurationId =
        start.mode === 'credential-offer' ? start.credentialConfigurationIds[0] : undefined;
      const format = CREDENTIAL_FORMATS.find((name) => configurationId === `Fake_${name}`) ?? 'ldp_vc';
      const payload = JSON.stringify({
        fake: true,
        format,
        subject: { name: 'Test Person' },
        issuedAt: Date.now(),
      });
      return {
        id: randomUUID(),
        format,
        raw: `${payload}~${digest(payload)}`,
        credentialIssuer: start.credentialIssuer,
        proofType: 'FakeDigest',
        receivedAt: new Date().toISOString(),
      };
    },
    async present(
      ctx,
      request: PresentationRequestRef,
      credential: HeldCredential,
    ): Promise<SubmissionReceipt> {
      await behave(options, 'present', ctx);
      if (manual) {
        ctx.enterStep('person.action');
        await ctx.waitForPerson({
          id: randomUUID(),
          kind: 'scan-request',
          title: 'Scan the presentation request',
          instructions: ['This fake wallet only waits: press "Done" to continue.'],
          qrText: request.requestUri,
          timeoutMs: 600_000,
        });
      }
      ctx.enterStep('wallet.submit');
      const vpToken = ctx.hooks.tamperPresentation
        ? await ctx.hooks.tamperPresentation(credential.raw, credential.format)
        : credential.raw;
      ctx.emit({
        type: 'artifact',
        runId: ctx.runId,
        kind: 'vp-token',
        format: credential.format,
        raw: vpToken,
      });
      network.submissions.set(request.handle, vpToken);
      return { submittedAt: new Date().toISOString(), status: 200 };
    },
  };
}

export function createFakeVerifier(network: FakeNetwork, options: FakeRoleOptions = {}): VerifierRole {
  const describe = descriptor('verifier', options, {});
  const viaCallback = options.interaction === 'browser';
  return {
    describe: () => describe,
    health: () => health(options),
    async createRequest(ctx, spec): Promise<PresentationRequestRef> {
      await behave(options, 'createRequest', ctx);
      const handle = randomUUID();
      const nonce = randomUUID();
      return {
        requestUri: `openid4vp://authorize?client_id=fake-verifier&nonce=${nonce}&request_handle=${handle}&format=${encodeURIComponent(spec.format)}`,
        handle,
        queryKind: spec.vpProfile === 'final-1.0' ? 'dcql_query' : 'presentation_definition',
        nonce,
      };
    },
    async awaitResult(ctx, ref): Promise<VerificationResult> {
      await behave(options, 'awaitResult', ctx);
      if (viaCallback) {
        const callback = await ctx.waitForCallback();
        if (callback.kind === 'error') {
          throw new RoleError(
            `verifier.${callback.errorCode ?? 'callback-error'}`,
            callback.errorMessage ?? 'the browser verifier reported an error',
          );
        }
      }
      const submitted = network.submissions.get(ref.handle);
      network.submissions.delete(ref.handle);
      if (submitted === undefined) {
        throw new RoleError('verifier.no-submission', 'the wallet did not submit a presentation');
      }
      const [payload = '', signature = ''] = submitted.split('~');
      const intact = digest(payload) === signature;
      const outcome = options.outcome ?? (intact ? 'VALID' : 'INVALID');
      return {
        outcome,
        checks: [{ id: 'fake-digest', status: intact ? 'pass' : 'fail' }],
        raw: JSON.stringify({ outcome, intact }),
        receivedAt: new Date().toISOString(),
      };
    },
  };
}

/** The set registered by `PLAYGROUND_FAKE_ROLES=1`: one of each kind, a person-driven wallet and a callback verifier. */
export function devFakeRoles(): AnyRole[] {
  const network = new FakeNetwork();
  return [
    createFakeIssuer(),
    createFakeWallet(network),
    createFakeWallet(network, {
      id: 'fake-person-wallet',
      name: 'Test role (fake) wallet driven by a person',
      interaction: 'manual',
    }),
    createFakeVerifier(network),
    createFakeVerifier(network, {
      id: 'fake-callback-verifier',
      name: 'Test role (fake) verifier answering through a browser callback',
      interaction: 'browser',
    }),
  ];
}
