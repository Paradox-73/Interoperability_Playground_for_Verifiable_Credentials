/**
 * Reference OpenID4VP verifier, written from the specifications and independent of Inji.
 *
 * Lifecycle of one request:
 * 1. `createRequest()` stores a pending request (fresh `state` and `nonce`) and returns the
 *    `openid4vp://authorize?...` URI a QR code or a link carries.
 * 2. A DID client id is answered by reference: the wallet fetches the signed request object from
 *    `<baseUrl>/requests/<handle>` (`requestObject()`).
 * 3. The wallet posts its response form-encoded to `<baseUrl>/response` (`handleResponse()`,
 *    response mode `direct_post`, OpenID4VP 1.0 section 8.2).
 * 4. `awaitResult()` resolves with the verification report.
 *
 * `state` is single use: the first response for a state consumes it, before any verification starts,
 * so a replayed `vp_token` is rejected even while the first one is still being verified
 * (OpenID4VP 1.0 section 14.1 and 14.2). The nonce lives and dies with its request.
 */
import {
  createDidKey,
  createDidResolver,
  didKeyVerificationMethodId,
  generateKeyPair,
  isRecord,
  type DidResolver,
  type DocumentLoader,
  type JsonObject,
  type KeyPair,
  type PublicJwk,
} from '@inji-playground/formats';
import type {
  CredentialFormat,
  PresentationRequestRef,
  VerificationResult,
  VpProfile,
} from '@inji-playground/protocol';
import { formatClientId } from '../common/client-id.js';
import {
  DC_API_PROTOCOL_UNSIGNED,
  DC_API_RESPONSE_MODE,
  originClientId,
  type DcApiRequest,
} from '../common/dc-api.js';
import {
  REQUEST_OBJECT_MEDIA_TYPE,
  SELF_ISSUED_AUDIENCE,
  isPresentableFormat,
  isSdJwtVcFormat,
  vpFormatsMetadata,
  type ClientIdScheme,
  type PresentableFormat,
} from '../common/constants.js';
import { Oid4vpError } from '../common/errors.js';
import { signRequestObject } from '../common/request-object.js';
import { buildRequestUri } from '../common/request-uri.js';
import {
  epochSeconds,
  objectParameter,
  parseJsonParameter,
  randomToken,
  trimTrailingSlash,
} from '../common/util.js';
import { buildDcqlQuery, checkDcqlPresentation, parseDcqlQuery, type DcqlQueryJson } from '../query/dcql.js';
import {
  buildPresentationDefinition,
  evaluateInputDescriptor,
  parsePresentationSubmission,
  resolveSubmissionPath,
  type PresentationDefinition,
  type QuerySpec,
} from '../query/presentation-exchange.js';
import type { CredentialView } from '../query/credential-view.js';
import {
  verifyPresentation,
  type Check,
  type PresentationVerification,
  type PresentationVerifierContext,
  type ReportedError,
} from './verify-presentation.js';

export interface ReferenceVerifierOptions {
  /** Public base URL the wallet reaches, for example `http://localhost:28100/ref/verifier`. */
  baseUrl: string;
  /** Ed25519 key that signs request objects. Default: a fresh key. */
  signingKey?: KeyPair;
  /** The verifier's DID and the DID URL of its key. Default: the did:key of `signingKey`. */
  did?: string;
  kid?: string;
  /** Resolves issuer and holder DIDs (and the verifier's own did:web, if used). */
  didResolver?: DidResolver;
  /** JSON-LD document loader for `ldp_vp` verification. */
  documentLoader: DocumentLoader;
  /** SD-JWT VC issuer keys known out of band, and x5c trust anchors. */
  sdJwtIssuerKeys?: PublicJwk[];
  x5cTrustAnchors?: string[];
  /** Lifetime of a request. Default 300 s, like Inji Verify's `DEFAULT_EXPIRY`. */
  requestTtlSeconds?: number;
  clientName?: string;
  /** Clock, for tests. */
  now?: () => Date;
  clockSkewSeconds?: number;
}

