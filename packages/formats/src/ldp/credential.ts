// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packages that compile these sources need the declarations too (vendor.d.ts)
/// <reference path="../vendor.d.ts" />
/**
 * W3C Verifiable Credentials secured with Data Integrity proofs (format `ldp_vc`):
 * VC Data Model 1.1 with Ed25519Signature2020, and VC Data Model 2.0 with eddsa-rdfc-2022.
 */
import * as vc from '@digitalbazaar/vc';
import { FormatError, errorMessage } from '../errors.js';
import type { DocumentLoader } from '../jsonld/document-loader.js';
import { CREDENTIALS_V1_URL, CREDENTIALS_V2_URL, ED25519_2020_SUITE_URL } from '../jsonld/contexts.js';
import { isRecord } from '../util/encoding.js';
import {
  describeProof,
  signingSuite,
  verificationSuites,
  type LdpProofSuite,
  type LdpSigningKey,
} from './suites.js';

export type JsonObject = Record<string, unknown>;

export type VcDataModelVersion = '1.1' | '2.0';

/** VC 1.1 starts its `@context` with credentials/v1, VC 2.0 with credentials/v2 (VC 2.0 section 4.3). */
export function dataModelVersion(document: JsonObject): VcDataModelVersion {
  const context = document['@context'];
  const first = Array.isArray(context) ? (context[0] as unknown) : context;
  if (first === CREDENTIALS_V1_URL) return '1.1';
  if (first === CREDENTIALS_V2_URL) return '2.0';
  throw new FormatError(
    'LDP_MALFORMED',
    `first @context entry must be ${CREDENTIALS_V1_URL} or ${CREDENTIALS_V2_URL}`,
    {
      spec: 'VC Data Model 1.1 section 4.1 / 2.0 section 4.3 (Contexts)',
      details: { first },
    },
  );
}

export function withContext(document: JsonObject, url: string): JsonObject {
  const context = document['@context'];
  const list: unknown[] = Array.isArray(context) ? [...(context as unknown[])] : [context];
  return list.includes(url) ? { ...document } : { ...document, '@context': [...list, url] };
}

/** First proof of a secured document; proof sets with several proofs are not produced by any role here. */
export function firstProof(document: JsonObject): JsonObject {
  const proof = Array.isArray(document.proof) ? (document.proof as unknown[])[0] : document.proof;
  if (!isRecord(proof)) throw new FormatError('LDP_MALFORMED', 'document has no proof object');
  return proof;
}

function dateClaim(credential: JsonObject, name: string): Date | undefined {
  const value = credential[name];
  if (value === undefined) return undefined;
  const date = typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime()))
    throw new FormatError('LDP_MALFORMED', `${name} is not an XML Schema dateTime`);
  return date;
}

/**
 * Validity window: VC 1.1 `issuanceDate`/`expirationDate` (sections 4.6 and 4.8), VC 2.0
 * `validFrom`/`validUntil` (section 4.9). Checked before the proof so an expired credential is reported
 * as expired (outcome EXPIRED) rather than as a generic verification failure.
 */
export function checkValidityPeriod(credential: JsonObject, now: Date, clockSkewSeconds = 0): void {
  const version = dataModelVersion(credential);
  const [fromName, untilName, spec] =
    version === '1.1'
      ? (['issuanceDate', 'expirationDate', 'VC Data Model 1.1 section 4.8 (Expiration)'] as const)
      : (['validFrom', 'validUntil', 'VC Data Model 2.0 section 4.9 (Validity Period)'] as const);
  const skew = clockSkewSeconds * 1000;
  const until = dateClaim(credential, untilName);
  if (until && now.getTime() - skew > until.getTime()) {
    throw new FormatError('LDP_EXPIRED', `credential expired at ${until.toISOString()}`, {
      spec,
      details: { [untilName]: credential[untilName], now: now.toISOString() },
    });
  }
  const from = dateClaim(credential, fromName);
  if (from && now.getTime() + skew < from.getTime()) {
    throw new FormatError('LDP_NOT_YET_VALID', `credential is not valid before ${from.toISOString()}`, {
      spec,
      details: { [fromName]: credential[fromName], now: now.toISOString() },
    });
  }
}

export interface IssueLdpVcOptions {
  /** Unsigned credential; `issuer` must be the DID of the signing key. */
  credential: JsonObject;
  suite: LdpProofSuite;
  key: LdpSigningKey;
  documentLoader: DocumentLoader;
  /** Proof creation time. Default: now. */
  created?: Date;
}

