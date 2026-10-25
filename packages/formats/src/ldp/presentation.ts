// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packages that compile these sources need the declarations too (vendor.d.ts)
/// <reference path="../vendor.d.ts" />
/**
 * Verifiable Presentations with a Data Integrity proof (format `ldp_vp`). The holder's proof carries
 * `challenge` (the verifier's nonce) and `domain` (the verifier's client_id), which bind it to one
 * request (VC Data Integrity 1.0 section 2.1; OpenID4VP 1.0 Appendix B.1.3.2.5 requires this mapping).
 */
import * as vc from '@digitalbazaar/vc';
import { FormatError, errorMessage } from '../errors.js';
import { parseDidUrl } from '../did/resolver.js';
import type { DocumentLoader } from '../jsonld/document-loader.js';
import { ED25519_2020_SUITE_URL } from '../jsonld/contexts.js';
import { isRecord } from '../util/encoding.js';
import {
  checkValidityPeriod,
  dataModelVersion,
  firstProof,
  issuerId,
  proofError,
  withContext,
  type JsonObject,
  type LdpVcVerification,
  type VerifyLdpOptions,
  LDP_STATUS_NOT_CHECKED,
} from './credential.js';
import {
  describeProof,
  signingSuite,
  verificationSuites,
  type LdpProofSuite,
  type LdpSigningKey,
} from './suites.js';

export interface CreateLdpVpOptions {
  credentials: JsonObject[];
  /** Holder DID; defaults to the DID of the signing key. */
  holder?: string;
  suite: LdpProofSuite;
  key: LdpSigningKey;
  challenge: string;
  domain?: string;
  documentLoader: DocumentLoader;
  /** Presentation data model. Default: the version of the first credential. */
  dataModel?: '1.1' | '2.0';
  created?: Date;
  /**
   * Default `true`: refuse credentials that are expired or malformed, as `@digitalbazaar/vc` does.
   * `false` wraps them unchecked, so a test wallet can present an expired credential and the
   * verifier under test is the one that has to reject it.
   */
  checkCredentials?: boolean;
}

export async function createLdpVp(options: CreateLdpVpOptions): Promise<JsonObject> {
  const first = options.credentials[0];
  const dataModel = options.dataModel ?? (first ? dataModelVersion(first) : '2.0');
  const verifiableCredential = options.credentials.map((credential) => structuredClone(credential));
  let presentation = vc.createPresentation({
    ...(options.checkCredentials === false ? {} : { verifiableCredential }),
    holder: options.holder ?? parseDidUrl(options.key.verificationMethod).did,
    version: dataModel === '1.1' ? 1.0 : 2.0,
  });
  if (options.checkCredentials === false) presentation = { ...presentation, verifiableCredential };
  if (options.suite === 'Ed25519Signature2020')
    presentation = withContext(presentation, ED25519_2020_SUITE_URL);
  const suite = await signingSuite(options.suite, options.key, options.created);
  try {
    return await vc.signPresentation({
      presentation,
      suite,
      documentLoader: options.documentLoader,
      challenge: options.challenge,
      ...(options.domain === undefined ? {} : { domain: options.domain }),
    });
  } catch (cause) {
    throw new FormatError('LDP_MALFORMED', `cannot sign presentation: ${errorMessage(cause)}`, { cause });
  }
}

export interface VerifyLdpVpOptions extends VerifyLdpOptions {
  /** The nonce the verifier sent; the proof's `challenge` must equal it. */
  expectedChallenge: string;
  /** The verifier's client_id; when given, the proof's `domain` must equal or contain it. */
  expectedDomain?: string;
}

export interface LdpVpVerification {
  holder: string | undefined;
  proofType: string;
  verificationMethod: string;
  credentials: LdpVcVerification[];
}

/**
 * Verifies a presentation: challenge and domain first (so a replay is reported as such, not as a bad
 * signature), then that the proof was made by the holder, then the presentation proof and every
 * embedded credential.
 */
