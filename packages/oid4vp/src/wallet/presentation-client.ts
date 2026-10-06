/**
 * The wallet side of OpenID4VP for the headless reference wallet: the mirror image of the reference
 * verifier, and the client the playground uses to test Inji Verify without a phone.
 *
 * 1. `resolveRequest(uri)`: parse `openid4vp://` (or `haip-vp://`, `eudi-openid4vp://`), fetch
 *    `request_uri`, check the request object signature for the client id scheme, check the
 *    parameters (OpenID4VP 1.0 sections 5 and 5.10).
 * 2. `selectCredentials()`: match held credentials against the presentation definition (own PE
 *    subset) or the DCQL query (`dcql` library).
 * 3. `buildResponse()`: one presentation per match. ldp_vp signed with `challenge` = nonce and
 *    `domain` = client_id; SD-JWT VC with only the requested disclosures and a KB-JWT whose `aud` is
 *    the full client_id. The holder DID is the one the credential binds, byte for byte. mso_mdoc as a
 *    DeviceResponse with only the requested elements and a DeviceSignature over the SessionTranscript of
 *    the profile (ISO/IEC TS 18013-7 Annex B.4.4 for `inji-draft`, with a fresh mdoc generated nonce
 *    sent as the `mdoc_generated_nonce` form parameter; OpenID4VP 1.0 Appendix B.2.6.1 for `final-1.0`).
 * 4. `submit()`: `direct_post`, form-encoded, with `presentation_submission` in the draft profile.
 *    `beforeSubmit` sees the encoded `vp_token` last, so tamper scenarios change exactly what is sent.
 */
import {
  createDidJwk,
  createDidResolver,
  didKeyVerificationMethodId,
  createLdpVp,
  errorMessage,
  isRecord,
  mdocSessionTranscript,
  presentMdoc,
  presentSdJwtVc,
  type DidResolver,
  type DocumentLoader,
  type JsonObject,
  type KeyPair,
  type LdpProofSuite,
} from '@inji-playground/formats';
import type { VpProfile } from '@inji-playground/protocol';

/** Presentation frame of `presentSdJwtVc` (claim name -> true, or a nested frame). */
type PresentationFrame = Exclude<Parameters<typeof presentSdJwtVc>[0]['disclose'], string[] | 'all'>;
import { parseClientId, type ParsedClientId } from '../common/client-id.js';
import {
  MDOC_GENERATED_NONCE_PARAMETER,
  REQUEST_OBJECT_MEDIA_TYPE,
  isSdJwtVcFormat,
  type PresentableFormat,
} from '../common/constants.js';
import { Oid4vpError } from '../common/errors.js';
import { decodeRequestObject, verifyDidSignedRequestObject } from '../common/request-object.js';
import { parseRequestUri } from '../common/request-uri.js';
import { objectParameter, randomToken, type FetchFn } from '../common/util.js';
import { credentialView, type CredentialView, type StoredCredential } from '../query/credential-view.js';
import { matchDcqlQuery, parseDcqlQuery } from '../query/dcql.js';
import {
  evaluateInputDescriptor,
  parsePresentationDefinition,
  type DescriptorMapEntry,
  type PresentationDefinition,
  type PresentationSubmission,
} from '../query/presentation-exchange.js';

export interface HolderKeys {
  /** Ed25519 for ldp_vp proofs (Ed25519Signature2020 or eddsa-rdfc-2022); any key for KB-JWTs. */
  keyPair: KeyPair;
  /** The holder's own DID and key id, used when a credential names no subject DID. */
  did?: string;
  verificationMethod?: string;
}