/** Signs a credential. Ed25519Signature2020 is used with VC 1.1, eddsa-rdfc-2022 with VC 2.0. */
export async function issueLdpVc(options: IssueLdpVcOptions): Promise<JsonObject> {
  const version = dataModelVersion(options.credential);
  if (options.suite === 'eddsa-rdfc-2022' && version !== '2.0') {
    throw new FormatError(
      'LDP_MALFORMED',
      'eddsa-rdfc-2022 is issued with VC Data Model 2.0 only in this playground',
    );
  }
  // Ed25519Signature2020 terms (proofValue, Ed25519Signature2020) are defined only in its own context.
  const credential =
    options.suite === 'Ed25519Signature2020'
      ? withContext(structuredClone(options.credential), ED25519_2020_SUITE_URL)
      : structuredClone(options.credential);
  const suite = await signingSuite(options.suite, options.key, options.created);
  try {
    return await vc.issue({ credential, suite, documentLoader: options.documentLoader });
  } catch (cause) {
    if (cause instanceof FormatError) throw cause;
    throw new FormatError('LDP_MALFORMED', `cannot sign credential: ${errorMessage(cause)}`, { cause });
  }
}

export interface VerifyLdpOptions {
  documentLoader: DocumentLoader;
  /** Verification time. Default: now. */
  now?: Date;
  /** Tolerance for clock differences between roles, in seconds. Default 0. */
  clockSkewSeconds?: number;
}

export interface LdpVcVerification {
  issuer: string;
  /** For reports: `Ed25519Signature2020` or `DataIntegrityProof/eddsa-rdfc-2022`. */
  proofType: string;
  verificationMethod: string;
  dataModel: VcDataModelVersion;
  /** Checks that were skipped, for example `credentialStatus` (status lists are not fetched). */
  warnings: string[];
}

export function issuerId(credential: JsonObject): string {
  const issuer = credential.issuer;
  if (typeof issuer === 'string') return issuer;
  if (isRecord(issuer) && typeof issuer.id === 'string') return issuer.id;
  throw new FormatError('LDP_MALFORMED', 'credential has no issuer id', {
    spec: 'VC Data Model 1.1 section 4.5 (Issuer)',
  });
}

/** The warning for a credential whose `credentialStatus` this package saw but did not check. */
export const LDP_STATUS_NOT_CHECKED = 'credentialStatus present but not checked here';

/** Verifies the proof and validity period of one credential. Rejects with a FormatError. */
export async function verifyLdpVc(
  credential: unknown,
  options: VerifyLdpOptions,
): Promise<LdpVcVerification> {
  if (!isRecord(credential)) throw new FormatError('LDP_MALFORMED', 'credential is not a JSON object');
  const dataModel = dataModelVersion(credential);
  const proof = firstProof(credential);
  const now = options.now ?? new Date();
  checkValidityPeriod(credential, now, options.clockSkewSeconds);
  const warnings: string[] = [];
  const result = await vc.verifyCredential({
    credential,
    suite: verificationSuites(),
    documentLoader: options.documentLoader,
    now,
    checkStatus: () => {
      warnings.push(LDP_STATUS_NOT_CHECKED);
      return Promise.resolve({ verified: true });
    },
  });
  if (!result.verified) throw proofError('credential', result);
  return {
    issuer: issuerId(credential),
    proofType: describeProof(proof),
    verificationMethod: String(proof.verificationMethod),
    dataModel,
    warnings,
  };
}

/** Collects the nested error messages of a failed verification into one FormatError. */
export function proofError(what: string, result: vc.VerifyResult): FormatError {
  const messages = new Set<string>();
  const collect = (error: (Error & { errors?: Error[] }) | undefined): void => {
    if (!error) return;
    if (error.errors && error.errors.length > 0) error.errors.forEach((inner) => collect(inner));
    else messages.add(error.message);
  };
  collect(result.error);
  for (const entry of result.results ?? []) collect(entry.error);
  return new FormatError(
    'LDP_PROOF_INVALID',
    `${what} proof did not verify: ${[...messages].join('; ') || 'no detail'}`,
    {
      spec: 'VC Data Integrity 1.0 section 4.4 (Verify Proof)',
      details: { errors: [...messages] },
    },
  );
}
