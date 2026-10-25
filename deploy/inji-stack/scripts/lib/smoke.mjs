// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The stack smoke test: issues one credential per format from Inji Certify with the smoke wallet, verifies both
 * with Inji Verify, and checks that every other service answers. Pure verdict logic is in `smokeVerdict`.
 */
import { readFileSync } from 'node:fs';
import { request } from './http.mjs';
import { runProbe } from './services.mjs';
import { createAndPollVpRequest, verifyCredential } from './verify.mjs';
import { issueWithPreAuthorizedCode } from './wallet.mjs';

/** Issuer DID that Certify signs with in the preauth profile and certify_init.sql. */
export const ISSUER_DID = 'did:web:certify.ps02.test';

/** Test holder data; synthetic, as in the upstream farmer sample. */
export const FARMER_CLAIMS = Object.freeze({
  fullName: 'Asha Test',
  mobileNumber: '9000000000',
  phone: '9000000000',
  dateOfBirth: '1990-01-01',
  gender: 'Female',
  state: 'Karnataka',
  district: 'Bengaluru Urban',
  villageOrTown: 'Test Town',
  postalCode: '560001',
  landArea: '2 acres',
  landOwnershipType: 'Owner',
  primaryCropType: 'Rice',
  secondaryCropType: 'Millet',
  face: '',
  farmerID: 'FARMER-TEST-001',
});

/** Credential configurations the smoke test issues: FarmerCredential from SQL, FarmerSdJwt from config/seed. */
export const SMOKE_CREDENTIALS = Object.freeze([
  { id: 'FarmerCredential', format: 'ldp_vc' },
  { id: 'FarmerSdJwt', format: 'vc+sd-jwt' },
]);

/**
 * @typedef {{ id: string, label: string, ok: boolean, detail: string, verificationStatus?: string }} Check
 */

/**
 * Overall result. Everything passing gives SMOKE PASS. The one tolerated failure is gap G2: Inji Verify
 * answering INVALID for the Certify ldp_vc because it cannot resolve the did:web issuer. Any other failure,
 * including an HTTP error or timeout on that same call, is a real failure.
 * @param {Check[]} checks
 * @returns {{ pass: boolean, line: string, failed: Check[] }}
 */
export function smokeVerdict(checks) {
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) return { pass: true, line: 'SMOKE PASS', failed };
  const onlyG2 =
    failed.length === 1 && failed[0].id === 'verify-ldp_vc' && failed[0].verificationStatus === 'INVALID';
  if (onlyG2) return { pass: true, line: 'SMOKE PASS (known failure: G2)', failed };
  return { pass: false, line: `SMOKE FAIL (${failed.map((c) => c.id).join(', ')})`, failed };
}

const statusIs = (exchange, ...codes) => codes.includes(exchange.status);
const describe = (exchange) =>
  exchange.error ? `${exchange.error}` : `HTTP ${exchange.status} in ${exchange.ms} ms`;

/**
 * Runs every check against a running stack.
 * @param {{ urls: ReturnType<import('./env.mjs').hostUrls>, profiles: string[], caFile: string,
 *   networkMap: Array<{from: string, to: string}>, log: (line: string) => void }} context
 * @returns {Promise<{ checks: Check[], exchanges: object[], credentials: Record<string, unknown> }>}
 */
