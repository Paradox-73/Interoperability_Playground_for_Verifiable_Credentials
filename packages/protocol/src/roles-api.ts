/**
 * The interfaces every role implementation (adapter) satisfies. Adding a new issuer, wallet or verifier
 * to the playground means writing one class that implements one of these and registering it.
 *
 * These are TypeScript-only: they describe behaviour, not data, so they have no zod schema.
 */
import type { StepId } from './enums.js';
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

/** Extra options a role passes with a request so the recording layer can tag it. */
export interface RecordedRequestInit extends RequestInit {
  /** Protocol step this request belongs to; overrides the automatic tagging rules. */
  step?: StepId;
  /** Role id or service name of the sender and receiver, for the sequence diagram. */
  from?: string;
  to?: string;
}

/**
 * A `fetch` that records every request and response of the current run. Roles must make all protocol
 * HTTP calls through it, never through the global `fetch`, or the exchange is missing from the inspector.
 */
export interface RecordingHttpClient {
  fetch(input: string | URL, init?: RecordedRequestInit): Promise<Response>;
  /** Exchanges recorded so far in this run, oldest first. */
  exchanges(): readonly RecordedExchange[];
}

/** Everything a role may use while it takes part in one run. */
export interface RunContext {
  readonly runId: string;
  readonly http: RecordingHttpClient;
  /** Emits a run event (stored and streamed). Roles mostly emit `artifact` and `person.action-needed`. */
  emit(event: RunEvent): void;
  /** Shows the action to the person and resolves when it is done; rejects on timeout or cancel. */
  waitForPerson(action: PersonAction): Promise<void>;
  /** The happy path or the tamper variant this run applies. */
  readonly scenario: ScenarioSpec;
  /** Aborted when the run is cancelled or a step times out; pass it to every `fetch`. */
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
  /** Answers an OpenID4VP authorization request with the held credential. */
  present(ctx: RunContext, request: PresentationRequestRef): Promise<SubmissionReceipt>;
}

export interface VerifierRole extends RoleBase {
  /** Creates an authorization request (the `openid4vp://` URI a QR code would contain). */
  createRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestRef>;
  /** Waits for the wallet's response and returns the verification outcome with its checks. */
  awaitResult(ctx: RunContext, ref: PresentationRequestRef): Promise<VerificationResult>;
}

export type AnyRole = IssuerRole | WalletRole | VerifierRole;