export interface PresentationClientOptions {
  /** HTTP client for `request_uri` and the response; the recording client in a playground run. */
  fetch: FetchFn;
  holder: HolderKeys;
  /** JSON-LD document loader for signing ldp_vp presentations. */
  documentLoader: DocumentLoader;
  /** Resolves the verifier's DID. Default: did:key and did:jwk offline, did:web over HTTPS. */
  didResolver?: DidResolver;
  /**
   * `as-bound` (default) presents the holder DID exactly as the credential's `credentialSubject.id`
   * writes it; `canonical` rewrites a padded did:jwk to the unpadded form, a scenario that probes
   * inji/inji-certify#1054.
   */
  holderDidForm?: 'as-bound' | 'canonical';
  /**
   * Pre-registered verifiers this wallet trusts, by `client_id`, with the response URIs each may use
   * (OpenID4VP 1.0 section 5.9.1: a client id without a scheme prefix is known to the wallet in advance).
   * Inji Verify 0.18 sends such a client id with an unsigned request by value, and Inji Wallet and
   * Mimoto keep a list of trusted verifiers for it. Empty by default: unknown pre-registered clients
   * are refused.
   */
  preRegisteredClients?: ReadonlyArray<{ clientId: string; responseUris: readonly string[] }>;
}

export interface ResolvedRequest {
  profile: VpProfile;
  /** The URI as received. */
  uri: string;
  clientId: string;
  client: ParsedClientId;
  /** True when the request came as a signed request object. */
  signed: boolean;
  requestObject?: { jwt: string; header: JsonObject; payload: JsonObject };
  /** Every authorization request parameter, after the request object replaced the URI ones. */
  parameters: JsonObject;
  nonce: string;
  state?: string;
  responseUri: string;
  presentationDefinition?: PresentationDefinition;
  dcqlQuery?: JsonObject;
}

export interface CredentialMatch {
  /** Input descriptor id (`inji-draft`) or credential query id (`final-1.0`). */
  queryId: string;
  credential: StoredCredential;
  view: CredentialView;
  /** Claim paths to disclose (SD-JWT VC); empty means disclose everything. */
  requestedPaths: string[][];
}

export interface AuthorizationResponse {
  /** The `vp_token` value before encoding (object, array or string). */
  vpToken: unknown;
  presentationSubmission?: PresentationSubmission;
  state?: string;
  /** The form fields exactly as they would be posted. */
  form: Record<string, string>;
  /** Format of each presentation, in `vp_token` order. */
  formats: PresentableFormat[];
  /** mso_mdoc in `inji-draft`: the mdoc generated nonce of the SessionTranscript (ISO/IEC TS 18013-7 Annex B.4.4). */
  mdocGeneratedNonce?: string;
}

export interface SubmitOptions {
  /**
   * Called with the encoded `vp_token` form field just before it is posted; the return value is
   * posted instead. Tamper scenarios use it (`ScenarioHooks.tamperPresentation`).
   */
  beforeSubmit?: (
    vpToken: string,
    context: { format: PresentableFormat; request: ResolvedRequest },
  ) => string | Promise<string>;
  signal?: AbortSignal;
}

export interface SubmissionResult {
  status: number;
  body: unknown;
  /** `redirect_uri` from the verifier, for same-device flows (OpenID4VP 1.0 section 8.2). */
  redirectUri?: string;
  form: Record<string, string>;
}

export class PresentationClient {
  private readonly options: PresentationClientOptions;
  private readonly resolver: DidResolver;

  constructor(options: PresentationClientOptions) {
    this.options = options;
    this.resolver = options.didResolver ?? createDidResolver();
  }

