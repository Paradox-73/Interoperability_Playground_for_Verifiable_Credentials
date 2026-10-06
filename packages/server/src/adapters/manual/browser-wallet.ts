/**
 * `browser-wallet`: the wallet the person's browser offers through the W3C Digital Credentials API
 * (`navigator.credentials.get({ digital })`, OpenID4VP 1.0 Appendix A), for the verifier
 * `ref-verifier-dc-api`.
 *
 * - Receiving: a browser has no OpenID4VCI entry point a page can call, so the credential is received by the
 *   playground's reference wallet (as for `ref-wallet`) and kept for the run.
 * - Presenting: the role shows a `dc-api` person action. The run page reads the request, passes it to
 *   `navigator.credentials.get()`, and posts what the browser returns to the verifier; the verifier checks
 *   that the answer is bound to that page's origin. A browser without the API, or without a wallet that holds
 *   this credential, can let the reference wallet answer instead (`POST /api/runs/{id}/dc-api/provider`): the
 *   page still passes the answer on and posts it, so request, transport and origin binding are the same.
 * - The step completes when the verifier receives the answer (seen by the inbound recorder) or when the
 *   person presses "done".
 */
import {
  RoleError,
  type Health,
  type HeldCredential,
  type IssuanceStart,
  type PersonAction,
  type PresentationRequestRef,
  type RecordedExchange,
  type RoleDescriptor,
  type RunContext,
  type SubmissionReceipt,
  type WalletRole,
} from '@inji-playground/protocol';
import type { DcApiRequest, DcApiResponse } from '@inji-playground/oid4vp';
import type { CaptureHub } from '../../recording/capture-hub.js';
import { dcApiResponseUri, isDcApiRequestUri } from '../reference/dc-api-verifier.js';
import type { ReferenceWalletRole } from '../reference/wallet.js';

export interface BrowserWalletOptions {
  /** Receives credentials and answers requests when the browser has no wallet for them. */
  referenceWallet: ReferenceWalletRole;
  hub: CaptureHub;
  /** Marks the run's pending person action done (the orchestrator's `personDone`). */
  completePerson(runId: string, actionId: string): void;
  /** How long the person has; default 10 minutes. */
  timeoutMs?: number;
}

interface Waiting {
  request: PresentationRequestRef;
  credential: HeldCredential;
}

export class BrowserWalletRole implements WalletRole {
  readonly #options: BrowserWalletOptions;
  readonly #waiting = new Map<string, Waiting>();

  constructor(options: BrowserWalletOptions) {
    this.#options = options;
  }

  describe(): RoleDescriptor {
    return {
      id: 'browser-wallet',
      kind: 'wallet',
      name: 'Browser wallet (Digital Credentials API)',
      ecosystem: 'external',
      version: 'any',
      interaction: 'browser',
      description:
        "The wallet this browser offers through navigator.credentials.get(). Where the browser has none, the playground's reference wallet answers the same request.",
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'],
        proofTypes: ['ES256', 'EdDSA', 'Ed25519Signature2020'],
        didMethods: ['did:jwk', 'did:key', 'did:web'],
        vciProfiles: ['draft13', 'v1'],
        vpProfiles: ['final-1.0'],
        issuance: ['credential-offer', 'wallet-initiated'],
        responseModes: ['dc_api'],
      },
      notes: [
        'Chrome and Edge 141 or later ship the Digital Credentials API; the page must be served from localhost or over https.',
        'The credential is received by the reference wallet, because a page cannot hand a credential offer to the browser.',
      ],
    };
  }

  health(): Promise<Health> {
    return Promise.resolve({
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      detail: 'a browser cannot be probed; the run page checks for navigator.credentials when it asks',
    });
  }

  receiveCredential(ctx: RunContext, start: IssuanceStart): Promise<HeldCredential> {
    return this.#options.referenceWallet.receiveCredential(ctx, start);
  }

  async present(
    ctx: RunContext,
    request: PresentationRequestRef,
    credential: HeldCredential,
  ): Promise<SubmissionReceipt> {
    if (!isDcApiRequestUri(request.requestUri)) {
      throw new RoleError(
        'wallet.response-mode-unsupported',
        'the browser wallet answers Digital Credentials API requests only (verifier ref-verifier-dc-api)',
      );
    }
    const path = (url: string): string => new URL(url).pathname;
    const action: PersonAction = {
      id: `${ctx.runId}-dc-api`,
      kind: 'dc-api',
      title: "Present through the browser's Digital Credentials API",
      instructions: [
        'Press "Ask the browser": the page calls navigator.credentials.get() with the verifier\'s request.',
        'Choose a wallet and the credential in the browser\'s dialog. If the browser has no wallet holding the credential of this run, press "Answer with the playground wallet" instead.',
        "The page posts the answer to the verifier, which checks that it is bound to this page's origin.",
      ],
      dcApi: {
        requestUrl: path(request.requestUri),
        responseUrl: path(dcApiResponseUri(request.requestUri)),
        providerUrl: `/api/runs/${encodeURIComponent(ctx.runId)}/dc-api/provider`,
      },
      timeoutMs: this.#options.timeoutMs ?? 600_000,
    };
    this.#waiting.set(ctx.runId, { request, credential });
    try {
      const observed = await this.#waitForAnswer(ctx, action);
      return {
        submittedAt: new Date().toISOString(),
        ...(observed?.response ? { status: observed.response.status } : {}),
      };
    } finally {
      this.#waiting.delete(ctx.runId);
      this.#options.referenceWallet.release(ctx.runId);
    }
  }

  /**
   * The playground's reference wallet answering the run's request for a page at `origin`, for browsers that
   * have no wallet for it. Only while the run waits for the browser.
   */
  async provide(runId: string, request: DcApiRequest, origin: string): Promise<DcApiResponse> {
    const waiting = this.#waiting.get(runId);
    if (!waiting) {
      throw new RoleError('wallet.not-waiting', 'this run is not waiting for a browser wallet answer', {
        category: 'environment',
      });
    }
    return this.#options.referenceWallet.answerDcApi(runId, request, origin, waiting.credential);
  }

  async #waitForAnswer(ctx: RunContext, action: PersonAction): Promise<RecordedExchange | undefined> {
    ctx.enterStep('person.action');
    const stop = new AbortController();
    const onAbort = (): void => stop.abort(ctx.signal.reason);
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    let observed: RecordedExchange | undefined;
    const watching = this.#options.hub
      .waitFor(ctx.runId, isDcApiAnswer, stop.signal)
      .then((exchange) => {
        observed = exchange;
        this.#options.completePerson(ctx.runId, action.id);
      })
      .catch(() => undefined);
    try {
      await ctx.waitForPerson(action);
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
      stop.abort(new Error('the person step ended'));
      await watching;
    }
    return observed;
  }
}

function isDcApiAnswer(exchange: RecordedExchange): boolean {
  return (
    exchange.request.method === 'POST' &&
    exchange.request.url.includes('/dc-api/responses/') &&
    exchange.response !== undefined
  );
}
