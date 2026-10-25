// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Finds the protocol objects inside a recorded exchange or artefact and decodes each one: credential
 * offers, proof JWTs, credentials (SD-JWT, JWT, Data Integrity / ldp, mdoc CBOR), authorization requests and request
 * objects, Presentation Exchange definitions, DCQL queries, vp_tokens, presentation submissions and
 * verification results.
 *
 * Recognition is by field name and content, not by which role sent the message, so payloads from Inji
 * modules, the reference roles and any third-party role are decoded the same way.
 */
import type { ArtifactKind, RecordedExchange, StepId } from '@inji-playground/protocol';
import {
  decodeJwt,
  decodeSdJwt,
  formatJson,
  isJsonObject,
  parseForm,
  tryParseJson,
  type DecodedJwt,
  type DecodedSdJwt,
  type JsonObject,
  type JsonValue,
} from './decode';
import { decodeMdoc, type DecodedMdoc } from './cbor';

export type SectionKind =
  | 'credential-offer'
  | 'authorization-request'
  | 'request-object'
  | 'presentation-definition'
  | 'dcql-query'
  | 'proof-jwt'
  | 'credential'
  | 'vp-token'
  | 'presentation-submission'
  | 'verification-result'
  | 'jwt';

/** How a section is decoded. `opaque` keeps text no decoder recognised. */
export type DecodedView =
  | { type: 'jwt'; jwt: DecodedJwt }
  | { type: 'sd-jwt'; sdJwt: DecodedSdJwt }
  | { type: 'cbor'; structure: DecodedMdoc['structure']; value: JsonValue }
  | { type: 'json'; value: JsonValue; proofs: JsonObject[] }
  | { type: 'params'; params: Array<[string, string]> }
  | { type: 'opaque' };

export type SectionSource = 'request' | 'response' | 'url' | 'artifact';

export interface DecodedSection {
  /** Unique within one exchange or artefact. */
  id: string;
  kind: SectionKind;
  source: SectionSource;
  /** Where the value was found, for example `body.vp_token` or `request-object.presentation_definition`. */
  path: string;
  /** The value exactly as sent. */
  raw: string;
  view: DecodedView;
}

interface Context {
  source: SectionSource;
  step?: StepId;
  sections: DecodedSection[];
}

function add(ctx: Context, kind: SectionKind, path: string, raw: string, view: DecodedView): void {
  const base = `${ctx.source}:${path}`;
  let id = base;
  for (let n = 2; ctx.sections.some((section) => section.id === id); n += 1) id = `${base}#${n}`;
  ctx.sections.push({ id, kind, source: ctx.source, path, raw, view });
}

/** Data Integrity / Linked Data proofs of a JSON-LD credential or presentation (VC Data Model, `proof`). */
function proofsOf(value: JsonValue): JsonObject[] {
  if (!isJsonObject(value)) return [];
  const proof = value.proof;
  if (isJsonObject(proof)) return [proof];
  if (Array.isArray(proof)) return proof.filter(isJsonObject);
  return [];
}

function jsonView(value: JsonValue): DecodedView {
  return { type: 'json', value, proofs: proofsOf(value) };
}

/** A string that may itself be JSON (form fields carry JSON as text) or a JSON value. */
function asJson(value: JsonValue): JsonValue {
  return typeof value === 'string' ? (tryParseJson(value) ?? value) : value;
}

function rawOf(value: JsonValue): string {
  return typeof value === 'string' ? value : formatJson(value);
}

/**
 * Decodes one credential: SD-JWT, JWT (jwt_vc_json), a JSON-LD credential with an embedded proof, or an
 * mdoc (base64url CBOR IssuerSigned or DeviceResponse).
 */