  /** Parses the URI, fetches and verifies the request object, and checks the parameters. */
  async resolveRequest(uri: string, signal?: AbortSignal): Promise<ResolvedRequest> {
    const outer = parseRequestUri(uri);
    const outerClientId = outer.client_id;
    let parameters: JsonObject = { ...outer };
    let requestObject: ResolvedRequest['requestObject'];

    let jwt: string | undefined = outer.request;
    if (outer.request_uri !== undefined) {
      if (outer.request_uri_method !== undefined && outer.request_uri_method !== 'get') {
        throw new Oid4vpError(
          'REQUEST_INVALID',
          `request_uri_method ${outer.request_uri_method} is not supported`,
          {
            spec: 'OpenID4VP 1.0 section 5.10',
          },
        );
      }
      jwt = await this.fetchText(outer.request_uri, {
        headers: { accept: REQUEST_OBJECT_MEDIA_TYPE },
        ...(signal ? { signal } : {}),
      });
    }
    if (jwt !== undefined) {
      if (outerClientId === undefined) {
        throw new Oid4vpError('REQUEST_INVALID', 'client_id must be sent next to request or request_uri', {
          spec: 'RFC 9101 section 5; OpenID4VP 1.0 section 5.10',
        });
      }
      const client = parseClientId(outerClientId, outer.client_id_scheme);
      if (client.scheme !== 'did') {
        throw new Oid4vpError(
          'CLIENT_ID_UNSUPPORTED',
          `signed requests are only supported for DID client ids, not ${client.scheme}`,
          {
            details: { request: decodeRequestObject(jwt.trim()).header },
          },
        );
      }
      const decoded = await verifyDidSignedRequestObject(jwt.trim(), client.identifier, this.resolver);
      // RFC 9101 section 6.3 and OpenID4VP 1.0 section 5.10: the signed client_id must be the outer one.
      if (decoded.payload.client_id !== outerClientId) {
        throw new Oid4vpError(
          'CLIENT_ID_MISMATCH',
          'client_id in the request object differs from the one in the URI',
          {
            spec: 'RFC 9101 section 5; OpenID4VP 1.0 section 5.10',
            details: { uri: outerClientId, requestObject: decoded.payload.client_id },
          },
        );
      }
      parameters = { ...decoded.payload };
      requestObject = { jwt: jwt.trim(), header: decoded.header, payload: decoded.payload };
    }

    const clientId = stringParameter(parameters, 'client_id');
    const client = parseClientId(clientId, optionalString(parameters, 'client_id_scheme'));
    if (client.scheme === 'did' && requestObject === undefined) {
      throw new Oid4vpError('REQUEST_SIGNATURE_INVALID', 'a DID client id requires a signed request object', {
        spec: 'OpenID4VP 1.0 section 5.9.3 (decentralized_identifier)',
      });
    }
    const preRegistered =
      client.scheme === 'pre-registered'
        ? this.options.preRegisteredClients?.find((entry) => entry.clientId === clientId)
        : undefined;
    if (client.scheme !== 'did' && client.scheme !== 'redirect_uri' && !preRegistered) {
      throw new Oid4vpError(
        'CLIENT_ID_UNSUPPORTED',
        client.scheme === 'pre-registered'
          ? `client id ${clientId} is not a verifier this wallet knows (pre-registered clients must be configured)`
          : `client id scheme ${client.scheme} is not supported by the reference wallet`,
        {
          details: { clientId },
        },
      );
    }
    if (stringParameter(parameters, 'response_type') !== 'vp_token') {
      throw new Oid4vpError('REQUEST_INVALID', 'response_type must be vp_token', {
        spec: 'OpenID4VP 1.0 section 5.1',
      });
    }
    const responseMode = stringParameter(parameters, 'response_mode');
    if (responseMode !== 'direct_post') {
      throw new Oid4vpError(
        'REQUEST_INVALID',
        `response_mode ${responseMode} is not supported (direct_post only)`,
        {
          spec: 'OpenID4VP 1.0 section 8.2',
        },
      );
    }
    const responseUri = stringParameter(parameters, 'response_uri');
    // With redirect_uri, the response must go to the client id itself (section 5.9.3).
    if (client.scheme === 'redirect_uri' && responseUri !== client.identifier) {
      throw new Oid4vpError('CLIENT_ID_MISMATCH', 'response_uri must equal the redirect_uri client id', {
        spec: 'OpenID4VP 1.0 section 5.9.3 (redirect_uri)',
        details: { clientId, responseUri },
      });
    }
    // A pre-registered verifier may only send the response where its registration says.
    if (preRegistered && !preRegistered.responseUris.includes(responseUri)) {
      throw new Oid4vpError(
        'CLIENT_ID_MISMATCH',
        'response_uri is not registered for this pre-registered client',
        {
          spec: 'OpenID4VP 1.0 section 5.9.1 (pre-registered clients)',
          details: { clientId, responseUri },
        },
      );
    }
    const nonce = stringParameter(parameters, 'nonce');

    let presentationDefinition: PresentationDefinition | undefined;
    let dcqlQuery: JsonObject | undefined;
    const queries = ['presentation_definition', 'presentation_definition_uri', 'dcql_query'].filter(
      (name) => parameters[name] !== undefined,
    );
    if (queries.length !== 1) {
      throw new Oid4vpError(
        'REQUEST_INVALID',
        'exactly one of presentation_definition(_uri) and dcql_query is required',
        {
          spec: 'OpenID4VP 1.0 section 5.1; draft 23 section 5.1',
          details: { present: queries },
        },
      );
    }
    if (parameters.dcql_query !== undefined) {
      dcqlQuery = objectParameter('dcql_query', parameters.dcql_query, 'REQUEST_INVALID');
    } else {
      const raw =
        parameters.presentation_definition ??
        (JSON.parse(
          await this.fetchText(
            stringParameter(parameters, 'presentation_definition_uri'),
            signal ? { signal } : {},
          ),
        ) as unknown);
      presentationDefinition = parsePresentationDefinition(
        objectParameter('presentation_definition', raw, 'REQUEST_INVALID'),
      );
    }
    const state = optionalString(parameters, 'state');
    return {
      profile: dcqlQuery ? 'final-1.0' : 'inji-draft',
      uri,
      clientId,
      client,
      signed: requestObject !== undefined,
      ...(requestObject ? { requestObject } : {}),
      parameters,
      nonce,
      ...(state === undefined ? {} : { state }),
      responseUri,
      ...(presentationDefinition ? { presentationDefinition } : {}),
      ...(dcqlQuery ? { dcqlQuery } : {}),
    };
  }