export interface CreateRequestInput {
  profile: VpProfile;
  format: CredentialFormat;
  /** What to ask for; ignored when `presentationDefinition` or `dcqlQuery` is given. */
  query?: QuerySpec;
  /** Send this presentation definition (`inji-draft`) or DCQL query (`final-1.0`) unchanged. */
  presentationDefinition?: PresentationDefinition;
  dcqlQuery?: DcqlQueryJson;
  /** Default `did`. */
  clientIdScheme?: ClientIdScheme;
  /**
   * DID scheme only: `true` (default) serves the signed request object at `request_uri`; `false`
   * puts it in the URI as `request`. The `redirect_uri` scheme is always unsigned and by value.
   */
  byReference?: boolean;
  /** Same-device flow: returned to the wallet in the direct_post response (section 8.2). */
  redirectUri?: string;
}

export interface CreatedRequest {
  /** `openid4vp://authorize?...`, what the QR code shows. */
  uri: string;
  handle: string;
  state: string;
  nonce: string;
  clientId: string;
  responseUri: string;
  requestUri?: string;
  /** The signed request object, when the DID scheme is used (for the inspector). */
  requestObject?: string;
  /** All request parameters, as signed or as put into the URI. */
  parameters: JsonObject;
  /** The same request in the protocol package's shape, for the orchestrator. */
  ref: PresentationRequestRef;
}

export interface CreateDcApiRequestInput {
  format: CredentialFormat;
  /**
   * Origins of the verifier's own web pages, which may call `navigator.credentials.get()` (a server reached
   * as http://localhost:28100 and through a public URL has two). The answer must be bound to the origin
   * of the page that posts it (the `Origin` header), and that origin must be one of these.
   */
  origins: readonly string[];
  query?: QuerySpec;
  dcqlQuery?: DcqlQueryJson;
}

export interface CreatedDcApiRequest {
  handle: string;
  nonce: string;
  /** `origin:<origin>` for each allowed origin: the client ids a wallet may use (OpenID4VP 1.0 Appendix A.4). */
  clientIds: string[];
  /** The entry for `digital.requests` of `navigator.credentials.get()`. */
  request: DcApiRequest;
}

export interface PresentedCredential {
  /** Descriptor id (`inji-draft`) or credential query id (`final-1.0`). */
  queryId: string;
  format: PresentableFormat;
  outcome: PresentationVerification['outcome'];
  issuer?: string;
  proofType?: string;
  claims?: JsonObject;
}

export interface VerificationReport {
  handle: string;
  profile: VpProfile;
  outcome: 'VALID' | 'INVALID' | 'EXPIRED' | 'ERROR';
  checks: Check[];
  /** Claims of every presented credential, merged (first one wins on a clash). */
  claims: JsonObject;
  presentations: PresentedCredential[];
  errors: ReportedError[];
  warnings: string[];
  receivedAt: string;
}

export interface DirectPostResponse {
  status: number;
  body: JsonObject;
}

interface PendingRequest {
  handle: string;
  profile: VpProfile;
  format: PresentableFormat;
  state: string;
  nonce: string;
  clientId: string;
  responseUri: string;
  parameters: JsonObject;
  requestObject?: string;
  redirectUri?: string;
  /** Set for a request sent through the Digital Credentials API (no state, no response_uri). */
  dcApi?: { origins: string[]; origin?: string };
  expiresAt: number;
  consumed: boolean;
  report?: VerificationReport;
  waiters: ((report: VerificationReport) => void)[];
}

export class ReferenceVerifier {
  readonly baseUrl: string;
  readonly did: string;
  readonly kid: string;
  readonly responseUri: string;
  private readonly signingKey: KeyPair;
  private readonly options: ReferenceVerifierOptions;
  private readonly resolver: DidResolver;
  private readonly byHandle = new Map<string, PendingRequest>();
  private readonly byState = new Map<string, PendingRequest>();
  private readonly trustAnchors: string[];

  constructor(options: ReferenceVerifierOptions) {
    this.options = options;
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.signingKey = options.signingKey ?? generateKeyPair('EdDSA');
    this.did = options.did ?? createDidKey(this.signingKey.publicJwk);
    this.kid = options.kid ?? didKeyVerificationMethodId(this.did);
    this.responseUri = `${this.baseUrl}/response`;
    this.resolver = options.didResolver ?? createDidResolver();
    this.trustAnchors = [...(options.x5cTrustAnchors ?? [])];
  }