function addCredential(ctx: Context, kind: SectionKind, path: string, value: JsonValue): void {
  if (typeof value === 'string') {
    const sdJwt = decodeSdJwt(value);
    if (sdJwt) return add(ctx, kind, path, value, { type: 'sd-jwt', sdJwt });
    const jwt = decodeJwt(value);
    if (jwt) return add(ctx, kind, path, value, { type: 'jwt', jwt });
    const json = tryParseJson(value);
    if (json !== undefined) return addCredential(ctx, kind, path, json);
    const mdoc = decodeMdoc(value);
    if (mdoc)
      return add(ctx, kind, path, value, { type: 'cbor', structure: mdoc.structure, value: mdoc.value });
    return add(ctx, kind, path, value, { type: 'opaque' });
  }
  add(ctx, kind, path, rawOf(value), jsonView(value));
  // Credentials inside a JSON-LD presentation get their own section, so their proofs are visible too.
  if (isJsonObject(value)) {
    const inner = value.verifiableCredential;
    const list = Array.isArray(inner) ? inner : inner === undefined ? [] : [inner];
    list.forEach((credential, index) =>
      addCredential(ctx, 'credential', `${path}.verifiableCredential[${index}]`, credential),
    );
  }
}

/**
 * A vp_token is one presentation (string or JSON-LD object), an array of them (Presentation Exchange with
 * several descriptors), or in OpenID4VP 1.0 with DCQL an object keyed by credential query id whose values
 * are arrays of presentations.
 */
function addVpToken(ctx: Context, path: string, value: JsonValue): void {
  const parsed = asJson(value);
  if (Array.isArray(parsed)) {
    parsed.forEach((item, index) => addVpToken(ctx, `${path}[${index}]`, item));
    return;
  }
  if (isJsonObject(parsed) && !('@context' in parsed) && !('type' in parsed) && !('proof' in parsed)) {
    for (const [queryId, item] of Object.entries(parsed)) addVpToken(ctx, `${path}.${queryId}`, item);
    return;
  }
  addCredential(ctx, 'vp-token', path, parsed);
}

function addJwtField(ctx: Context, kind: SectionKind, path: string, value: JsonValue): boolean {
  if (typeof value !== 'string') return false;
  const jwt = decodeJwt(value);
  if (!jwt) return false;
  add(ctx, kind, path, value, { type: 'jwt', jwt });
  return true;
}

/** Inspects the payload of an OpenID4VP request object for the query it carries. */
function addRequestObjectContents(ctx: Context, path: string, payload: JsonValue): void {
  if (!isJsonObject(payload)) return;
  if (payload.presentation_definition !== undefined) {
    const value = asJson(payload.presentation_definition);
    add(ctx, 'presentation-definition', `${path}.presentation_definition`, rawOf(value), jsonView(value));
  }
  if (payload.dcql_query !== undefined) {
    const value = asJson(payload.dcql_query);
    add(ctx, 'dcql-query', `${path}.dcql_query`, rawOf(value), jsonView(value));
  }
}

function addRequestObject(ctx: Context, path: string, raw: string): boolean {
  const jwt = decodeJwt(raw);
  if (jwt) {
    add(ctx, 'request-object', path, raw, { type: 'jwt', jwt });
    addRequestObjectContents(ctx, 'request-object', jwt.payload);
    return true;
  }
  const json = tryParseJson(raw);
  if (isJsonObject(json)) {
    add(ctx, 'request-object', path, raw, jsonView(json));
    addRequestObjectContents(ctx, 'request-object', json);
    return true;
  }
  return false;
}

const AUTHZ_REQUEST_KEYS = [
  'request',
  'request_uri',
  'presentation_definition',
  'dcql_query',
  'response_uri',
];
const OFFER_KEYS = ['credential_offer', 'credential_offer_uri'];

/**
 * Query parameters of a URL (an `openid4vp://` authorization request, an `openid-credential-offer://`
 * offer, or an HTTPS URL with the same parameters). Undefined when it carries no protocol parameter.
 */
function protocolParams(url: string): { kind: SectionKind; params: Array<[string, string]> } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const params = [...parsed.searchParams.entries()];
  const keys = new Set(params.map(([key]) => key));
  if (OFFER_KEYS.some((key) => keys.has(key))) return { kind: 'credential-offer', params };
  if (parsed.protocol === 'openid4vp:' || AUTHZ_REQUEST_KEYS.some((key) => keys.has(key))) {
    return { kind: 'authorization-request', params };
  }
  return undefined;
}

