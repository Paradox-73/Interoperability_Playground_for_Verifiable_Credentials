/**
 * The run orchestrator: takes one run configuration (issuer x wallet x verifier x format x profiles x
 * scenario) through issue -> hold -> present -> verify by calling the three role implementations, and
 * turns what happens into stored, streamed events and a pass/fail report.
 *
 * Responsibilities, in the order a run meets them:
 * 1. resolve and check the configuration (unknown roles or scenarios are refused; incompatible
 *    combinations are stored with the verdict `not-supported` without being attempted);
 * 2. wait for the Inji stack when an Inji module takes part (one live run at a time);
 * 3. make the five role calls of `ROLE_CALLS`, each under a step timeout chosen from the roles involved,
 *    with cancellation, waits for a person and verifier callbacks available to the roles;
 * 4. apply the scenario's hooks between the phases;
 * 5. compute the outcome and verdict and store the report.
 */
import { randomBytes } from 'node:crypto';
import {
  HeldCredentialSchema,
  IssuanceStartSchema,
  PersonActionSchema,
  PresentationRequestRefSchema,
  RecordedExchangeSchema,
  RunConfigSchema,
  RunEventSchema,
  STEP_INFO,
  SubmissionReceiptSchema,
  VerificationResultSchema,
  ROLE_CALLS,
  RoleError,
  isRoleError,
  verdictFor,
  type CompatibilityResult,
  type CreateRunRequest,
  type CredentialFormat,
  type CredentialSize,
  type HeldCredential,
  type InteropReport,
  type IssuanceRequest,
  type Outcome,
  type PersonAction,
  type PresentationSpec,
  type RecordedExchange,
  type ReportError,
  type RoleCall,
  type RoleDescriptor,
  type RunConfig,
  type RunContext,
  type RunEvent,
  type RunMode,
  type RunStatus,
  type ScenarioHooks,
  type ScenarioSpec,
  type StepId,
  type StepSummary,
  type VerificationResult,
  type VerifierCallback,
  type VerifierRole,
  type IssuerRole,
  type WalletRole,
} from '@inji-playground/protocol';
import { z } from 'zod';
import type { EventBus } from '../events/bus.js';
import { measureCredential } from '../reports/credential-size.js';
import {
  RecordingFetch,
  type ExchangeDraft,
  type ExchangeRecorder,
  type RecordingFetchOptions,
} from '../recording/http-client.js';
import type { RunStore } from '../store/run-store.js';
import { checkCompatibility, runModeOf } from './compatibility.js';
import { RunCancelledError, RunRequestError, StepTimeoutError } from './errors.js';
import type { RegisteredRole, RoleRegistry } from './registry.js';
import { StackLock } from './stack-lock.js';
import { DEFAULT_STEP_TIMEOUTS, PausableTimer, roleStepTimeout, type StepTimeouts } from './timing.js';

/** Where scenarios come from; `@inji-playground/scenarios` in the server. */
export interface ScenarioCatalogue {
  findScenario(id: string): ScenarioSpec | undefined;
  listScenarios(): ScenarioSpec[];
}

