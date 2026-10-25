// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `mobile-wallet`: a wallet app on a phone (Inji Wallet mobile or any OpenID4VC wallet), driven by a
 * person. The role shows a QR code and a link (`person.action-needed`) and waits. The step completes
 * on whichever comes first:
 * - the issuer or verifier side observes the wallet's request in recorded traffic (a successful
 *   credential request after the offer; a presentation posted after the authorization request), seen
 *   by the inbound recorder at `/ref/*` or by the reverse proxy in front of an Inji service;
 * - the person presses "done" (`POST /api/runs/{id}/person-done`), for wallets whose traffic does not
 *   pass through the playground.
 *
 * The credential the phone received is taken from the recorded credential response when it was seen,
 * so the report can still measure it; otherwise the run continues without it.
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
import type { CaptureHub } from '../../recording/capture-hub.js';

export interface MobileWalletOptions {
  hub: CaptureHub;
  /** Marks the run's pending person action done (the orchestrator's `personDone`). */
  completePerson(runId: string, actionId: string): void;
  /** How long the person has; default 10 minutes. */
  timeoutMs?: number;
}

/** Shown on the card and in the action when the wallet cannot fetch a credential offer by itself. */
const OFFER_HINT =
  'Inji Wallet reads credential offers only from its "scan credential offer" button, not from the phone camera.';

export class MobileWalletRole implements WalletRole {
  readonly #options: MobileWalletOptions;

  constructor(options: MobileWalletOptions) {
    this.#options = options;
  }

  describe(): RoleDescriptor {
    return {
      id: 'mobile-wallet',
      kind: 'wallet',
      name: 'Phone wallet (Inji Wallet or any OpenID4VC app)',
      ecosystem: 'external',
      version: 'any',
      interaction: 'manual',
      description:
        'A person scans the QR code with a wallet app. The phone must reach the playground (set PLAYGROUND_PUBLIC_URL to a LAN or tunnel address).',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc'],
        proofTypes: ['ES256', 'EdDSA', 'Ed25519Signature2020'],
        didMethods: ['did:jwk', 'did:key', 'did:web'],
        vciProfiles: ['draft13', 'v1'],
        vpProfiles: ['inji-draft', 'final-1.0'],
        issuance: ['credential-offer'],
        responseModes: ['direct_post'],
      },
      notes: [OFFER_HINT],
    };
  }

  health(): Promise<Health> {
    return Promise.resolve({
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      detail: 'a phone cannot be probed; it is checked when the person scans',
    });
  }

  async receiveCredential(ctx: RunContext, start: IssuanceStart): Promise<HeldCredential> {
    if (start.mode !== 'credential-offer') {
      throw new RoleError(
        'wallet.offer-required',
        'the phone wallet role needs a credential offer to show as a QR code; this issuer offers none',
      );
    }
    const action: PersonAction = {
      id: `${ctx.runId}-scan-offer`,
      kind: 'scan-offer',
      title: 'Scan the credential offer with the wallet app',
      instructions: [
        'Open the wallet app on the phone.',
        `Choose the option to scan a credential offer and scan this QR code. ${OFFER_HINT}`,
        'Accept the credential in the app. The run continues when the issuer sees the request.',
      ],
      qrText: start.offerUri,
      deepLink: start.offerUri,
      timeoutMs: this.#options.timeoutMs ?? 600_000,
    };
    const observed = await this.#waitForWallet(ctx, action, isCredentialResponse);
    return {
      id: `${ctx.runId}-credential`,
      format: observedFormat(observed) ?? 'ldp_vc',
      raw: observed
        ? (credentialOf(observed) ?? '(held by the phone; the credential response was not observed)')
        : '(held by the phone; completed by the person)',
      credentialIssuer: start.credentialIssuer,
      credentialConfigurationId: start.credentialConfigurationIds[0],
      receivedAt: new Date().toISOString(),
    };
  }

  async present(ctx: RunContext, request: PresentationRequestRef): Promise<SubmissionReceipt> {
    const action: PersonAction = {
      id: `${ctx.runId}-scan-request`,
      kind: 'scan-request',
      title: 'Share the credential with the verifier',
      instructions: [
        'Open the wallet app and scan this QR code (or open the link on the phone).',
        'Choose the credential received in this run and confirm sharing.',
        'The run continues when the verifier receives the presentation.',
      ],
      qrText: request.requestUri,
      deepLink: request.requestUri,
      timeoutMs: this.#options.timeoutMs ?? 600_000,
    };
    const observed = await this.#waitForWallet(ctx, action, isPresentationSubmission);
    return {
      submittedAt: new Date().toISOString(),
      ...(observed?.response ? { status: observed.response.status } : {}),
    };
  }

  /**
   * Shows the action and resolves when recorded traffic shows the wallet acted (with that exchange)
   * or when the person pressed "done" (with `undefined`).
   */
  async #waitForWallet(
    ctx: RunContext,
    action: PersonAction,
    predicate: (exchange: RecordedExchange) => boolean,
  ): Promise<RecordedExchange | undefined> {
    ctx.enterStep('person.action');
    const stop = new AbortController();
    const onAbort = (): void => stop.abort(ctx.signal.reason);
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    let observed: RecordedExchange | undefined;
    const watching = this.#options.hub
      .waitFor(ctx.runId, predicate, stop.signal)
      .then((exchange) => {
        observed = exchange;
        // Ends the person's wait the same way the "done" button does.
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

function isCredentialResponse(exchange: RecordedExchange): boolean {
  const status = exchange.response?.status ?? 0;
  return exchange.step === 'credential' && status >= 200 && status < 300;
}

function isPresentationSubmission(exchange: RecordedExchange): boolean {
  return exchange.step === 'wallet.submit' && exchange.response !== undefined;
}

/** The credential from a recorded credential response (draft 13 `credential`, 1.0 `credentials[]`). */
function credentialOf(exchange: RecordedExchange): string | undefined {
  try {
    const body = JSON.parse(exchange.response?.body ?? '') as {
      credential?: unknown;
      credentials?: Array<{ credential?: unknown }>;
    };
    const credential = body.credential ?? body.credentials?.[0]?.credential;
    if (typeof credential === 'string') return credential;
    return credential === undefined ? undefined : JSON.stringify(credential);
  } catch {
    return undefined;
  }
}

function observedFormat(exchange: RecordedExchange | undefined): HeldCredential['format'] | undefined {
  if (!exchange) return undefined;
  const credential = credentialOf(exchange);
  if (credential === undefined) return undefined;
  if (credential.trimStart().startsWith('{')) return 'ldp_vc';
  return credential.includes('~') ? 'vc+sd-jwt' : undefined;
}
