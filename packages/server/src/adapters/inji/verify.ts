// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Inji Verify 0.18.2 (verify-service) as the verifier of a run, in two forms:
 *
 * - `inji-verify`: the API. `POST /v1/verify/vp-request` with a Presentation Exchange definition, the
 *   wallet request built from its answer exactly as Inji's own front ends build it, then the status long
 *   poll (`GET /vp-request/{id}/status`, up to 55 s per call) and the result
 *   (`POST /v2/vp-results/{transactionId}`).
 * - `inji-verify-sdk`: the official web component in the playground page creates the request
 *   (`/vp-session-request`, through the playground proxy at `/v1/verify`, so it is recorded in the run).
 *   This role waits for that recorded answer, rebuilds the wallet request from it, waits for the
 *   component's `onVPReceived` (`POST /api/runs/{id}/verifier-callback`) and fetches the result itself.
 *
 * Inji Verify sends an unprefixed client id with an unsigned request by value, so wallets must know it
 * as a pre-registered client (the reference wallet is configured with the playground's client ids).
 */
import {
  RoleError,
  type Health,
  type PresentationRequestRef,
  type PresentationSpec,
  type RecordedExchange,
  type RoleDescriptor,
  type RunContext,
  type VerificationCheck,
  type VerificationResult,
  type VerifierRole,
} from '@inji-playground/protocol';
import type { CaptureHub } from '../../recording/capture-hub.js';
import {
  INJI_VERIFY_CLIENT_ID,
  INJI_VERSIONS,
  farmerPresentationDefinition,
  probe,
  walletRequestUri,
  type InjiVpRequest,
} from './common.js';

const FORMATS = ['ldp_vc', 'vc+sd-jwt'] as const;

const capabilities: RoleDescriptor['capabilities'] = {
  formats: [...FORMATS],
  proofTypes: ['Ed25519Signature2020', 'Ed25519Signature2018', 'RsaSignature2018', 'EdDSA', 'ES256', 'RS256'],
  didMethods: ['did:web', 'did:key', 'did:jwk'],
  vpProfiles: ['inji-draft'],
  responseModes: ['direct_post'],
};

/** Body of `POST /v1/verify/v2/vp-results/{transactionId}`. */
export interface InjiVpResultV2 {
  transactionId?: string;
  allChecksSuccessful?: boolean;
  credentialResults?: Array<{
    allChecksSuccessful?: boolean;
    holderProofCheck?: { valid?: boolean; error?: unknown } | null;
    schemaAndSignatureCheck?: { valid?: boolean; error?: unknown };
    expiryCheck?: { valid?: boolean };
    statusChecks?: Array<{ purpose?: string; valid?: boolean; error?: unknown }>;
    statusCheck?: Array<{ purpose?: string; valid?: boolean; error?: unknown }>;
  }>;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * The playground outcome of an Inji Verify v2 result. Every check valid -> VALID. A genuine signature with
 * a failed expiry check -> EXPIRED (Inji Verify shows "Valid but expired"). Anything else, including a
 * verifier error (HTTP 5xx, `VP_VERIFICATION_FAILED`) -> INVALID, with the failing checks named.
 */
export function outcomeOfInjiResult(
  httpStatus: number,
  body: InjiVpResultV2,
): Omit<VerificationResult, 'receivedAt' | 'raw'> {
  const checks: VerificationCheck[] = [];
  if (httpStatus >= 400 || body.errorCode) {
    checks.push({
      id: 'verify-service',
      status: 'fail',
      detail: `HTTP ${httpStatus}${body.errorCode ? ` ${body.errorCode}` : ''}${body.errorMessage ? `: ${body.errorMessage}` : ''}`,
    });
    return { outcome: 'INVALID', checks };
  }
  const results = body.credentialResults ?? [];
  if (results.length === 0) {
    checks.push({ id: 'credentials', status: 'fail', detail: 'Inji Verify returned no credential result' });
    return { outcome: 'INVALID', checks };
  }
  const check = (id: string, valid: boolean | undefined, detail?: unknown) => {
    if (valid === undefined) return;
    checks.push({
      id,
      status: valid ? 'pass' : 'fail',
      ...(valid || detail === undefined || detail === null
        ? {}
        : { detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }),
    });
  };
  results.forEach((result) => {
    check('signature', result.schemaAndSignatureCheck?.valid, result.schemaAndSignatureCheck?.error);
    check('validity', result.expiryCheck?.valid);
    if (result.holderProofCheck)
      check('holder-binding', result.holderProofCheck.valid, result.holderProofCheck.error);
    for (const status of result.statusChecks ?? result.statusCheck ?? []) {
      check(`status${status.purpose ? `-${status.purpose}` : ''}`, status.valid, status.error);
    }
  });
  if (body.allChecksSuccessful === true && results.every((result) => result.allChecksSuccessful !== false)) {
    return { outcome: 'VALID', checks };
  }
  const onlyExpired = results.every(
    (result) =>
      result.schemaAndSignatureCheck?.valid !== false &&
      result.holderProofCheck?.valid !== false &&
      result.expiryCheck?.valid === false,
  );
  return { outcome: onlyExpired ? 'EXPIRED' : 'INVALID', checks };
}

/** Long-polls the request status until the wallet has submitted, the request expired, or the run stops. */
async function waitForSubmission(ctx: RunContext, base: string, requestId: string): Promise<void> {
  for (;;) {
    const response = await ctx.http.fetch(
      `${base}/v1/verify/vp-request/${encodeURIComponent(requestId)}/status`,
      {
        signal: ctx.signal,
        step: 'verifier.result',
      },
    );
    const body = (await response.json().catch(() => ({}))) as { status?: string };
    if (!response.ok)
      throw new RoleError('verifier.status-failed', `Inji Verify status answered HTTP ${response.status}`);
    if (body.status === 'VP_SUBMITTED') return;
    if (body.status === 'EXPIRED') {
      throw new RoleError(
        'verifier.request-expired',
        'the Inji Verify request expired before a presentation arrived',
      );
    }
    // ACTIVE: the long poll ended without a submission. A submission verify-service refused (HTTP 4xx, for
    // example INVALID_VP_TOKEN for an mso_mdoc, gap G28) leaves the request ACTIVE, so end the wait on it.
    const refused = refusedSubmission(ctx);
    if (refused) throw refused;
  }
}

/** A `direct_post` this run made that verify-service answered with an error, as a `RoleError`. */
function refusedSubmission(ctx: RunContext): RoleError | undefined {
  const exchange = ctx.http
    .exchanges()
    .find(
      (candidate) =>
        candidate.request.method === 'POST' &&
        /\/vp-submission\/direct-post\/?$/.test(new URL(candidate.request.url).pathname) &&
        (candidate.response?.status ?? 0) >= 400,
    );
  if (!exchange?.response) return undefined;
  let detail = '';
  try {
    const body = JSON.parse(exchange.response.body ?? '') as { errorCode?: string; errorMessage?: string };
    detail = [body.errorCode, body.errorMessage].filter(Boolean).join(': ');
  } catch {
    detail = (exchange.response.body ?? '').slice(0, 200);
  }
  return new RoleError(
    'verifier.submission-refused',
    `Inji Verify refused the presentation with HTTP ${exchange.response.status}${detail ? ` (${detail})` : ''}`,
  );
}

/** Fetches the v2 result and turns it into the playground's verification result. */
async function fetchResult(
  ctx: RunContext,
  base: string,
  transactionId: string,
): Promise<VerificationResult> {
  const response = await ctx.http.fetch(
    `${base}/v1/verify/v2/vp-results/${encodeURIComponent(transactionId)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      signal: ctx.signal,
      step: 'verifier.result',
    },
  );
  const raw = await response.text();
  let body: InjiVpResultV2 = {};
  try {
    body = JSON.parse(raw) as InjiVpResultV2;
  } catch {
    body = { errorMessage: raw.slice(0, 200) };
  }
  return { ...outcomeOfInjiResult(response.status, body), raw, receivedAt: new Date().toISOString() };
}

function refOf(created: InjiVpRequest): PresentationRequestRef {
  const details = created.authorizationDetails;
  return {
    requestUri: walletRequestUri(created),
    handle: created.transactionId,
    queryKind: 'presentation_definition',
    ...(details?.nonce ? { nonce: details.nonce } : {}),
    ...(details?.clientId ? { clientId: details.clientId } : {}),
    ...(details?.responseUri ? { responseUri: details.responseUri } : {}),
    verifierState: { requestId: created.requestId, transactionId: created.transactionId },
  };
}

function stateOf(ref: PresentationRequestRef): { requestId: string; transactionId: string } {
  const state = ref.verifierState as { requestId?: unknown; transactionId?: unknown } | undefined;
  if (typeof state?.requestId !== 'string' || typeof state.transactionId !== 'string') {
    throw new RoleError(
      'verifier.state-missing',
      'the request reference lacks the Inji Verify request and transaction ids',
    );
  }
  return { requestId: state.requestId, transactionId: state.transactionId };
}

function assertFormat(spec: PresentationSpec, extra: readonly string[] = []): void {
  if (![...FORMATS, ...extra].includes(spec.format)) {
    throw new RoleError('verifier.format-unsupported', `Inji Verify 0.18.2 does not request ${spec.format}`);
  }
}

export class InjiVerifyRole implements VerifierRole {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
  }

  describe(): RoleDescriptor {
    return {
      id: 'inji-verify',
      kind: 'verifier',
      name: 'Inji Verify (API)',
      ecosystem: 'inji',
      version: INJI_VERSIONS.verifyService,
      interaction: 'automatic',
      description:
        'Inji Verify verify-service from the local stack, driven through its OpenID4VP API: Presentation Exchange request by value, direct_post response, v2 result.',
      // mso_mdoc is listed so the matrix measures it: verify-service 0.18.2 stores an mso_mdoc request, but
      // its presentation verification has no mso_mdoc path (gap G28).
      capabilities: { ...capabilities, formats: [...FORMATS, 'mso_mdoc'] },
      notes: [
        'OpenID4VP drafts only (no DCQL, no direct_post.jwt); advertises vc+sd-jwt, not dc+sd-jwt.',
        'mso_mdoc requests are accepted, but presentations are not verified as mdoc (gap G28).',
      ],
    };
  }

  health(): Promise<Health> {
    return probe(`${this.#baseUrl}/v1/verify/did.json`);
  }

  async createRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestRef> {
    assertFormat(spec, ['mso_mdoc']);
    const response = await ctx.http.fetch(`${this.#baseUrl}/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: INJI_VERIFY_CLIENT_ID,
        presentationDefinition: farmerPresentationDefinition(spec.format, spec.credentialType),
      }),
      signal: ctx.signal,
    });
    if (response.status !== 201 && response.status !== 200) {
      throw new RoleError(
        'verifier.request-failed',
        `Inji Verify /vp-request answered HTTP ${response.status}`,
      );
    }
    const created = (await response.json()) as InjiVpRequest;
    if (!created.authorizationDetails && !created.requestUri) {
      throw new RoleError('verifier.request-invalid', 'Inji Verify answered without authorization details');
    }
    return refOf(created);
  }

  async awaitResult(ctx: RunContext, ref: PresentationRequestRef): Promise<VerificationResult> {
    const { requestId, transactionId } = stateOf(ref);
    await waitForSubmission(ctx, this.#baseUrl, requestId);
    return fetchResult(ctx, this.#baseUrl, transactionId);
  }
}

export interface InjiVerifySdkOptions {
  baseUrl: string;
  hub: CaptureHub;
}

export class InjiVerifySdkRole implements VerifierRole {
  readonly #options: InjiVerifySdkOptions;

  constructor(options: InjiVerifySdkOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') };
  }

  describe(): RoleDescriptor {
    return {
      id: 'inji-verify-sdk',
      kind: 'verifier',
      name: 'Inji Verify (web component)',
      ecosystem: 'inji',
      version: `${INJI_VERSIONS.verifyService} + SDK 0.18.1`,
      interaction: 'browser',
      description:
        'The official Inji Verify web component (@injistack/react-inji-verify-sdk 0.18.1) in the playground page, against verify-service through the playground proxy. Keep the run page open while it runs.',
      capabilities,
      notes: [
        'The run waits for the component in an open playground page; it creates the request when the page shows it.',
      ],
    };
  }

  health(): Promise<Health> {
    return probe(`${this.#options.baseUrl}/v1/verify/did.json`);
  }

  async createRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestRef> {
    assertFormat(spec);
    // The component's calls reach /v1/verify/* without naming the run; this claim records them here.
    this.#options.hub.claim(ctx.runId, 'verify');
    const session = await this.#options.hub.waitFor(ctx.runId, isSessionRequest, ctx.signal);
    try {
      return refOf(JSON.parse(session.response!.body!) as InjiVpRequest);
    } catch (error) {
      throw new RoleError(
        'verifier.request-invalid',
        `cannot read the component's /vp-session-request answer: ${String(error)}`,
      );
    }
  }

  async awaitResult(ctx: RunContext, ref: PresentationRequestRef): Promise<VerificationResult> {
    const { transactionId } = stateOf(ref);
    for (;;) {
      const callback = await ctx.waitForCallback();
      if (callback.kind === 'error') {
        throw new RoleError(
          `verifier.sdk-${callback.errorCode ?? 'error'}`,
          `the Inji Verify component reported: ${callback.errorMessage ?? 'an error'}`,
        );
      }
      if (callback.kind === 'vp-received') {
        return fetchResult(ctx, this.#options.baseUrl, callback.transactionId ?? transactionId);
      }
    }
  }
}

function isSessionRequest(exchange: RecordedExchange): boolean {
  const status = exchange.response?.status ?? 0;
  return (
    exchange.request.method === 'POST' &&
    /\/vp-session-request\/?$/.test(new URL(exchange.request.url).pathname) &&
    status >= 200 &&
    status < 300 &&
    exchange.response?.body !== undefined
  );
}