function addProtocolUrl(ctx: Context, path: string, url: string): boolean {
  const found = protocolParams(url);
  if (!found) return false;
  add(ctx, found.kind, path, url, { type: 'params', params: found.params });
  addFields(ctx, path, Object.fromEntries(found.params));
  return true;
}

/** Field names whose values are decoded wherever they appear in a JSON body, form body or URL. */
function addFields(ctx: Context, path: string, fields: Record<string, JsonValue>): void {
  for (const [key, value] of Object.entries(fields)) {
    const at = `${path}.${key}`;
    switch (key) {
      case 'credential_offer': {
        const offer = asJson(value);
        add(ctx, 'credential-offer', at, rawOf(value), jsonView(offer));
        break;
      }
      case 'request':
        if (typeof value === 'string') addRequestObject(ctx, at, value);
        break;
      case 'presentation_definition': {
        const definition = asJson(value);
        add(ctx, 'presentation-definition', at, rawOf(value), jsonView(definition));
        break;
      }
      case 'dcql_query': {
        const query = asJson(value);
        add(ctx, 'dcql-query', at, rawOf(value), jsonView(query));
        break;
      }
      case 'vp_token':
        addVpToken(ctx, at, value);
        break;
      case 'presentation_submission': {
        const submission = asJson(value);
        add(ctx, 'presentation-submission', at, rawOf(value), jsonView(submission));
        break;
      }
      case 'credential':
        addCredential(ctx, 'credential', at, value);
        break;
      case 'credentials':
        // OpenID4VCI 1.0: `credentials: [{ credential }]`; draft 13 batch responses use the same name.
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            addCredential(
              ctx,
              'credential',
              `${at}[${index}]`,
              isJsonObject(item) && item.credential !== undefined ? item.credential : item,
            ),
          );
        }
        break;
      case 'proof':
        if (isJsonObject(value)) addJwtField(ctx, 'proof-jwt', `${at}.jwt`, value.jwt ?? null);
        break;
      case 'proofs':
        if (isJsonObject(value) && Array.isArray(value.jwt)) {
          value.jwt.forEach((jwt, index) => addJwtField(ctx, 'proof-jwt', `${at}.jwt[${index}]`, jwt));
        }
        break;
      case 'id_token':
      case 'access_token':
      case 'response':
        addJwtField(ctx, 'jwt', at, value);
        break;
      case 'request_uri':
      case 'credential_offer_uri':
      case 'redirect_uri':
      case 'qrCodeData':
      case 'url':
        if (typeof value === 'string' && !/^https?:/i.test(value)) addProtocolUrl(ctx, at, value);
        else if (typeof value === 'string') addProtocolUrlIfOffer(ctx, at, value);
        break;
      default:
        break;
    }
  }
}

/** HTTPS URLs are only decoded when they embed a protocol message, never just because they are URLs. */
function addProtocolUrlIfOffer(ctx: Context, path: string, url: string): void {
  const found = protocolParams(url);
  if (found && found.params.some(([key]) => OFFER_KEYS.includes(key) || key === 'request')) {
    addProtocolUrl(ctx, path, url);
  }
}

/**
 * Verification results have no standard shape. Recognised: the playground's own result
 * (`outcome` + `checks`), Inji Verify's `vp-results` (`vpResultStatus`, `vcResults`) and results that
 * say `verificationStatus` or `verified`.
 */
function isVerificationResult(value: JsonValue, step: StepId | undefined): boolean {
  if (!isJsonObject(value)) return false;
  if (step === 'verifier.result') return true;
  return ['vpResultStatus', 'vcResults', 'verificationStatus', 'verified'].some((key) => key in value);
}

function contentTypeOf(headers: Record<string, string>): string {
  return (headers['content-type'] ?? '').toLowerCase();
}