/** The subset of a pino logger the orchestrator uses. */
export interface OrchestratorLogger {
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

export interface OrchestratorOptions {
  store: RunStore;
  bus: EventBus;
  registry: RoleRegistry;
  scenarios: ScenarioCatalogue;
  timeouts?: StepTimeouts;
  /** Hooks of a scenario (tamper variants); none by default. */
  hooksFor?: (scenario: ScenarioSpec) => ScenarioHooks;
  stackLock?: StackLock;
  logger?: OrchestratorLogger;
  newRunId?: () => string;
  /**
   * Transport and self-capture test for the roles' recording fetch: `fetch` sends the request (network
   * map, in-process dispatch to this server); `selfCapture` names URLs that this server's proxy or
   * inbound recorder records, so the outbound client does not record them a second time.
   */
  http?: Pick<RecordingFetchOptions, 'fetch' | 'selfCapture' | 'labelFor'>;
}

/** Why a run stopped before the verifier answered, in the form the report needs. */
class RunFailure extends Error {
  constructor(
    readonly error: ReportError,
    /** `interop`: a role rejected a protocol message (outcome ERROR); `environment`: nothing was learned. */
    readonly category: 'interop' | 'environment',
  ) {
    super(error.message);
  }
}

interface StepState {
  step: StepId;
  startedAt: Date;
  started: number;
  /** Exchanges and artefacts recorded while this step was current. */
  recorded: number;
  /** True when the orchestrator opened the step (a call's first step) rather than the role. */
  auto: boolean;
}

interface CallState {
  timer: PausableTimer;
  signal: AbortSignal;
  timeoutMs: number;
}

/** Everything the orchestrator tracks about a run while it is in this process. */
interface RunState {
  id: string;
  config: RunConfig;
  mode: RunMode;
  scenario: ScenarioSpec;
  hooks: ScenarioHooks;
  roles: { issuer: RegisteredRole; wallet: RegisteredRole; verifier: RegisteredRole };
  compatibility: CompatibilityResult;
  controller: AbortController;
  status: RunStatus;
  finished: boolean;
  exchanges: RecordedExchange[];
  recorder: ExchangeRecorder;
  step?: StepState;
  call?: CallState;
  steps: StepSummary[];
  pendingPerson?: { action: PersonAction; complete: () => void };
  callbacks: VerifierCallback[];
  callbackWaiters: Array<(callback: VerifierCallback) => void>;
  /** Size and PixelPass length of the credential as issued, once one was received. */
  credentialSize?: CredentialSize;
}

interface ActiveRun extends RunState {
  /** Settles with the stored report when the run has finished. */
  done: Promise<InteropReport>;
}

/** Result of `create`. */
export interface CreatedRun {
  runId: string;
  compatibility: CompatibilityResult;
}

export class Orchestrator {
  readonly #store: RunStore;
  readonly #bus: EventBus;
  readonly #registry: RoleRegistry;
  readonly #scenarios: ScenarioCatalogue;
  readonly #timeouts: StepTimeouts;
  readonly #hooksFor: (scenario: ScenarioSpec) => ScenarioHooks;
  readonly #lock: StackLock;
  readonly #log: OrchestratorLogger;
  readonly #newRunId: () => string;
  readonly #http: OrchestratorOptions['http'];
  readonly #active = new Map<string, ActiveRun>();

  constructor(options: OrchestratorOptions) {
    this.#store = options.store;
    this.#bus = options.bus;
    this.#registry = options.registry;
    this.#scenarios = options.scenarios;
    this.#timeouts = options.timeouts ?? DEFAULT_STEP_TIMEOUTS;
    this.#hooksFor = options.hooksFor ?? (() => ({}));
    this.#lock = options.stackLock ?? new StackLock();
    this.#log = options.logger ?? { warn: () => undefined, error: () => undefined };
    this.#newRunId = options.newRunId ?? defaultRunId;
    this.#http = options.http;
  }

  /**
   * Checks a run request without starting anything: resolves `replayOf`, the roles and the scenario.
   * Throws `RunRequestError` for a request the API must refuse.
   */
  resolve(request: CreateRunRequest): {
    config: RunConfig;
    roles: RunState['roles'];
    scenario: ScenarioSpec;
    compatibility: CompatibilityResult;
  } {
    const config = this.#resolveConfig(request);
    const roles = {
      issuer: this.#role(config.issuer, 'issuer'),
      wallet: this.#role(config.wallet, 'wallet'),
      verifier: this.#role(config.verifier, 'verifier'),
    };
    const scenario = this.#scenarios.findScenario(config.scenario);
    if (!scenario) {
      throw new RunRequestError('unknown-scenario', `no scenario with id "${config.scenario}"`, 400);
    }
    const compatibility = checkCompatibility({
      issuer: roles.issuer.descriptor,
      wallet: roles.wallet.descriptor,
      verifier: roles.verifier.descriptor,
      format: config.format,
      vciProfile: config.vciProfile,
      vpProfile: config.vpProfile,
      scenario,
    });
    return { config, roles, scenario, compatibility };
  }