  /** One held credential per input descriptor or credential query; throws when one has none. */
  selectCredentials(request: ResolvedRequest, credentials: StoredCredential[]): CredentialMatch[] {
    const views = credentials.map((credential) => {
      try {
        return credentialView(credential);
      } catch {
        return undefined;
      }
    });
    if (request.dcqlQuery) {
      const usable = views.flatMap((view, index) =>
        view ? [{ view, credential: credentials[index]! }] : [],
      );
      return matchDcqlQuery(
        parseDcqlQuery(request.dcqlQuery),
        usable.map((entry) => entry.view),
      ).map((selection) => {
        const chosen = usable[selection.credentialIndex]!;
        return {
          queryId: selection.queryId,
          credential: chosen.credential,
          view: chosen.view,
          requestedPaths: selection.requestedPaths,
        };
      });
    }
    const definition = request.presentationDefinition!;
    return definition.input_descriptors.map((descriptor) => {
      const reasons: string[] = [];
      for (const [index, view] of views.entries()) {
        if (!view) continue;
        const evaluation = evaluateInputDescriptor(descriptor, definition, view);
        if (evaluation.matched) {
          // Without limit_disclosure the verifier gets every disclosure the holder has.
          const limited = descriptor.constraints?.limit_disclosure === 'required';
          return {
            queryId: descriptor.id,
            credential: credentials[index]!,
            view,
            requestedPaths: limited ? evaluation.requestedPaths : [],
          };
        }
        reasons.push(`${credentials[index]!.id}: ${evaluation.reason ?? 'no match'}`);
      }
      throw new Oid4vpError(
        'NO_MATCHING_CREDENTIAL',
        `no held credential matches input descriptor ${descriptor.id}`,
        {
          spec: 'DIF Presentation Exchange 2.0 section 8',
          details: { reasons },
        },
      );
    });
  }