function analyseBody(ctx: Context, body: string | undefined, contentType: string): void {
  if (body === undefined || body.length === 0) return;
  const text = body.trim();

  if (contentType.includes('oauth-authz-req+jwt') || ctx.step === 'wallet.fetch-request') {
    if (addRequestObject(ctx, 'body', text)) return;
  }

  const json = tryParseJson(text);
  if (json !== undefined) {
    if (isVerificationResult(json, ctx.step)) {
      add(ctx, 'verification-result', 'body', text, jsonView(json));
      return;
    }
    if (isJsonObject(json)) addFields(ctx, 'body', json);
    else if (typeof json === 'string') analyseBody(ctx, json, contentType);
    return;
  }

  const form = contentType.includes('x-www-form-urlencoded') || !contentType ? parseForm(text) : undefined;
  if (form && form.length > 0) {
    addFields(ctx, 'body', Object.fromEntries(form));
    return;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && addProtocolUrl(ctx, 'body', text)) return;

  const sdJwt = decodeSdJwt(text);
  if (sdJwt) {
    const kind: SectionKind = sdJwt.hasKeyBinding ? 'vp-token' : 'credential';
    add(ctx, kind, 'body', text, { type: 'sd-jwt', sdJwt });
    return;
  }
  const jwt = decodeJwt(text);
  if (jwt) {
    const payload = jwt.payload;
    if (isJsonObject(payload) && ('presentation_definition' in payload || 'dcql_query' in payload)) {
      addRequestObject(ctx, 'body', text);
    } else {
      add(ctx, 'jwt', 'body', text, { type: 'jwt', jwt });
    }
  }
}

/** Every decodable protocol object in one exchange: URL parameters first, then request, then response. */
export function analyseExchange(exchange: RecordedExchange): DecodedSection[] {
  const sections: DecodedSection[] = [];
  const step = exchange.step;
  const urlCtx: Context = { source: 'url', sections, ...(step ? { step } : {}) };
  addProtocolUrlIfParams(urlCtx, exchange.request.url);

  if (exchange.request.bodyEncoding !== 'base64') {
    // A request body is never the verification result, so the result step is not passed on.
    const requestStep = step === 'verifier.result' ? undefined : step;
    const requestCtx: Context = {
      source: 'request',
      sections,
      ...(requestStep ? { step: requestStep } : {}),
    };
    analyseBody(requestCtx, exchange.request.body, contentTypeOf(exchange.request.headers));
  }
  if (exchange.response && exchange.response.bodyEncoding !== 'base64') {
    const responseCtx: Context = { source: 'response', sections, ...(step ? { step } : {}) };
    analyseBody(responseCtx, exchange.response.body, contentTypeOf(exchange.response.headers));
  }
  return sections;
}

function addProtocolUrlIfParams(ctx: Context, url: string): void {
  const found = protocolParams(url);
  if (found) addProtocolUrl(ctx, 'url', url);
}

const ARTIFACT_SECTION: Record<ArtifactKind, SectionKind> = {
  offer: 'credential-offer',
  credential: 'credential',
  'request-object': 'request-object',
  'vp-token': 'vp-token',
  result: 'verification-result',
};

/** Decodes an artefact event (the offer, credential, request object, vp_token or result of a run). */
export function analyseArtifact(kind: ArtifactKind, raw: string): DecodedSection[] {
  const sections: DecodedSection[] = [];
  const ctx: Context = { source: 'artifact', sections };
  switch (kind) {
    case 'offer': {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) && addProtocolUrl(ctx, kind, raw.trim())) break;
      const json = tryParseJson(raw);
      add(ctx, 'credential-offer', kind, raw, json === undefined ? { type: 'opaque' } : jsonView(json));
      break;
    }
    case 'credential':
      addCredential(ctx, 'credential', kind, raw);
      break;
    case 'request-object':
      if (!addRequestObject(ctx, kind, raw)) add(ctx, 'request-object', kind, raw, { type: 'opaque' });
      break;
    case 'vp-token':
      addVpToken(ctx, kind, raw);
      break;
    case 'result': {
      const json = tryParseJson(raw);
      add(ctx, ARTIFACT_SECTION[kind], kind, raw, json === undefined ? { type: 'opaque' } : jsonView(json));
      break;
    }
  }
  return sections;
}