  /** Stores a new run and starts it in the background. */
  create(request: CreateRunRequest): CreatedRun {
    const { config, roles, scenario, compatibility } = this.resolve(request);
    const id = this.#newRunId();
    const mode = runModeOf([roles.issuer.descriptor, roles.wallet.descriptor, roles.verifier.descriptor]);
    this.#store.createRun({
      id,
      mode,
      config,
      versions: {
        issuer: roles.issuer.descriptor.version,
        wallet: roles.wallet.descriptor.version,
        verifier: roles.verifier.descriptor.version,
      },
      createdAt: new Date().toISOString(),
    });
    const exchanges: RecordedExchange[] = [];
    const state: RunState = {
      id,
      config,
      mode,
      scenario,
      hooks: this.#hooksFor(scenario),
      roles,
      compatibility,
      controller: new AbortController(),
      status: 'queued',
      finished: false,
      exchanges,
      recorder: { record: (draft) => this.#recordExchange(state, draft), list: () => exchanges },
      steps: [],
      callbacks: [],
      callbackWaiters: [],
    };
    // A run rejected by the compatibility check finishes synchronously inside #execute; the map entry
    // is still added (and removed when `done` settles) so every run follows the same path.
    const done = this.#execute(state).finally(() => this.#active.delete(id));
    this.#active.set(id, Object.assign(state, { done }));
    // `wait()` hands the promise out; this catch only keeps a crash from being an unhandled rejection.
    done.catch((error: unknown) => this.#log.error({ runId: id, err: error }, 'run crashed'));
    return { runId: id, compatibility };
  }

  /** The report of a run, once it has finished (immediately for a stored run). */
  async wait(runId: string): Promise<InteropReport> {
    const run = this.#active.get(runId);
    if (run) return run.done;
    const stored = this.#store.getRun(runId);
    if (!stored) throw new RunRequestError('run-not-found', `no run with id "${runId}"`, 404);
    if (!stored.report) throw new RunRequestError('run-without-report', `run "${runId}" has no report`, 409);
    return stored.report;
  }

  /** Status of a run that is still in this process, or `undefined`. */
  activeStatus(runId: string): RunStatus | undefined {
    return this.#active.get(runId)?.status;
  }

  /** What a person must do right now for the run to continue. */
  pendingAction(runId: string): PersonAction | undefined {
    return this.#active.get(runId)?.pendingPerson?.action;
  }

  /** The recorder of an active run, for capture points outside the roles (reverse proxy, inbound hook). */
  recorderFor(runId: string): ExchangeRecorder | undefined {
    return this.#active.get(runId)?.recorder;
  }

  /** Ids of the runs in progress, oldest first. */
  activeRunIds(): string[] {
    return [...this.#active.keys()];
  }

  /** Cancels a queued or running run; its report gets the verdict `error` with code `run.cancelled`. */
  cancel(runId: string, reason = 'cancelled by request'): RunStatus {
    const run = this.#activeOrThrow(runId);
    if (!run.controller.signal.aborted) run.controller.abort(new RunCancelledError(reason));
    return run.status;
  }

  /** The person finished the pending action (manual fallback for `waitForPerson`). */
  personDone(runId: string, actionId?: string): void {
    const run = this.#activeOrThrow(runId);
    const pending = run.pendingPerson;
    if (!pending)
      throw new RunRequestError('no-pending-action', `run "${runId}" is not waiting for a person`, 409);
    if (actionId !== undefined && actionId !== pending.action.id) {
      throw new RunRequestError(
        'action-mismatch',
        `run "${runId}" is waiting for action "${pending.action.id}", not "${actionId}"`,
        409,
      );
    }
    pending.complete();
  }

  /** Hands a signal from an outside verifier component (for example the Verify SDK) to the run's verifier role. */
  deliverCallback(runId: string, callback: VerifierCallback): void {
    const run = this.#activeOrThrow(runId);
    const waiter = run.callbackWaiters.shift();
    if (waiter) waiter(callback);
    else run.callbacks.push(callback);
  }

  /** Cancels every active run and waits until their reports are stored. */
  async close(): Promise<void> {
    const runs = [...this.#active.values()];
    for (const run of runs) {
      if (!run.controller.signal.aborted) run.controller.abort(new RunCancelledError('server shutting down'));
    }
    await Promise.allSettled(runs.map((run) => run.done));
  }

  // ---------------------------------------------------------------------------------------------------
  // Running

  async #execute(run: RunState): Promise<InteropReport> {
    const { issuer, wallet, verifier } = run.roles;
    let release: (() => void) | undefined;
    let failure: RunFailure | undefined;
    let held: HeldCredential | undefined;
    let result: VerificationResult | undefined;

    try {
      if (!run.compatibility.runnable) {
        this.#start(run);
        return this.#finish(run, { notSupported: true });
      }
      if (run.mode === 'live') {
        try {
          release = await this.#lock.acquire(run.controller.signal);
        } catch (error) {
          this.#start(run);
          return this.#finish(run, { failure: this.#classify(error, 'playground.admin') });
        }
      }
      this.#start(run);

      try {
        const [issueCall, holdCall, requestCall, presentCall, verifyCall] = ROLE_CALLS as [
          RoleCall,
          RoleCall,
          RoleCall,
          RoleCall,
          RoleCall,
        ];
        const { hooks } = run;
        const issuance = await this.#hook<IssuanceRequest>(
          run,
          'beforeIssuance',
          hooks.beforeIssuance?.bind(hooks),
          {
            format: run.config.format,
            vciProfile: run.config.vciProfile,
            ...(walletInitiatedOnly(run.roles.wallet.descriptor, run.roles.issuer.descriptor)
              ? { mode: 'wallet-initiated' as const }
              : {}),
          },
        );

        const start = await this.#call(run, issueCall, issuer, [issuer], IssuanceStartSchema, (ctx) =>
          (issuer.role as IssuerRole).startIssuance(ctx, issuance),
        );
        if (start.mode === 'credential-offer') this.#artifact(run, 'offer', start.offerUri);

        held = await this.#call(run, holdCall, wallet, [wallet, issuer], HeldCredentialSchema, (ctx) =>
          (wallet.role as WalletRole).receiveCredential(ctx, start),
        );
        this.#artifact(run, 'credential', held.raw, held.format);
        // Measured before any tamper hook changes the credential: the figure describes what was issued.
        run.credentialSize = measureCredential(held.raw);
        held = HeldCredentialSchema.parse(
          await this.#hook(run, 'afterCredential', hooks.afterCredential?.bind(hooks), held),
        );

        const spec = await this.#hook<PresentationSpec>(
          run,
          'beforeRequest',
          hooks.beforeRequest?.bind(hooks),
          {
            format: run.config.format,
            vpProfile: run.config.vpProfile,
          },
        );
        const ref = await this.#call(
          run,
          requestCall,
          verifier,
          [verifier],
          PresentationRequestRefSchema,
          (ctx) => (verifier.role as VerifierRole).createRequest(ctx, spec),
        );