  /** Builds the presentations, `vp_token` and (drafts) `presentation_submission`. */
  async buildResponse(request: ResolvedRequest, matches: CredentialMatch[]): Promise<AuthorizationResponse> {
    // One mdoc generated nonce per response: every mdoc in it shares the SessionTranscript.
    const mdocGeneratedNonce =
      request.profile === 'inji-draft' && matches.some((match) => match.view.format === 'mso_mdoc')
        ? randomToken()
        : undefined;
    const presentations: { match: CredentialMatch; presentation: unknown }[] = [];
    for (const match of matches)
      presentations.push({ match, presentation: await this.present(request, match, mdocGeneratedNonce) });

    let vpToken: unknown;
    let presentationSubmission: PresentationSubmission | undefined;
    if (request.profile === 'final-1.0') {
      const grouped: Record<string, unknown[]> = {};
      for (const { match, presentation } of presentations) (grouped[match.queryId] ??= []).push(presentation);
      vpToken = grouped;
    } else {
      const single = presentations.length === 1;
      vpToken = single ? presentations[0]!.presentation : presentations.map((entry) => entry.presentation);
      presentationSubmission = {
        id: `submission-${request.nonce.slice(0, 8)}`,
        definition_id: request.presentationDefinition!.id,
        descriptor_map: presentations.map(({ match }, index) =>
          descriptorEntry(match, single ? '$' : `$[${index}]`),
        ),
      };
    }
    const form: Record<string, string> = { vp_token: encodeVpToken(vpToken) };
    if (presentationSubmission) form.presentation_submission = JSON.stringify(presentationSubmission);
    if (mdocGeneratedNonce !== undefined) form[MDOC_GENERATED_NONCE_PARAMETER] = mdocGeneratedNonce;
    if (request.state !== undefined) form.state = request.state;
    return {
      vpToken,
      formats: matches.map((match) => match.view.format),
      ...(mdocGeneratedNonce === undefined ? {} : { mdocGeneratedNonce }),
      ...(presentationSubmission ? { presentationSubmission } : {}),
      ...(request.state === undefined ? {} : { state: request.state }),
      form,
    };
  }

  /** Posts the response form-encoded to `response_uri` (`direct_post`). */
  async submit(
    request: ResolvedRequest,
    response: AuthorizationResponse,
    options: SubmitOptions = {},
  ): Promise<SubmissionResult> {
    const form = { ...response.form };
    const format = response.formats[0];
    if (options.beforeSubmit && form.vp_token !== undefined && format !== undefined) {
      form.vp_token = await options.beforeSubmit(form.vp_token, { format, request });
    }
    return this.post(request.responseUri, form, options.signal);
  }

  /** Answers with an error instead of a presentation, for example `access_denied` (section 8.5). */
  async decline(
    request: ResolvedRequest,
    error = 'access_denied',
    description?: string,
  ): Promise<SubmissionResult> {
    const form: Record<string, string> = { error };
    if (description) form.error_description = description;
    if (request.state !== undefined) form.state = request.state;
    return this.post(request.responseUri, form);
  }

  /** The whole wallet flow: resolve, select, present, submit. */
  async respond(
    uri: string,
    credentials: StoredCredential[],
    options: SubmitOptions = {},
  ): Promise<SubmissionResult & { request: ResolvedRequest; response: AuthorizationResponse }> {
    const request = await this.resolveRequest(uri, options.signal);
    const matches = this.selectCredentials(request, credentials);
    const response = await this.buildResponse(request, matches);
    const submission = await this.submit(request, response, options);
    return { ...submission, request, response };
  }

  private async present(
    request: ResolvedRequest,
    match: CredentialMatch,
    mdocGeneratedNonce: string | undefined,
  ): Promise<unknown> {
    if (match.view.format === 'mso_mdoc') {
      const holderKey = this.options.holder.keyPair;
      if (holderKey.alg !== 'ES256') {
        throw new Oid4vpError('HOLDER_KEY_MISMATCH', 'an mdoc is presented with its P-256 device key', {
          spec: 'ISO/IEC 18013-5 section 9.1.3.6',
        });
      }
      return presentMdoc({
        credential: match.credential.raw,
        disclose:
          match.requestedPaths.length > 0 ? match.requestedPaths.map((path) => mdocElementPath(path)) : 'all',
        deviceKey: holderKey,
        sessionTranscript: mdocTranscriptFor(request, mdocGeneratedNonce),
      });
    }
    if (isSdJwtVcFormat(match.view.format)) {
      return presentSdJwtVc({
        sdJwt: match.credential.raw,
        disclose: match.requestedPaths.length > 0 ? disclosureFrame(match.requestedPaths) : 'all',
        holderKey: this.options.holder.keyPair,
        // OpenID4VP 1.0 Appendix B.3.6: aud is the client_id as received, prefix included.
        audience: request.clientId,
        nonce: request.nonce,
      });
    }
    const holder = await this.holderFor(match.view.json);
    return createLdpVp({
      credentials: [match.view.json],
      holder: holder.did,
      suite: ldpSuiteFor(match.view.json, this.options.holder.keyPair.alg),
      key: { keyPair: this.options.holder.keyPair, verificationMethod: holder.verificationMethod },
      challenge: request.nonce,
      domain: request.clientId,
      documentLoader: this.options.documentLoader,
      // The reference wallet presents what it holds; judging the credential is the verifier's job.
      checkCredentials: false,
    });
  }