export async function runSmokeChecks({ urls, profiles, caFile, networkMap, log }) {
  /** @type {Check[]} */
  const checks = [];
  const exchanges = [];
  const credentials = {};
  const record = (check) => {
    checks.push(check);
    log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.label}: ${check.detail}`);
  };

  // Certify metadata lists both configurations (the SD-JWT one is added by the certify-seed service).
  const metadata = await request(
    'issuer metadata',
    `${urls.certifyNginx}/v1/certify/issuance/.well-known/openid-credential-issuer`,
    {
      timeoutMs: 120_000,
    },
  );
  exchanges.push(metadata);
  const configured = Object.keys(metadata.body?.credential_configurations_supported ?? {});
  const missing = SMOKE_CREDENTIALS.map((c) => c.id).filter((id) => !configured.includes(id));
  record({
    id: 'certify-metadata',
    label: 'Certify issuer metadata',
    ok: metadata.status === 200 && missing.length === 0,
    detail: `${describe(metadata)}; configurations: ${configured.join(', ') || 'none'}${missing.length ? `; missing ${missing.join(', ')}` : ''}`,
  });

  // The issuer DID document over HTTPS through the TLS front, as Inji Verify fetches it (did:web, gap G2).
  const didDoc = await runProbe(
    { label: 'did.json', url: `${urls.tlsFront}/.well-known/did.json`, hostHeader: 'certify.ps02.test' },
    { caFile },
  );
  exchanges.push(didDoc);
  record({
    id: 'tls-front-did',
    label: `TLS front serves the ${ISSUER_DID} document`,
    ok: didDoc.status === 200 && didDoc.body?.id === ISSUER_DID,
    detail: `${describe(didDoc)}; id ${didDoc.body?.id ?? '(none)'}`,
  });

  // Issue with the pre-authorized code flow, then verify each credential with Inji Verify.
  const verifications = [];
  for (const { id, format } of SMOKE_CREDENTIALS) {
    const issued = await issueWithPreAuthorizedCode({
      certifyUrl: urls.certifyNginx,
      configurationId: id,
      // The wallet sends the subset each configuration advertises (FarmerCredential: fullName, phone,
      // dateOfBirth, gender; FarmerSdJwt: fullName, dateOfBirth, farmerID).
      claims: { ...FARMER_CLAIMS },
      networkMap,
      exchanges,
    });
    const issuerOk = format !== 'ldp_vc' || issued.credential?.issuer === ISSUER_DID;
    record({
      id: `issue-${format}`,
      label: `Certify pre-authorized offer redeemed, ${format} issued (${id})`,
      ok: issued.ok && issuerOk,
      detail: issued.ok
        ? `issued to ${issued.holderDid?.slice(0, 32)}...${format === 'ldp_vc' ? `, issuer ${issued.credential?.issuer}` : ''}`
        : `failed at ${issued.step}: ${issued.detail}`,
    });
    if (issued.ok) {
      credentials[format] = issued.credential;
      verifications.push({ format, credential: issued.credential });
    }
  }

  // The VP request long-polls for up to 55 s, so it runs while the credentials are verified.
  const vpPromise = createAndPollVpRequest(urls.verifyService, exchanges);
  for (const { format, credential } of verifications) {
    const { exchange, verificationStatus } = await verifyCredential(
      urls.verifyService,
      credential,
      format,
      `vc-verification ${format}`,
    );
    exchanges.push(exchange);
    record({
      id: `verify-${format}`,
      label: `Inji Verify /vc-verification of the Certify ${format}`,
      ok: exchange.status === 200 && verificationStatus === 'SUCCESS',
      verificationStatus,
      detail: `${describe(exchange)}; verificationStatus ${verificationStatus ?? '(none)'}`,
    });
  }
  for (const { format } of SMOKE_CREDENTIALS) {
    if (!verifications.some((v) => v.format === format)) {
      record({
        id: `verify-${format}`,
        label: `Inji Verify /vc-verification of the Certify ${format}`,
        ok: false,
        detail: 'no credential to verify',
      });
    }
  }
  const vp = await vpPromise;
  record({
    id: 'verify-vp-request',
    label: 'Inji Verify POST /vp-request',
    ok: statusIs(vp.created, 201),
    detail: `${describe(vp.created)}${vp.created.body?.requestId ? `; requestId ${vp.created.body.requestId}` : ''}`,
  });
  record({
    id: 'verify-vp-status',
    label: 'Inji Verify GET /vp-request/{id}/status',
    ok: Boolean(vp.status) && statusIs(vp.status, 200),
    detail: vp.status ? `${describe(vp.status)}; status ${vp.status.body?.status ?? '(none)'}` : 'not called',
  });

  // Holder and verifier web front ends, when their profiles are running.
  const pages = [];
  if (profiles.includes('holder-web')) {
    pages.push(
      { id: 'mimoto-issuers', label: 'Mimoto /v1/mimoto/issuers', url: `${urls.mimoto}/v1/mimoto/issuers` },
      { id: 'inji-web', label: 'Inji Web', url: `${urls.injiWeb}/` },
      {
        id: 'inji-web-mimoto',
        label: 'Inji Web /v1/mimoto/issuers (proxied to Mimoto)',
        url: `${urls.injiWeb}/v1/mimoto/issuers`,
      },
    );
  }
  if (profiles.includes('verify-ui'))
    pages.push({ id: 'verify-ui', label: 'Inji Verify UI', url: `${urls.verifyUi}/` });
  for (const page of pages) {
    const exchange = await request(page.label, page.url, { timeoutMs: 30_000 });
    exchanges.push(exchange);
    record({ id: page.id, label: page.label, ok: exchange.status === 200, detail: describe(exchange) });
  }
  return { checks, exchanges, credentials };
}

/** Reads a JSON file; exported so tests and the CLI share it. */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