        const credential = held;
        await this.#call(run, presentCall, wallet, [wallet, verifier], SubmissionReceiptSchema, (ctx) =>
          (wallet.role as WalletRole).present(ctx, ref, credential),
        );

        result = await this.#call(
          run,
          verifyCall,
          verifier,
          [verifier, wallet],
          VerificationResultSchema,
          (ctx) => (verifier.role as VerifierRole).awaitResult(ctx, ref),
        );
        this.#artifact(run, 'result', result.raw ?? JSON.stringify(result));
      } catch (error) {
        failure =
          error instanceof RunFailure ? error : this.#classify(error, run.step?.step ?? 'playground.admin');
      }
      return this.#finish(run, { failure, held, result });
    } finally {
      release?.();
    }
  }

  /** Marks the run started and emits `run.started`. */
  #start(run: RunState): void {
    const at = new Date().toISOString();
    run.status = 'running';
    this.#store.markStarted(run.id, at);
    this.#emit(run, { type: 'run.started', runId: run.id, config: run.config, at });
  }

  /**
   * Makes one role call under a step timeout. The timeout is the longest of the involved roles' step
   * timeouts (a wallet receiving from Inji Certify waits as long as Certify needs), and starts again
   * whenever the role moves to its next protocol step.
   */
  async #call<T>(
    run: RunState,
    call: RoleCall,
    caller: RegisteredRole,
    involved: RegisteredRole[],
    output: z.ZodType<T>,
    fn: (ctx: RunContext) => Promise<unknown>,
  ): Promise<T> {
    const runSignal = run.controller.signal;
    if (runSignal.aborted) throw this.#classify(runSignal.reason, call.firstStep);

    const timeoutMs = Math.max(
      ...involved.map((entry) => roleStepTimeout(entry.descriptor, this.#timeouts, entry.stepTimeoutMs)),
    );
    const controller = new AbortController();
    const onRunAbort = (): void => controller.abort(runSignal.reason);
    runSignal.addEventListener('abort', onRunAbort, { once: true });
    const timer = new PausableTimer(timeoutMs, () =>
      controller.abort(new StepTimeoutError(run.step?.step ?? call.firstStep, timer.durationMs)),
    );
    run.call = { timer, signal: controller.signal, timeoutMs };
    this.#enterStep(run, call.firstStep, true);

    try {
      const pending = fn(this.#context(run, caller, controller.signal));
      // A role that ignores the signal may settle after the timeout; nobody waits for it then.
      pending.catch(() => undefined);
      const value = await raceAbort(pending, controller.signal);
      const parsed = output.safeParse(value);
      if (!parsed.success) {
        throw new RunFailure(
          {
            step: run.step?.step ?? call.firstStep,
            code: 'role.invalid-output',
            message: `${caller.descriptor.name} returned an invalid result from ${call.method}: ${z.prettifyError(parsed.error)}`,
          },
          'interop',
        );
      }
      this.#finishStep(run, 'ok');
      return parsed.data;
    } catch (error) {
      const reason: unknown = controller.signal.aborted ? controller.signal.reason : error;
      const failure =
        reason instanceof RunFailure ? reason : this.#classify(reason, run.step?.step ?? call.firstStep);
      this.#finishStep(run, 'failed', failure.error);
      throw failure;
    } finally {
      timer.clear();
      runSignal.removeEventListener('abort', onRunAbort);
      run.call = undefined;
    }
  }

  /** The context a role gets for one call; its `signal` is aborted on timeout or cancel. */
  #context(run: RunState, caller: RegisteredRole, signal: AbortSignal): RunContext {
    const isCurrent = (): boolean => run.call?.signal === signal;
    return {
      runId: run.id,
      http: new RecordingFetch({
        recorder: run.recorder,
        from: caller.descriptor.id,
        currentStep: () => run.step?.step,
        defaultSignal: () => signal,
        runId: run.id,
        ...this.#http,
      }),
      scenario: run.scenario,
      hooks: run.hooks,
      signal,
      emit: (event) => this.#emitFromRole(run, event),
      enterStep: (step) => {
        // A role still working after its call timed out must not move the timeline of a later call.
        if (isCurrent()) this.#enterStep(run, step, false);
      },
      waitForPerson: (action) => this.#waitForPerson(run, action, signal),
      waitForCallback: () => this.#waitForCallback(run, signal),
    };
  }

  #enterStep(run: RunState, step: StepId, auto: boolean): void {
    if (run.step?.step === step) return;
    if (run.step) this.#finishStep(run, run.step.auto && run.step.recorded === 0 ? 'skipped' : 'ok');
    const startedAt = new Date();
    run.step = { step, startedAt, started: performance.now(), recorded: 0, auto };
    // A call's first step runs on the timer the call just created; each later step gets a full period.
    if (run.call && !auto) {
      run.call.timer.restart(step === 'person.action' ? this.#timeouts.personMs : run.call.timeoutMs);
    }
    this.#emit(run, {
      type: 'step.started',
      runId: run.id,
      step,
      label: STEP_INFO[step].label,
      at: startedAt.toISOString(),
    });
  }

  #finishStep(run: RunState, status: 'ok' | 'failed' | 'skipped', error?: ReportError): void {
    const current = run.step;
    if (!current) return;
    run.step = undefined;
    run.steps.push({
      step: current.step,
      status,
      durationMs: Math.round(performance.now() - current.started),
      startedAt: current.startedAt.toISOString(),
    });
    this.#emit(run, {
      type: 'step.finished',
      runId: run.id,
      step: current.step,
      status,
      ...(error ? { error: { code: error.code, message: error.message, ...pickExchange(error) } } : {}),
      at: new Date().toISOString(),
    });
  }

  async #waitForPerson(run: RunState, input: PersonAction, signal: AbortSignal): Promise<void> {
    const action = PersonActionSchema.parse(input);
    if (signal.aborted) throw signal.reason;
    if (run.pendingPerson) {
      throw new RoleError('person.busy', 'the run is already waiting for a person', {
        category: 'environment',
      });
    }
    this.#emit(run, { type: 'person.action-needed', runId: run.id, action });
    const timer = run.call?.timer;
    timer?.pause();
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
          run.pendingPerson = undefined;
        };
        const onAbort = (): void => {
          cleanup();
          reject(signal.reason as Error);
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(
            new RoleError(
              'person.timeout',
              `nobody completed "${action.title}" within ${action.timeoutMs} ms`,
              {
                category: 'environment',
              },
            ),
          );
        }, action.timeoutMs);
        signal.addEventListener('abort', onAbort, { once: true });
        run.pendingPerson = {
          action,
          complete: () => {
            cleanup();
            resolve();
          },
        };
      });
    } finally {
      timer?.resume();
    }
  }

  #waitForCallback(run: RunState, signal: AbortSignal): Promise<VerifierCallback> {
    if (signal.aborted) return Promise.reject(signal.reason as Error);
    const queued = run.callbacks.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const waiter = (callback: VerifierCallback): void => {
        signal.removeEventListener('abort', onAbort);
        resolve(callback);
      };
      const onAbort = (): void => {
        const index = run.callbackWaiters.indexOf(waiter);
        if (index >= 0) run.callbackWaiters.splice(index, 1);
        reject(signal.reason as Error);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      run.callbackWaiters.push(waiter);
    });
  }

  /** Calls a scenario hook between phases; a hook that throws stops the run with verdict `error`. */
  async #hook<T>(
    run: RunState,
    name: string,
    hook: ((value: T) => T | Promise<T>) | undefined,
    value: T,
  ): Promise<T> {
    if (!hook) return value;
    if (run.controller.signal.aborted) throw this.#classify(run.controller.signal.reason, 'playground.admin');
    try {
      return await hook(value);
    } catch (error) {
      throw new RunFailure(
        {
          step: 'playground.admin',
          code: 'scenario.hook-failed',
          message: `the ${name} hook of scenario "${run.scenario.id}" failed: ${messageOf(error)}`,
        },
        'environment',
      );
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Events and recording

  /** Stores an event, then streams it. Events after the run has finished are dropped (late role work). */
  #emit(run: RunState, event: RunEvent): void {
    if (run.finished) {
      this.#log.warn({ runId: run.id, type: event.type }, 'event after the run finished was dropped');
      return;
    }
    if ((event.type === 'exchange' || event.type === 'artifact') && run.step) run.step.recorded += 1;
    this.#store.appendEvent(event, eventTime(event));
    this.#bus.publish(event);
  }

  /** Roles may emit artefacts and person actions only; everything else is the orchestrator's job. */
  #emitFromRole(run: RunState, input: RunEvent): void {
    const event = RunEventSchema.parse(input);
    if (event.runId !== run.id) throw new TypeError(`event for run ${event.runId} emitted in run ${run.id}`);
    if (event.type !== 'artifact' && event.type !== 'person.action-needed') {
      throw new TypeError(`roles may not emit ${event.type} events`);
    }
    this.#emit(run, event);
  }

  #artifact(
    run: RunState,
    kind: 'offer' | 'credential' | 'result',
    raw: string,
    format?: CredentialFormat,
  ): void {
    this.#emit(run, { type: 'artifact', runId: run.id, kind, raw, ...(format ? { format } : {}) });
  }

  #recordExchange(run: RunState, draft: ExchangeDraft): RecordedExchange {
    const seq = run.exchanges.length + 1;
    const exchange = RecordedExchangeSchema.parse({ ...draft, id: `${run.id}-x${seq}`, runId: run.id, seq });
    if (run.finished) return exchange;
    run.exchanges.push(exchange);
    this.#emit(run, { type: 'exchange', runId: run.id, exchange });
    return exchange;
  }

  // ---------------------------------------------------------------------------------------------------
  // Reporting

  #finish(
    run: RunState,
    input: {
      notSupported?: boolean;
      failure?: RunFailure;
      held?: HeldCredential;
      result?: VerificationResult;
    },
  ): InteropReport {
    const { issuer, wallet, verifier } = run.roles;
    const expected = run.scenario.expected;
    let outcome: Outcome;
    let verdict: InteropReport['verdict'];
    let error: ReportError | undefined;

    if (input.notSupported) {
      const blocking = run.compatibility.reasons.filter((reason) => reason.severity === 'blocking');
      outcome = 'NOT_RUN';
      verdict = 'not-supported';
      error = {
        step: 'playground.admin',
        code: `compatibility.${blocking[0]?.code ?? 'unknown'}`,
        message: blocking.map((reason) => reason.message).join(' '),
      };
    } else if (input.failure) {
      outcome = input.failure.category === 'interop' ? 'ERROR' : 'NOT_RUN';
      verdict = verdictFor(expected, outcome);
      error = input.failure.error;
    } else {
      outcome = input.result?.outcome ?? 'NOT_RUN';
      verdict = verdictFor(expected, outcome);
      if (verdict === 'fail') {
        error = {
          step: 'verifier.result',
          code: 'outcome.unexpected',
          message: `The scenario "${run.scenario.id}" expects ${expected}; ${verifier.descriptor.name} answered ${outcome}.`,
        };
      }
    }

    const executed = new Set(run.steps.map((summary) => summary.step));
    const notRun: StepSummary[] = ROLE_CALLS.filter((call) => !executed.has(call.firstStep)).map((call) => ({
      step: call.firstStep,
      status: 'not-run',
      durationMs: 0,
    }));

    const held = input.held;
    const report: InteropReport = {
      runId: run.id,
      createdAt: new Date().toISOString(),
      mode: run.mode,
      issuer: roleRef(issuer.descriptor),
      wallet: roleRef(wallet.descriptor),
      verifier: roleRef(verifier.descriptor),
      format: run.config.format,
      credentialProof: held?.proofType ?? declaredProofType(issuer.descriptor, run.config.format),
      ...(held?.holderProofType ? { holderProof: held.holderProofType } : {}),
      ...(held?.issuerDid ? { issuerDid: held.issuerDid } : {}),
      vciProfile: run.config.vciProfile,
      vpProfile: run.config.vpProfile,
      scenario: { id: run.scenario.id, expected },
      outcome,
      verdict,
      ...(error ? { error } : {}),
      steps: [...run.steps, ...notRun],
      ...(run.credentialSize ? { credentialSize: run.credentialSize } : {}),
      ...(run.config.replayOf ? { replayOf: run.config.replayOf } : {}),
    };

    this.#store.finishRun(report, report.createdAt);
    this.#emit(run, { type: 'run.finished', runId: run.id, report });
    run.finished = true;
    run.status = 'finished';
    return report;
  }

  /** Turns whatever stopped a step into the report's error and its category. */
  #classify(reason: unknown, step: StepId): RunFailure {
    if (reason instanceof RunFailure) return reason;
    if (reason instanceof StepTimeoutError) {
      return new RunFailure({ step, code: 'timeout', message: reason.message }, 'environment');
    }
    if (reason instanceof RunCancelledError) {
      return new RunFailure({ step, code: 'run.cancelled', message: reason.message }, 'environment');
    }
    if (isRoleError(reason)) {
      return new RunFailure(
        {
          step,
          code: reason.code,
          message: reason.message,
          ...(reason.exchangeId ? { exchangeId: reason.exchangeId } : {}),
        },
        reason.category,
      );
    }
    return new RunFailure({ step, code: 'role.error', message: messageOf(reason) }, 'interop');
  }

  // ---------------------------------------------------------------------------------------------------
  // Request resolution

  #resolveConfig(request: CreateRunRequest): RunConfig {
    const { replayOf, ...overrides } = request;
    let candidate: Record<string, unknown> = { ...overrides };
    if (replayOf !== undefined) {
      const stored = this.#store.getConfig(replayOf);
      if (!stored)
        throw new RunRequestError('replay-not-found', `no stored run "${replayOf}" to replay`, 404);
      const { replayOf: _previous, ...base } = stored;
      const defined = Object.fromEntries(
        Object.entries(overrides).filter(([, value]) => value !== undefined),
      );
      candidate = { ...base, ...defined, replayOf };
    }
    const parsed = RunConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new RunRequestError(
        'bad-request',
        `invalid run configuration: ${z.prettifyError(parsed.error)}`,
        400,
      );
    }
    return parsed.data;
  }

  #role(id: string, kind: 'issuer' | 'wallet' | 'verifier'): RegisteredRole {
    const entry = this.#registry.get(id);
    if (!entry) throw new RunRequestError('unknown-role', `no role with id "${id}"`, 400);
    if (entry.descriptor.kind !== kind) {
      throw new RunRequestError(
        'wrong-role-kind',
        `"${id}" is a ${entry.descriptor.kind}, not a ${kind}`,
        400,
      );
    }
    return entry;
  }

  #activeOrThrow(runId: string): ActiveRun {
    const run = this.#active.get(runId);
    if (run) return run;
    if (this.#store.getRun(runId)) {
      throw new RunRequestError('run-finished', `run "${runId}" has already finished`, 409);
    }
    throw new RunRequestError('run-not-found', `no run with id "${runId}"`, 404);
  }
}