  /**
   * The holder DID to present: the credential subject's DID when it is one of the holder's key
   * (as written, so a padded did:jwk stays padded), otherwise the holder's own DID.
   */
  private async holderFor(credential: JsonObject): Promise<{ did: string; verificationMethod: string }> {
    const holder = this.options.holder;
    const subject = credential.credentialSubject;
    const bound =
      isRecord(subject) && typeof subject.id === 'string' && subject.id.startsWith('did:')
        ? subject.id
        : undefined;
    if (bound === undefined) {
      if (!holder.did || !holder.verificationMethod) {
        throw new Oid4vpError(
          'HOLDER_KEY_MISMATCH',
          'the credential names no holder DID and the wallet has none configured',
        );
      }
      return { did: holder.did, verificationMethod: holder.verificationMethod };
    }
    if (bound === holder.did && holder.verificationMethod)
      return { did: bound, verificationMethod: holder.verificationMethod };
    let resolvedJwk;
    try {
      resolvedJwk = (await this.resolver.resolveVerificationMethod(bound)).publicJwk;
    } catch (cause) {
      throw new Oid4vpError(
        'HOLDER_KEY_MISMATCH',
        `cannot resolve the credential's holder DID: ${errorMessage(cause)}`,
        { cause },
      );
    }
    const own = holder.keyPair.publicJwk;
    if (resolvedJwk.x !== own.x || resolvedJwk.y !== own.y) {
      throw new Oid4vpError(
        'HOLDER_KEY_MISMATCH',
        'the credential is bound to a key this wallet does not hold',
        {
          details: { credentialSubject: bound },
        },
      );
    }
    // Inji Certify 0.14.0 writes the proof's key id (`did:jwk:...#0`) as credentialSubject.id. The holder
    // is the DID; the key id, already a DID URL, is the verification method as it stands.
    const fragment = bound.indexOf('#');
    let did = fragment === -1 ? bound : bound.slice(0, fragment);
    if (did.startsWith('did:jwk:') && this.options.holderDidForm === 'canonical') did = createDidJwk(own);
    if (fragment !== -1 && this.options.holderDidForm !== 'canonical')
      return { did, verificationMethod: bound };
    if (did.startsWith('did:jwk:')) return { did, verificationMethod: `${did}#0` };
    if (did.startsWith('did:key:')) return { did, verificationMethod: didKeyVerificationMethodId(did) };
    if (holder.verificationMethod?.startsWith(`${did}#`))
      return { did, verificationMethod: holder.verificationMethod };
    throw new Oid4vpError('HOLDER_KEY_MISMATCH', `no verification method known for holder DID ${did}`);
  }

  private async fetchText(url: string, init: RequestInit): Promise<string> {
    let response: Response;
    try {
      response = await this.options.fetch(url, { method: 'GET', ...init });
    } catch (cause) {
      throw new Oid4vpError('HTTP_ERROR', `GET ${url} failed: ${errorMessage(cause)}`, { cause });
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Oid4vpError('HTTP_ERROR', `GET ${url} answered ${response.status}`, {
        details: { status: response.status, body: text.slice(0, 500) },
      });
    }
    return text;
  }

  private async post(
    url: string,
    form: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<SubmissionResult> {
    let response: Response;
    try {
      response = await this.options.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      throw new Oid4vpError('HTTP_ERROR', `POST ${url} failed: ${errorMessage(cause)}`, { cause });
    }
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // Not JSON: keep the text for the report.
    }
    const redirectUri =
      isRecord(body) && typeof body.redirect_uri === 'string' ? body.redirect_uri : undefined;
    return { status: response.status, body, ...(redirectUri ? { redirectUri } : {}), form };
  }
}

