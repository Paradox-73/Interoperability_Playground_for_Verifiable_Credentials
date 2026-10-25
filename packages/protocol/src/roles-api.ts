// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The interfaces every role implementation (adapter) satisfies. Adding a new issuer, wallet or verifier
 * to the playground means writing one class that implements one of these and registering it.
 *
 * These are TypeScript-only: they describe behaviour, not data, so they have no zod schema.
 */
import type { CredentialFormat, StepId } from './enums.js';
import type { RecordedExchange } from './exchange.js';
import type {
  HeldCredential,
  IssuanceRequest,
  IssuanceStart,
  PresentationRequestRef,
  PresentationSpec,
  SubmissionReceipt,
  VerificationResult,
} from './flow.js';
import type { PersonAction } from './person.js';
import type { Health, RoleDescriptor } from './roles.js';
import type { RunEvent } from './events.js';
import type { ScenarioSpec } from './scenario.js';
import type { VerifierCallback } from './api.js';

/** Extra options a role passes with a request so the recording layer can tag it. */
export interface RecordedRequestInit extends RequestInit {
  /** Protocol step this request belongs to; defaults to the run's current step. */
  step?: StepId;
  /** Role id or service name of the sender and receiver, for the sequence diagram. */
  from?: string;
  to?: string;
}

/**
 * A `fetch` that records every request and response of the current run. Roles must make all protocol
 * HTTP calls through it, never through the global `fetch`, or the exchange is missing from the inspector.
 *
 * Redirects are followed as `fetch` does, so only the final hop is recorded; pass `redirect: 'manual'`
 * when the redirect itself is part of the protocol (authorization code flow).
 */
export interface RecordingHttpClient {
  fetch(input: string | URL, init?: RecordedRequestInit): Promise<Response>;
  /** Exchanges recorded so far in this run, oldest first. */
  exchanges(): readonly RecordedExchange[];
}

/**
 * Points where a scenario (happy path or tamper variant) changes what flows between the roles. The
 * orchestrator calls the first three between the phases of a run; wallet roles call
 * `tamperPresentation` just before they send the presentation. Every hook is optional; the happy path
 * has none.
 */
export interface ScenarioHooks {
  /** Adjusts what the orchestrator asks the issuer for (for example a credential that is already expired). */
  beforeIssuance?(request: IssuanceRequest): IssuanceRequest | Promise<IssuanceRequest>;
  /** Changes the credential the wallet holds before it is presented (for example a flipped signature byte). */
  afterCredential?(credential: HeldCredential): HeldCredential | Promise<HeldCredential>;
  /** Adjusts what the verifier asks for (for example a credential type the issuer never issued). */
  beforeRequest?(spec: PresentationSpec): PresentationSpec | Promise<PresentationSpec>;
  /** Changes the encoded presentation (`vp_token`) a wallet role is about to send. */
  tamperPresentation?(vpToken: string, format: CredentialFormat): string | Promise<string>;
}

/** Everything a role may use while it takes part in one run. */
export interface RunContext {
  readonly runId: string;
  /** Records every call; the sender defaults to the id of the role this context was given to. */
  readonly http: RecordingHttpClient;
  /**
   * Emits a run event (stored and streamed). Roles emit `artifact` events for what only they see
   * (`request-object`, `vp-token`) and `person.action-needed` through `waitForPerson`. The orchestrator
   * itself emits the `offer`, `credential` and `result` artefacts and every step event.
   */
  emit(event: RunEvent): void;
  /**
   * Moves the run's timeline to the next protocol step, for example from `issuer.metadata` to `token`
   * inside `receiveCredential`. The step before it is finished as `ok` (or `skipped` when it recorded
   * nothing), the step's timeout starts again, and later exchanges are tagged with the new step.
   */
  enterStep(step: StepId): void;
  /**
   * Shows the action to the person and resolves when it is done; rejects on timeout or cancel. The
   * step's own timeout is paused while the run waits for the person.
   */
  waitForPerson(action: PersonAction): Promise<void>;
  /**
   * Resolves with the next signal sent to `POST /api/runs/{id}/verifier-callback` (for example the Inji
   * Verify SDK's `onVPReceived` in the browser). Signals that arrive before the call are kept in order.
   */
  waitForCallback(): Promise<VerifierCallback>;
  /** The happy path or the tamper variant this run applies. */
  readonly scenario: ScenarioSpec;
  /** Hooks of the scenario; wallet roles call `tamperPresentation` when it is set. */
  readonly hooks: ScenarioHooks;
  /** Aborted when the run is cancelled or the current step times out; pass it to every `fetch`. */
  readonly signal: AbortSignal;
}

interface RoleBase {
  describe(): RoleDescriptor;
  health(): Promise<Health>;
}

export interface IssuerRole extends RoleBase {
  /** Prepares issuance: returns a credential offer, or the issuer entry point for wallet-initiated flows. */
  startIssuance(ctx: RunContext, req: IssuanceRequest): Promise<IssuanceStart>;
}

export interface WalletRole extends RoleBase {
  /** Runs the wallet side of OpenID4VCI and keeps the credential for the rest of the run. */
  receiveCredential(ctx: RunContext, start: IssuanceStart): Promise<HeldCredential>;
  /**
   * Answers an OpenID4VP authorization request with the held credential. The orchestrator passes the
   * credential it received from `receiveCredential` (after any scenario hook), so wallets that keep no
   * state between calls can still present it.
   */
  present(
    ctx: RunContext,
    request: PresentationRequestRef,
    credential: HeldCredential,
  ): Promise<SubmissionReceipt>;
}

export interface VerifierRole extends RoleBase {
  /** Creates an authorization request (the `openid4vp://` URI a QR code would contain). */
  createRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestRef>;
  /** Waits for the wallet's response and returns the verification outcome with its checks. */
  awaitResult(ctx: RunContext, ref: PresentationRequestRef): Promise<VerificationResult>;
}

export type AnyRole = IssuerRole | WalletRole | VerifierRole;
