// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Digital Credentials Query Language (OpenID4VP 1.0 section 6) through the `dcql` library, used by
 * both sides: the verifier builds and later checks a query, the wallet matches its credentials.
 */
import { DcqlPresentationResult, DcqlQuery, type DcqlCredential } from 'dcql';
import { errorMessage } from '@inji-playground/formats';
import { isSdJwtVcFormat, type PresentableFormat } from '../common/constants.js';
import { Oid4vpError } from '../common/errors.js';
import type { CredentialView } from './credential-view.js';
import { mdocClaimPath, type QuerySpec } from './presentation-exchange.js';

/** Query id the reference verifier uses for its single credential query. */
export const DEFAULT_CREDENTIAL_QUERY_ID = 'credential';

export type DcqlQueryJson = DcqlQuery.Input;

/** A DCQL query asking for one credential of `format`. */
export function buildDcqlQuery(format: PresentableFormat, spec: QuerySpec = {}): DcqlQueryJson {
  // mso_mdoc claims are [namespace, element] (OpenID4VP 1.0 Appendix B.2.4), with the mdoc-specific
  // intent_to_retain.
  const claims = (spec.claims ?? []).map((claim) =>
    format === 'mso_mdoc'
      ? { path: [...mdocClaimPath(claim)], intent_to_retain: false }
      : { path: claim.split('.') },
  );
  let meta: Record<string, unknown> | undefined;
  if (format === 'ldp_vc')
    meta = { type_values: [['VerifiableCredential', ...(spec.type ? [spec.type] : [])]] };
  else if (format === 'mso_mdoc') meta = spec.type ? { doctype_value: spec.type } : undefined;
  else meta = spec.type ? { vct_values: [spec.type] } : undefined;
  const query = {
    credentials: [
      {
        id: DEFAULT_CREDENTIAL_QUERY_ID,
        format,
        ...(meta ? { meta } : {}),
        ...(claims.length > 0 ? { claims } : {}),
      },
    ],
  } as DcqlQueryJson;
  parseDcqlQuery(query); // fail here, not in the wallet, if the builder ever produces an invalid query
  return query;
}

/** Parses and validates a received `dcql_query` (section 6.4 rules, through the library). */
export function parseDcqlQuery(value: unknown): DcqlQuery {
  try {
    const query = DcqlQuery.parse(value as DcqlQueryJson);
    DcqlQuery.validate(query);
    return query;
  } catch (cause) {
    throw new Oid4vpError('REQUEST_INVALID', `dcql_query is not valid: ${errorMessage(cause)}`, {
      cause,
      spec: 'OpenID4VP 1.0 section 6',
    });
  }
}

/** The library's view of a credential: format, type, vct or doctype, and claims. */
export function toDcqlCredential(view: CredentialView): DcqlCredential {
  if (view.format === 'mso_mdoc') {
    return {
      credential_format: 'mso_mdoc',
      doctype: view.doctype ?? '',
      namespaces: view.json,
      cryptographic_holder_binding: true,
    } as DcqlCredential;
  }
  if (isSdJwtVcFormat(view.format)) {
    return {
      credential_format: view.format,
      vct: view.vct ?? '',
      claims: view.json,
      cryptographic_holder_binding: true,
    } as DcqlCredential;
  }
  return {
    credential_format: 'ldp_vc',
    type: view.types,
    claims: view.json,
    cryptographic_holder_binding: true,
  } as DcqlCredential;
}

export interface DcqlSelection {
  queryId: string;
  /** Index into the credential list given to `matchDcqlQuery`. */
  credentialIndex: number;
  /** Claim paths the query reads, for selective disclosure (empty: no claims named). */
  requestedPaths: string[][];
}

/** Picks one credential per credential query; throws when the query cannot be satisfied. */
export function matchDcqlQuery(query: DcqlQuery, views: CredentialView[]): DcqlSelection[] {
  const result = DcqlQuery.query(query, views.map(toDcqlCredential));
  if (!result.can_be_satisfied) {
    throw new Oid4vpError('NO_MATCHING_CREDENTIAL', 'no held credential satisfies the dcql_query', {
      spec: 'OpenID4VP 1.0 section 6.4.2',
      details: { queries: query.credentials.map((credential) => credential.id) },
    });
  }
  return query.credentials.flatMap((credentialQuery): DcqlSelection[] => {
    const match = result.credential_matches[credentialQuery.id];
    const first = match?.success ? match.valid_credentials[0] : undefined;
    if (!first) return [];
    const claims = 'claims' in credentialQuery ? (credentialQuery.claims ?? []) : [];
    const requestedPaths = claims.flatMap((claim) =>
      'path' in claim ? [claim.path.map((segment) => String(segment))] : [],
    );
    return [{ queryId: credentialQuery.id, credentialIndex: first.input_credential_index, requestedPaths }];
  });
}

/**
 * Verifier side: do the verified presentations, grouped by credential query id, satisfy the query?
 * Returns the reason when they do not.
 */
export function checkDcqlPresentation(
  query: DcqlQuery,
  presented: Record<string, CredentialView[]>,
): { satisfied: boolean; reason?: string } {
  const input = Object.fromEntries(
    Object.entries(presented).map(([id, views]) => [id, views.map(toDcqlCredential)]),
  ) as Parameters<typeof DcqlPresentationResult.fromDcqlPresentation>[0];
  try {
    const result = DcqlPresentationResult.fromDcqlPresentation(input, { dcqlQuery: query });
    if (result.can_be_satisfied) return { satisfied: true };
    const failed = Object.entries(result.credential_matches)
      .filter(([, match]) => !match.success)
      .map(([id]) => id);
    return {
      satisfied: false,
      reason: `credential queries not satisfied: ${failed.join(', ') || 'unknown'}`,
    };
  } catch (cause) {
    return { satisfied: false, reason: errorMessage(cause) };
  }
}