/** The SessionTranscript of the request's profile (see `mdocSessionTranscript`). */
export function mdocTranscriptFor(
  request: ResolvedRequest,
  mdocGeneratedNonce: string | undefined,
): unknown[] {
  if (request.profile === 'final-1.0') {
    return mdocSessionTranscript({
      kind: 'openid4vp-1.0',
      clientId: request.clientId,
      responseUri: request.responseUri,
      nonce: request.nonce,
      jwkThumbprint: null,
    });
  }
  if (mdocGeneratedNonce === undefined) {
    throw new Oid4vpError('REQUEST_INVALID', 'an Annex B SessionTranscript needs an mdoc generated nonce');
  }
  return mdocSessionTranscript({
    kind: 'iso-18013-7-annex-b',
    clientId: request.clientId,
    responseUri: request.responseUri,
    nonce: request.nonce,
    mdocGeneratedNonce,
  });
}

/** A requested claim path of an mdoc: exactly `[namespace, element]` (OpenID4VP 1.0 Appendix B.2.4). */
function mdocElementPath(path: string[]): [string, string] {
  if (path.length !== 2) {
    throw new Oid4vpError(
      'REQUEST_INVALID',
      `an mso_mdoc claim path has two segments, got ${JSON.stringify(path)}`,
      {
        spec: 'OpenID4VP 1.0 Appendix B.2.4',
      },
    );
  }
  return [path[0]!, path[1]!];
}

function descriptorEntry(match: CredentialMatch, path: string): DescriptorMapEntry {
  if (isSdJwtVcFormat(match.view.format) || match.view.format === 'mso_mdoc') {
    return { id: match.queryId, format: match.view.format, path };
  }
  // Inji Wallet's shape (LdpVPTokenBuilder.kt): the VP at `path`, the credential nested inside it.
  return {
    id: match.queryId,
    format: 'ldp_vp',
    path,
    path_nested: { id: match.queryId, format: 'ldp_vc', path: '$.verifiableCredential[0]' },
  };
}

/** Form encoding of `vp_token`: JSON for objects and arrays; a single SD-JWT as JSON string too. */
function encodeVpToken(vpToken: unknown): string {
  return JSON.stringify(vpToken);
}

/**
 * The holder proof suite: ecdsa-rdfc-2019 for a P-256 holder key (an issuer that takes no Ed25519 key
 * proof binds the credential to one); otherwise the Ed25519 suite that matches the credential's own proof.
 */
function ldpSuiteFor(credential: JsonObject, holderAlg: string): LdpProofSuite {
  if (holderAlg === 'ES256') return 'ecdsa-rdfc-2019';
  const proof = Array.isArray(credential.proof) ? (credential.proof[0] as unknown) : credential.proof;
  return isRecord(proof) && proof.type === 'DataIntegrityProof' ? 'eddsa-rdfc-2022' : 'Ed25519Signature2020';
}

/** A presentation frame selecting the requested claim paths (nested ones included). */
function disclosureFrame(paths: string[][]): PresentationFrame {
  const frame: Record<string, unknown> = {};
  for (const path of paths) {
    let node = frame;
    path.forEach((segment, index) => {
      if (index === path.length - 1) {
        node[segment] ??= true;
        return;
      }
      if (typeof node[segment] !== 'object') node[segment] = {};
      node = node[segment] as Record<string, unknown>;
    });
  }
  return frame as PresentationFrame;
}

function stringParameter(parameters: JsonObject, name: string): string {
  const value = parameters[name];
  if (typeof value !== 'string' || value === '') {
    throw new Oid4vpError('REQUEST_INVALID', `${name} is missing`, { spec: 'OpenID4VP 1.0 section 5.1' });
  }
  return value;
}

function optionalString(parameters: JsonObject, name: string): string | undefined {
  const value = parameters[name];
  return typeof value === 'string' ? value : undefined;
}
