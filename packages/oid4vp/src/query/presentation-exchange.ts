/**
 * The subset of DIF Presentation Exchange 2.0 that Inji Verify and Inji Wallet use with OpenID4VP
 * drafts: `input_descriptors[].format`, `constraints.fields[].path` (JSONPath) with an optional
 * JSON Schema `filter`, `constraints.limit_disclosure`, and `presentation_submission` with
 * `descriptor_map[].path` / `path_nested`. `submission_requirements` are not supported: every input
 * descriptor must be answered.
 *
 * Written here instead of taking a PE library so both the verifier and the wallet use one small
 * evaluator whose behaviour the tests pin down.
 */
import { JSONPath } from 'jsonpath-plus';
import { isRecord, type JsonObject } from '@inji-playground/formats';
import {
  isSdJwtVcFormat,
  LDP_PROOF_TYPES,
  SUPPORTED_JWS_ALGORITHMS,
  type PresentableFormat,
} from '../common/constants.js';
import { Oid4vpError } from '../common/errors.js';
import { randomToken } from '../common/util.js';
import type { CredentialView } from './credential-view.js';

export interface JsonSchemaFilter {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  contains?: JsonSchemaFilter;
  [keyword: string]: unknown;
}

export interface FieldConstraint {
  id?: string;
  name?: string;
  purpose?: string;
  path: string[];
  filter?: JsonSchemaFilter;
  optional?: boolean;
}

export interface InputDescriptor {
  id: string;
  name?: string;
  purpose?: string;
  format?: Record<string, unknown>;
  constraints?: { limit_disclosure?: 'required' | 'preferred'; fields?: FieldConstraint[] };
}

export interface PresentationDefinition {
  id: string;
  name?: string;
  purpose?: string;
  format?: Record<string, unknown>;
  input_descriptors: InputDescriptor[];
}

export interface DescriptorMapEntry {
  id: string;
  format: string;
  path: string;
  path_nested?: DescriptorMapEntry;
}

export interface PresentationSubmission {
  id: string;
  definition_id: string;
  descriptor_map: DescriptorMapEntry[];
}

export interface QuerySpec {
  /** W3C credential type for `ldp_vc`, `vct` for SD-JWT VC. Missing: any credential of the format. */
  type?: string;
  /** Claims to ask for, as dot-separated paths (`credentialSubject.fullName`, `given_name`). */
  claims?: string[];
}

/** A presentation definition asking for one credential of `format`. */
export function buildPresentationDefinition(
  format: PresentableFormat,
  spec: QuerySpec = {},
): PresentationDefinition {
  const fields: FieldConstraint[] = [];
  if (format === 'ldp_vc') {
    fields.push({
      path: ['$.type'],
      filter: { type: 'array', contains: { const: spec.type ?? 'VerifiableCredential' } },
    });
  } else if (spec.type !== undefined) {
    fields.push({ path: ['$.vct'], filter: { type: 'string', const: spec.type } });
  }
  for (const claim of spec.claims ?? []) fields.push({ path: [`$.${claim}`] });
  const formatMetadata =
    format === 'ldp_vc'
      ? { ldp_vc: { proof_type: [...LDP_PROOF_TYPES] } }
      : {
          [format]: {
            'sd-jwt_alg_values': [...SUPPORTED_JWS_ALGORITHMS],
            'kb-jwt_alg_values': [...SUPPORTED_JWS_ALGORITHMS],
          },
        };
  return {
    id: `pd-${randomToken(8)}`,
    purpose: 'Interoperability playground reference verifier',
    format: formatMetadata,
    input_descriptors: [
      {
        id: 'credential',
        format: formatMetadata,
        constraints: {
          ...(isSdJwtVcFormat(format) && spec.claims?.length
            ? { limit_disclosure: 'required' as const }
            : {}),
          fields,
        },
      },
    ],
  };
}

/** Validates the shape of a presentation definition received from a verifier. */
export function parsePresentationDefinition(value: unknown): PresentationDefinition {
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.input_descriptors)) {
    throw new Oid4vpError('REQUEST_INVALID', 'presentation_definition needs id and input_descriptors', {
      spec: 'DIF Presentation Exchange 2.0 section 5',
    });
  }
  if (value.submission_requirements !== undefined) {
    throw new Oid4vpError(
      'REQUEST_INVALID',
      'submission_requirements are not supported by the reference wallet',
    );
  }
  for (const descriptor of value.input_descriptors as unknown[]) {
    if (!isRecord(descriptor) || typeof descriptor.id !== 'string') {
      throw new Oid4vpError('REQUEST_INVALID', 'every input descriptor needs an id');
    }
  }
  return value as unknown as PresentationDefinition;
}

export interface DescriptorEvaluation {
  matched: boolean;
  /** Why the credential does not match, for the inspector. */
  reason?: string;
  /** Claim paths the descriptor reads, as segments (for selective disclosure). */
  requestedPaths: string[][];
}