  /**
   * Adds x5c trust anchors (PEM certificates) after start, for issuers whose certificates are known only
   * once they run (Inji Certify publishes its signing certificates through its system-info API).
   */
  addX5cTrustAnchors(pems: readonly string[]): void {
    for (const pem of pems) if (!this.trustAnchors.includes(pem)) this.trustAnchors.push(pem);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  createRequest(input: CreateRequestInput): CreatedRequest {
    const { profile, format } = input;
    if (!isPresentableFormat(format)) {
      throw new Oid4vpError('REQUEST_INVALID', `the reference verifier does not verify ${format}`);
    }
    const scheme = input.clientIdScheme ?? 'did';
    const identifier = scheme === 'did' ? this.did : this.responseUri;
    const { clientId, clientIdScheme } = formatClientId(profile, scheme, identifier);
    const handle = randomToken();
    const state = randomToken();
    const nonce = randomToken();
    const now = this.now();
    const expiresAt = now.getTime() + (this.options.requestTtlSeconds ?? 300) * 1000;

    const query =
      profile === 'inji-draft'
        ? {
            presentation_definition:
              input.presentationDefinition ?? buildPresentationDefinition(format, input.query),
          }
        : { dcql_query: input.dcqlQuery ?? buildDcqlQuery(format, input.query) };
    const clientMetadata = {
      client_name: this.options.clientName ?? 'Playground reference verifier',
      [profile === 'inji-draft' ? 'vp_formats' : 'vp_formats_supported']: vpFormatsMetadata(),
    };
    const parameters: JsonObject = {
      client_id: clientId,
      ...(clientIdScheme ? { client_id_scheme: clientIdScheme } : {}),
      response_type: 'vp_token',
      response_mode: 'direct_post',
      response_uri: this.responseUri,
      nonce,
      state,
      ...query,
      client_metadata: clientMetadata,
    };

    let uri: string;
    let requestObject: string | undefined;
    let requestUri: string | undefined;
    if (scheme === 'did') {
      const signed: JsonObject = {
        iss: clientId,
        aud: SELF_ISSUED_AUDIENCE,
        iat: epochSeconds(now),
        exp: Math.floor(expiresAt / 1000),
        jti: randomToken(),
        ...parameters,
      };
      requestObject = signRequestObject(signed, this.signingKey, this.kid);
      if (input.byReference === false) {
        uri = buildRequestUri({ client_id: clientId, request: requestObject });
      } else {
        requestUri = `${this.baseUrl}/requests/${handle}`;
        uri = buildRequestUri({ client_id: clientId, request_uri: requestUri });
      }
    } else {
      if (input.byReference === true) {
        throw new Oid4vpError(
          'REQUEST_INVALID',
          'the redirect_uri client id scheme sends the request by value only',
          {
            spec: 'OpenID4VP 1.0 section 5.9.3 (redirect_uri requests are not signed)',
          },
        );
      }
      uri = buildRequestUri(parameters);
    }

    const pending: PendingRequest = {
      handle,
      profile,
      format,
      state,
      nonce,
      clientId,
      responseUri: this.responseUri,
      parameters,
      ...(requestObject ? { requestObject } : {}),
      ...(input.redirectUri ? { redirectUri: input.redirectUri } : {}),
      expiresAt,
      consumed: false,
      waiters: [],
    };
    this.prune();
    this.byHandle.set(handle, pending);
    this.byState.set(state, pending);
    return {
      uri,
      handle,
      state,
      nonce,
      clientId,
      responseUri: this.responseUri,
      ...(requestUri ? { requestUri } : {}),
      ...(requestObject ? { requestObject } : {}),
      parameters,
      ref: {
        requestUri: uri,
        handle,
        queryKind: profile === 'inji-draft' ? 'presentation_definition' : 'dcql_query',
        nonce,
        clientId,
        responseUri: this.responseUri,
      },
    };
  }

  /** The signed request object served at `request_uri` (RFC 9101 section 5.2). */
  requestObject(handle: string): { body: string; contentType: string } {
    const pending = this.byHandle.get(handle);
    if (!pending?.requestObject) {
      throw new Oid4vpError('REQUEST_NOT_FOUND', 'no request object under this request_uri', { status: 404 });
    }
    if (this.now().getTime() > pending.expiresAt) {
      throw new Oid4vpError('REQUEST_EXPIRED', 'the authorization request has expired', { status: 410 });
    }
    return { body: pending.requestObject, contentType: REQUEST_OBJECT_MEDIA_TYPE };
  }

  /**
   * An unsigned OpenID4VP 1.0 request for the Digital Credentials API (Appendix A.2 and A.3.1): DCQL,
   * `response_mode` `dc_api`, a fresh nonce, and no `client_id`, `state` or `response_uri`. The page that
   * calls `navigator.credentials.get()` must have one of `input.origins`, because the wallet binds the
   * presentation to the calling origin.
   */
  createDcApiRequest(input: CreateDcApiRequestInput): CreatedDcApiRequest {
    const { format } = input;
    if (!isPresentableFormat(format)) {
      throw new Oid4vpError('REQUEST_INVALID', `the reference verifier does not verify ${format}`);
    }
    const origins = [...new Set(input.origins.map((origin) => new URL(origin).origin))];
    if (origins.length === 0)
      throw new Oid4vpError('REQUEST_INVALID', 'a Digital Credentials API request needs an origin');
    const handle = randomToken();
    const nonce = randomToken();
    const expiresAt = this.now().getTime() + (this.options.requestTtlSeconds ?? 300) * 1000;
    const parameters: JsonObject = {
      response_type: 'vp_token',
      response_mode: DC_API_RESPONSE_MODE,
      nonce,
      dcql_query: input.dcqlQuery ?? buildDcqlQuery(format, input.query),
      client_metadata: {
        client_name: this.options.clientName ?? 'Playground reference verifier',
        vp_formats_supported: vpFormatsMetadata(),
      },
    };
    const pending: PendingRequest = {
      handle,
      profile: 'final-1.0',
      format,
      // Not sent: the Digital Credentials API answer goes back to the calling page, not to a response_uri.
      state: randomToken(),
      nonce,
      // Set from the posting page's origin when the answer arrives.
      clientId: originClientId(origins[0]!),
      responseUri: '',
      parameters,
      dcApi: { origins },
      expiresAt,
      consumed: false,
      waiters: [],
    };
    this.prune();
    this.byHandle.set(handle, pending);
    return {
      handle,
      nonce,
      clientIds: origins.map(originClientId),
      request: { protocol: DC_API_PROTOCOL_UNSIGNED, data: parameters },
    };
  }

  /** The Digital Credentials API request of `handle`, as the page passes it to the browser. */
  dcApiRequest(handle: string): DcApiRequest {
    const pending = this.byHandle.get(handle);
    if (!pending?.dcApi) {
      throw new Oid4vpError('REQUEST_NOT_FOUND', 'no Digital Credentials API request with this handle', {
        status: 404,
      });
    }
    if (this.now().getTime() > pending.expiresAt) {
      throw new Oid4vpError('REQUEST_EXPIRED', 'the authorization request has expired', { status: 410 });
    }
    return { protocol: DC_API_PROTOCOL_UNSIGNED, data: pending.parameters };
  }

  /**
   * Verifies what the page received from `navigator.credentials.get()`: `{ protocol, data }` with `data` the
   * authorization response, `{ vp_token: { <query id>: [ ... ] } }` (Appendix A.5 and section 8.1), or an
   * error response. `origin` is the origin of the page that posts it (its `Origin` header), the origin the
   * browser bound the answer to; default the first allowed origin. Single use, like a `direct_post` state.
   */
  async handleDcApiResponse(
    handle: string,
    response: unknown,
    options: { origin?: string } = {},
  ): Promise<VerificationReport> {
    const pending = this.byHandle.get(handle);
    if (!pending?.dcApi) {
      throw new Oid4vpError('REQUEST_NOT_FOUND', 'no Digital Credentials API request with this handle', {
        status: 404,
      });
    }
    if (pending.consumed) {
      throw new Oid4vpError('STATE_REPLAYED', 'a response for this request was already received', {
        spec: 'OpenID4VP 1.0 section 14.1 (replay)',
      });
    }
    pending.consumed = true;
    let report: VerificationReport;
    try {
      const origin = options.origin ? new URL(options.origin).origin : pending.dcApi.origins[0]!;
      if (!pending.dcApi.origins.includes(origin)) {
        throw new Oid4vpError(
          'CLIENT_ID_MISMATCH',
          `the answer comes from ${origin}, not from a page of this verifier`,
          {
            spec: 'OpenID4VP 1.0 Appendix A.4 (origin binding)',
            details: { origin, allowed: pending.dcApi.origins },
          },
        );
      }
      pending.dcApi.origin = origin;
      pending.clientId = originClientId(origin);
      if (this.now().getTime() > pending.expiresAt) {
        throw new Oid4vpError(
          'REQUEST_EXPIRED',
          'the authorization request expired before the response arrived',
        );
      }
      const envelope = isRecord(response) ? response : {};
      if (envelope.protocol !== undefined && envelope.protocol !== DC_API_PROTOCOL_UNSIGNED) {
        throw new Oid4vpError(
          'RESPONSE_INVALID',
          `protocol ${JSON.stringify(envelope.protocol)} was not requested`,
          {
            spec: 'OpenID4VP 1.0 Appendix A.1',
          },
        );
      }
      const data = isRecord(envelope.data) ? envelope.data : envelope;
      if (typeof data.error === 'string') {
        const error = new Oid4vpError('VERIFIER_REJECTED', `wallet answered with error ${data.error}`, {
          details: { error: data.error, error_description: data.error_description },
        });
        report = { ...this.errorReport(pending, error), outcome: 'ERROR' };
      } else {
        const vpToken =
          typeof data.vp_token === 'string' ? data.vp_token : JSON.stringify(data.vp_token ?? '');
        if (data.vp_token === undefined) {
          throw new Oid4vpError('RESPONSE_INVALID', 'vp_token is missing', {
            spec: 'OpenID4VP 1.0 Appendix A.5',
          });
        }
        report = await this.verifyResponse(pending, vpToken, undefined);
      }
    } catch (error) {
      const failure =
        error instanceof Oid4vpError
          ? error
          : new Oid4vpError('RESPONSE_INVALID', String(error), { cause: error });
      report = this.errorReport(pending, failure);
    }
    this.finish(pending, report);
    return report;
  }

  /**
   * Handles a `direct_post` response (form fields as strings). Answers 200 with an empty object (or
   * `redirect_uri` for same-device flows) once the response is accepted for verification; the outcome
   * itself is read with `awaitResult()`. Protocol errors answer 400 and, when the state is known, also
   * finish the request with an `ERROR` or `INVALID` report so a waiting run does not hang.
   */
  async handleResponse(
    form: URLSearchParams | Record<string, string | undefined>,
  ): Promise<DirectPostResponse> {
    const field = (name: string): string | undefined =>
      form instanceof URLSearchParams ? (form.get(name) ?? undefined) : form[name];
    const state = field('state');
    if (!state)
      return errorResponse(
        new Oid4vpError('RESPONSE_INVALID', 'state is missing', { spec: 'OpenID4VP 1.0 section 8.2' }),
      );
    const pending = this.byState.get(state);
    if (!pending)
      return errorResponse(new Oid4vpError('STATE_UNKNOWN', 'no authorization request has this state'));
    if (pending.consumed) {
      return errorResponse(
        new Oid4vpError(
          'STATE_REPLAYED',
          'a response for this state was already received; state and nonce are single use',
          {
            spec: 'OpenID4VP 1.0 sections 14.1 (replay) and 8.2 (state)',
          },
        ),
      );
    }
    // Consumed before the first await: a concurrent replay sees it already.
    pending.consumed = true;
    if (this.now().getTime() > pending.expiresAt) {
      const error = new Oid4vpError(
        'REQUEST_EXPIRED',
        'the authorization request expired before the response arrived',
      );
      this.finish(pending, this.errorReport(pending, error));
      return errorResponse(error);
    }

    const walletError = field('error');
    if (walletError) {
      const error = new Oid4vpError('VERIFIER_REJECTED', `wallet answered with error ${walletError}`, {
        details: { error: walletError, error_description: field('error_description') },
      });
      this.finish(pending, { ...this.errorReport(pending, error), outcome: 'ERROR' });
      return { status: 200, body: {} };
    }

    let report: VerificationReport;
    try {
      report = await this.verifyResponse(pending, field('vp_token'), field('presentation_submission'));
    } catch (error) {
      const failure =
        error instanceof Oid4vpError
          ? error
          : new Oid4vpError('RESPONSE_INVALID', String(error), { cause: error });
      this.finish(pending, this.errorReport(pending, failure));
      return errorResponse(failure);
    }
    this.finish(pending, report);
    return { status: 200, body: pending.redirectUri ? { redirect_uri: pending.redirectUri } : {} };
  }

  /** Resolves with the report of `handle`, as soon as a response has been verified. */
  awaitResult(
    handle: string,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<VerificationReport> {
    const pending = this.byHandle.get(handle);
    if (!pending)
      return Promise.reject(new Oid4vpError('REQUEST_NOT_FOUND', `no request with handle ${handle}`));
    if (pending.report) return Promise.resolve(pending.report);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Oid4vpError('TIMEOUT', 'no wallet response before the timeout')),
        options.timeoutMs ?? 120_000,
      );
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        const reason: unknown = options.signal?.reason;
        reject(reason instanceof Error ? reason : new Oid4vpError('TIMEOUT', 'aborted'));
      });
      pending.waiters.push((report) => {
        clearTimeout(timer);
        resolve(report);
      });
    });
  }

  /** The report of `handle`, if a response has been verified. */
  result(handle: string): VerificationReport | undefined {
    return this.byHandle.get(handle)?.report;
  }

  private finish(pending: PendingRequest, report: VerificationReport): void {
    pending.report = report;
    for (const waiter of pending.waiters.splice(0)) waiter(report);
  }

  private prune(): void {
    // Finished or expired requests are kept for an hour, so late result reads still work.
    const cutoff = this.now().getTime() - 3_600_000;
    for (const [handle, pending] of this.byHandle) {
      if (pending.expiresAt < cutoff) {
        this.byHandle.delete(handle);
        this.byState.delete(pending.state);
      }
    }
  }

  private errorReport(pending: PendingRequest, error: Oid4vpError): VerificationReport {
    return {
      handle: pending.handle,
      profile: pending.profile,
      outcome: 'INVALID',
      checks: [
        {
          id: 'response',
          status: 'fail',
          detail: `${error.code}: ${error.message}`,
          ...(error.spec ? { spec: error.spec } : {}),
        },
      ],
      claims: {},
      presentations: [],
      errors: [error.toJSON()],
      warnings: [],
      receivedAt: this.now().toISOString(),
    };
  }

  private presentationContext(pending: PendingRequest): PresentationVerifierContext {
    return {
      nonce: pending.nonce,
      clientId: pending.clientId,
      documentLoader: this.options.documentLoader,
      didResolver: this.resolver,
      ...(this.options.sdJwtIssuerKeys ? { sdJwtIssuerKeys: this.options.sdJwtIssuerKeys } : {}),
      ...(this.trustAnchors.length > 0 ? { x5cTrustAnchors: [...this.trustAnchors] } : {}),
      now: this.now(),
      ...(this.options.clockSkewSeconds === undefined
        ? {}
        : { clockSkewSeconds: this.options.clockSkewSeconds }),
    };
  }

  private async verifyResponse(
    pending: PendingRequest,
    vpTokenField: string | undefined,
    submissionField: string | undefined,
  ): Promise<VerificationReport> {
    if (!vpTokenField) {
      throw new Oid4vpError('RESPONSE_INVALID', 'vp_token is missing', { spec: 'OpenID4VP 1.0 section 8.1' });
    }
    return pending.profile === 'inji-draft'
      ? this.verifyDraftResponse(pending, vpTokenField, submissionField)
      : this.verifyFinalResponse(pending, vpTokenField);
  }

  /** Drafts: `vp_token` is one presentation or an array, mapped by `presentation_submission`. */
  private async verifyDraftResponse(
    pending: PendingRequest,
    vpTokenField: string,
    submissionField: string | undefined,
  ): Promise<VerificationReport> {
    if (!submissionField) {
      // Inji Verify rejects this too (VPSubmissionController.java:47-52).
      throw new Oid4vpError('SUBMISSION_INVALID', 'presentation_submission is missing', {
        spec: 'OpenID4VP draft 21 section 6.1',
      });
    }
    // Written by createRequest() from a PresentationDefinition, so the shape is known.
    const definition = pending.parameters.presentation_definition as PresentationDefinition;
    const submission = parsePresentationSubmission(
      objectParameter('presentation_submission', submissionField, 'SUBMISSION_INVALID'),
      definition,
    );
    const vpToken = decodeVpTokenField(vpTokenField);
    const checks: Check[] = [
      { id: 'state', status: 'pass' },
      { id: 'presentation_submission', status: 'pass' },
    ];
    const results: { queryId: string; format: PresentableFormat; verification: PresentationVerification }[] =
      [];
    for (const entry of submission.descriptor_map) {
      const format = presentationFormat(entry.format);
      const presentation = resolveSubmissionPath(entry.path, vpToken);
      const verification = await verifyPresentation(format, presentation, this.presentationContext(pending));
      const descriptor = definition.input_descriptors.find((candidate) => candidate.id === entry.id);
      if (verification.view && descriptor) {
        const evaluation = evaluateInputDescriptor(descriptor, definition, verification.view);
        verification.checks.push(
          evaluation.matched
            ? { id: 'query', status: 'pass' }
            : {
                id: 'query',
                status: 'fail',
                detail: evaluation.reason ?? 'does not satisfy the input descriptor',
              },
        );
        if (!evaluation.matched) verification.outcome = 'INVALID';
      }
      results.push({ queryId: entry.id, format, verification });
    }
    return this.report(pending, checks, results);
  }

  /** 1.0: `vp_token` is `{ <credential query id>: [presentation, ...] }` (section 8.1). */
  private async verifyFinalResponse(
    pending: PendingRequest,
    vpTokenField: string,
  ): Promise<VerificationReport> {
    const vpToken = objectParameter('vp_token', vpTokenField, 'RESPONSE_INVALID');
    const query = parseDcqlQuery(pending.parameters.dcql_query);
    const formats = new Map(query.credentials.map((credential) => [credential.id, credential.format]));
    // A Digital Credentials API answer has no state: the browser returns it to the page that asked.
    const checks: Check[] = [
      pending.dcApi
        ? {
            id: 'dc_api',
            status: 'pass',
            detail: `answer for ${pending.dcApi.origin ?? pending.dcApi.origins[0]}`,
          }
        : { id: 'state', status: 'pass' },
    ];
    const unknown = Object.keys(vpToken).filter((id) => !formats.has(id));
    if (unknown.length > 0) {
      throw new Oid4vpError('RESPONSE_INVALID', 'vp_token has keys that are not credential query ids', {
        spec: 'OpenID4VP 1.0 section 8.1',
        details: { unknown },
      });
    }
    const results: { queryId: string; format: PresentableFormat; verification: PresentationVerification }[] =
      [];
    const presented: Record<string, CredentialView[]> = {};
    for (const [queryId, value] of Object.entries(vpToken)) {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Oid4vpError(
          'RESPONSE_INVALID',
          `vp_token.${queryId} must be a non-empty array of presentations`,
          {
            spec: 'OpenID4VP 1.0 section 8.1',
          },
        );
      }
      const format = presentationFormat(String(formats.get(queryId)));
      for (const presentation of value as unknown[]) {
        const verification = await verifyPresentation(
          format,
          presentation,
          this.presentationContext(pending),
        );
        if (verification.view) (presented[queryId] ??= []).push(verification.view);
        results.push({ queryId, format, verification });
      }
    }
    if (results.every((result) => result.verification.outcome === 'VALID')) {
      const match = checkDcqlPresentation(query, presented);
      checks.push(
        match.satisfied
          ? { id: 'query', status: 'pass' }
          : {
              id: 'query',
              status: 'fail',
              detail: match.reason ?? 'dcql_query not satisfied',
              spec: 'OpenID4VP 1.0 section 6.4',
            },
      );
    } else {
      checks.push({ id: 'query', status: 'skipped' });
    }
    return this.report(pending, checks, results);
  }

  private report(
    pending: PendingRequest,
    responseChecks: Check[],
    results: { queryId: string; format: PresentableFormat; verification: PresentationVerification }[],
  ): VerificationReport {
    const several = results.length > 1;
    const checks = [
      ...responseChecks,
      ...results.flatMap(({ verification }, index) =>
        verification.checks.map((check) => (several ? { ...check, id: `vp${index}.${check.id}` } : check)),
      ),
    ];
    const outcomes = results.map((result) => result.verification.outcome);
    const queryFailed = responseChecks.some((check) => check.status === 'fail');
    const outcome =
      results.length === 0 || queryFailed || outcomes.includes('INVALID')
        ? 'INVALID'
        : outcomes.includes('EXPIRED')
          ? 'EXPIRED'
          : 'VALID';
    const claims: JsonObject = {};
    for (const { verification } of results) {
      for (const [name, value] of Object.entries(verification.claims ?? {}))
        if (!(name in claims)) claims[name] = value;
    }
    return {
      handle: pending.handle,
      profile: pending.profile,
      outcome,
      checks,
      claims,
      presentations: results.map(({ queryId, format, verification }) => ({
        queryId,
        format,
        outcome: verification.outcome,
        ...(verification.issuer ? { issuer: verification.issuer } : {}),
        ...(verification.proofType ? { proofType: verification.proofType } : {}),
        ...(verification.claims ? { claims: verification.claims } : {}),
      })),
      errors: results.flatMap((result) => result.verification.errors),
      warnings: results.flatMap((result) => result.verification.warnings),
      receivedAt: this.now().toISOString(),
    };
  }
}