// -----------------------------------------------------------------------------------------------------

/** Run ids sort by creation time and stay readable: `20261004T054100-3fa9c1`. */
function defaultRunId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

function roleRef(descriptor: RoleDescriptor): InteropReport['issuer'] {
  return {
    id: descriptor.id,
    name: descriptor.name,
    version: descriptor.version,
    ecosystem: descriptor.ecosystem,
  };
}

/**
 * Proof type to report when no credential was received: the issuer's declared one that fits the format.
 * Data Integrity suites (ldp_vc) are named like `Ed25519Signature2020`; JOSE algorithms like `ES256`.
 */
function declaredProofType(issuer: RoleDescriptor, format: CredentialFormat): string {
  const proofs = issuer.capabilities.proofTypes;
  const isDataIntegrity = (name: string): boolean => /signature|integrity|rdfc|jcs/i.test(name);
  const match =
    format === 'ldp_vc' ? proofs.find(isDataIntegrity) : proofs.find((name) => !isDataIntegrity(name));
  return match ?? 'unknown';
}

function pickExchange(error: ReportError): { exchangeId?: string } {
  return error.exchangeId ? { exchangeId: error.exchangeId } : {};
}

function eventTime(event: RunEvent): string {
  switch (event.type) {
    case 'run.started':
    case 'step.started':
    case 'step.finished':
      return event.at;
    case 'exchange':
      return event.exchange.startedAt;
    case 'run.finished':
      return event.report.createdAt;
    case 'artifact':
    case 'person.action-needed':
      return new Date().toISOString();
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Settles like `promise`, or rejects with the signal's reason as soon as it aborts. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason as Error);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.finally(() => signal.removeEventListener('abort', onAbort)).then(resolve, reject);
  });
}

/** The wallet cannot take a credential offer, and the issuer can be contacted by the wallet instead. */
function walletInitiatedOnly(wallet: RoleDescriptor, issuer: RoleDescriptor): boolean {
  const walletModes = wallet.capabilities.issuance;
  return (
    walletModes !== undefined &&
    !walletModes.includes('credential-offer') &&
    (issuer.capabilities.issuance ?? []).includes('wallet-initiated')
  );
}