/** Does this credential satisfy the input descriptor (format, then every non-optional field)? */
export function evaluateInputDescriptor(
  descriptor: InputDescriptor,
  definition: PresentationDefinition,
  view: CredentialView,
): DescriptorEvaluation {
  const requestedPaths: string[][] = [];
  const formats = descriptor.format ?? definition.format;
  if (formats !== undefined && !formatAccepted(formats, view.format)) {
    return { matched: false, reason: `format ${view.format} not requested`, requestedPaths };
  }
  for (const field of descriptor.constraints?.fields ?? []) {
    const match = evaluateField(field, view.json);
    if (match.segments) requestedPaths.push(match.segments);
    if (!match.matched && field.optional !== true) {
      return {
        matched: false,
        reason: `no value at ${field.path.join(' | ')} passes the filter`,
        requestedPaths,
      };
    }
  }
  return { matched: true, requestedPaths };
}

function formatAccepted(formats: Record<string, unknown>, format: PresentableFormat): boolean {
  if (format === 'ldp_vc') return 'ldp_vc' in formats || 'ldp_vp' in formats || 'ldp' in formats;
  // Wallets and verifiers mix the old and new SD-JWT VC names; both mean the same credential.
  return 'vc+sd-jwt' in formats || 'dc+sd-jwt' in formats;
}

function evaluateField(field: FieldConstraint, json: JsonObject): { matched: boolean; segments?: string[] } {
  for (const path of field.path) {
    const results = JSONPath({ path, json, resultType: 'all', wrap: true }) as {
      value: unknown;
      path: string;
    }[];
    for (const result of results) {
      if (field.filter === undefined || matchesFilter(result.value, field.filter)) {
        return { matched: true, segments: pathSegments(result.path) };
      }
    }
  }
  return { matched: false };
}

/** `$['credentialSubject']['fullName']` (JSONPath's normalised form) as segments. */
function pathSegments(normalised: string): string[] {
  return [...normalised.matchAll(/\['((?:[^'\\]|\\.)*)'\]|\[(\d+)\]/g)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
}

/** JSON Schema keywords used in PE filters. Unknown keywords are ignored, as JSON Schema does. */
export function matchesFilter(value: unknown, filter: JsonSchemaFilter): boolean {
  if (filter.type !== undefined && !matchesType(value, filter.type)) return false;
  if ('const' in filter && JSON.stringify(value) !== JSON.stringify(filter.const)) return false;
  if (
    filter.enum !== undefined &&
    !filter.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))
  )
    return false;
  if (
    filter.pattern !== undefined &&
    (typeof value !== 'string' || !new RegExp(filter.pattern, 'u').test(value))
  )
    return false;
  if (filter.minimum !== undefined && (typeof value !== 'number' || value < filter.minimum)) return false;
  if (filter.maximum !== undefined && (typeof value !== 'number' || value > filter.maximum)) return false;
  if (filter.contains !== undefined) {
    const contains = filter.contains;
    if (!Array.isArray(value) || !value.some((entry) => matchesFilter(entry, contains))) return false;
  }
  return true;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isRecord(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/** Validates a `presentation_submission` against the definition it claims to answer. */
export function parsePresentationSubmission(
  value: unknown,
  definition: PresentationDefinition,
): PresentationSubmission {
  const spec = 'DIF Presentation Exchange 2.0 section 6; OpenID4VP draft 21 section 6.1';
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.descriptor_map)) {
    throw new Oid4vpError('SUBMISSION_INVALID', 'presentation_submission needs id and descriptor_map', {
      spec,
    });
  }
  if (value.definition_id !== definition.id) {
    throw new Oid4vpError(
      'SUBMISSION_INVALID',
      'presentation_submission answers another presentation definition',
      {
        spec,
        details: { expected: definition.id, received: value.definition_id },
      },
    );
  }
  const entries = value.descriptor_map as unknown[];
  for (const entry of entries) checkDescriptorEntry(entry, spec);
  const answered = new Set((entries as DescriptorMapEntry[]).map((entry) => entry.id));
  const missing = definition.input_descriptors.filter((descriptor) => !answered.has(descriptor.id));
  if (missing.length > 0) {
    throw new Oid4vpError(
      'SUBMISSION_INVALID',
      'presentation_submission leaves input descriptors unanswered',
      {
        spec,
        details: { missing: missing.map((descriptor) => descriptor.id) },
      },
    );
  }
  return value as unknown as PresentationSubmission;
}

function checkDescriptorEntry(entry: unknown, spec: string): void {
  if (
    !isRecord(entry) ||
    typeof entry.id !== 'string' ||
    typeof entry.format !== 'string' ||
    typeof entry.path !== 'string'
  ) {
    throw new Oid4vpError('SUBMISSION_INVALID', 'every descriptor_map entry needs id, format and path', {
      spec,
    });
  }
  if (entry.path_nested !== undefined) checkDescriptorEntry(entry.path_nested, spec);
}

/** The single value a descriptor map `path` points to. */
export function resolveSubmissionPath(path: string, json: unknown): unknown {
  // A single SD-JWT vp_token is a plain string, which JSONPath does not evaluate.
  if (path === '$') return json;
  const results = JSONPath({ path, json: json as JsonObject, wrap: true }) as unknown[];
  if (results.length !== 1) {
    throw new Oid4vpError('SUBMISSION_INVALID', `descriptor_map path ${path} must select exactly one value`, {
      details: { matches: results.length },
    });
  }
  return results[0];
}