/** The report in the shape the orchestrator stores (`VerificationResult` of the protocol package). */
export function toVerificationResult(report: VerificationReport): VerificationResult {
  return {
    outcome: report.outcome,
    checks: report.checks.map((check) => ({
      id: check.id,
      status: check.status,
      ...(check.detail ? { detail: check.detail } : {}),
    })),
    raw: JSON.stringify(report),
    receivedAt: report.receivedAt,
  };
}

/** Descriptor map formats name the presentation (`ldp_vp`); the credential format is what we verify. */
function presentationFormat(format: string): PresentableFormat {
  if (format === 'ldp_vp' || format === 'ldp_vc') return 'ldp_vc';
  if (isSdJwtVcFormat(format)) return format;
  throw new Oid4vpError('SUBMISSION_INVALID', `presentation format ${format} is not supported`, {
    details: { format },
  });
}

/**
 * The `vp_token` form field: JSON (an object, an array, or a quoted string) or, as Inji Wallet may
 * send for one SD-JWT, the bare compact string.
 */
function decodeVpTokenField(field: string): unknown {
  const trimmed = field.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
    return parseJsonParameter('vp_token', trimmed, 'RESPONSE_INVALID');
  }
  return trimmed;
}

function errorResponse(error: Oid4vpError): DirectPostResponse {
  return { status: error.status, body: { error: error.oauthError, error_description: error.message } };
}

/** Narrows a form body parsed by a web framework into string fields. */
export function formFields(body: unknown): Record<string, string | undefined> {
  if (typeof body === 'string') return Object.fromEntries(new URLSearchParams(body));
  if (!isRecord(body)) return {};
  return Object.fromEntries(
    Object.entries(body).map(([name, value]) => [
      name,
      typeof value === 'string' ? value : value === undefined ? undefined : JSON.stringify(value),
    ]),
  );
}