export async function verifyLdpVp(
  presentation: unknown,
  options: VerifyLdpVpOptions,
): Promise<LdpVpVerification> {
  if (!isRecord(presentation)) throw new FormatError('LDP_MALFORMED', 'presentation is not a JSON object');
  const proof = firstProof(presentation);

  if (proof.challenge !== options.expectedChallenge) {
    throw new FormatError(
      'LDP_CHALLENGE_MISMATCH',
      'presentation proof challenge does not match the request nonce',
      {
        spec: 'OpenID4VP 1.0 Appendix B.1.3.2.5 (challenge = nonce); VC Data Integrity 1.0 section 2.1',
        details: { expected: options.expectedChallenge, received: proof.challenge },
      },
    );
  }
  if (options.expectedDomain !== undefined) {
    const domains: unknown[] = Array.isArray(proof.domain) ? (proof.domain as unknown[]) : [proof.domain];
    if (!domains.includes(options.expectedDomain)) {
      throw new FormatError('LDP_DOMAIN_MISMATCH', 'presentation proof domain does not match the verifier', {
        spec: 'OpenID4VP 1.0 Appendix B.1.3.2.5 (domain = client_id); VC Data Integrity 1.0 section 2.1',
        details: { expected: options.expectedDomain, received: proof.domain },
      });
    }
  }

  const verificationMethod = String(proof.verificationMethod);
  const holder = typeof presentation.holder === 'string' ? presentation.holder : undefined;
  if (holder !== undefined && parseDidUrl(verificationMethod).did !== holder) {
    // This is where a padded and an unpadded did:jwk of the same key disagree (inji/inji-certify#1054).
    throw new FormatError(
      'LDP_HOLDER_MISMATCH',
      'presentation was signed by a key that does not belong to the holder',
      {
        spec: 'VC Data Model 2.0 section 4.13 (holder) with VC Data Integrity 1.0 section 2.2 (authentication)',
        details: { holder, verificationMethod },
      },
    );
  }

  const now = options.now ?? new Date();
  const embedded = presentation.verifiableCredential;
  const credentials: unknown[] = Array.isArray(embedded)
    ? (embedded as unknown[])
    : embedded === undefined
      ? []
      : [embedded];
  // Expiry first, for the same reason as in verifyLdpVc.
  for (const credential of credentials) {
    if (isRecord(credential)) checkValidityPeriod(credential, now, options.clockSkewSeconds);
  }

  const warnings: string[] = [];
  const result = await vc.verify({
    presentation,
    suite: verificationSuites(),
    documentLoader: options.documentLoader,
    challenge: options.expectedChallenge,
    ...(options.expectedDomain === undefined ? {} : { domain: options.expectedDomain }),
    now,
    checkStatus: () => {
      warnings.push(LDP_STATUS_NOT_CHECKED);
      return Promise.resolve({ verified: true });
    },
  });
  if (!result.verified) {
    if (result.presentationResult && !result.presentationResult.verified)
      throw proofError('presentation', result.presentationResult);
    const failed = (result.credentialResults ?? []).findIndex((entry) => !entry.verified);
    if (failed >= 0) throw proofError(`credential ${failed}`, result.credentialResults![failed]!);
    throw proofError('presentation', result);
  }

  // Every embedded credential has been verified by the call above; this only describes them.
  const credentialReports = credentials.filter(isRecord).map((credential): LdpVcVerification => {
    const credentialProof = firstProof(credential);
    return {
      issuer: issuerId(credential),
      proofType: describeProof(credentialProof),
      verificationMethod: String(credentialProof.verificationMethod),
      dataModel: dataModelVersion(credential),
      warnings: credential.credentialStatus === undefined ? [] : [...new Set(warnings)],
    };
  });
  return { holder, proofType: describeProof(proof), verificationMethod, credentials: credentialReports };
}
