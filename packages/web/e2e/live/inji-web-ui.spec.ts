// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Project `e2e-live` (`npm run e2e:live`): Inji Web 0.17.0's own pages as a person uses them, against the
 * bundle (holder-web profile). Nothing here goes through the playground's headless `inji-web` role.
 *
 * 1. Log in on Inji Web with "Continue With Google". Mimoto's Google provider is the playground's test
 *    authorization server (deploy/inji-stack/compose.yaml), which approves at once; then set or enter the
 *    wallet passcode.
 * 2. Add a card from "Inji Certify AC (playground)" (certify-ac, Inji Certify 0.14.0 with the authorization
 *    code flow): the browser goes to the test server's /authorize at https://ref.ps02.test, which the
 *    resolver rule below sends to the stack's TLS front on 28443; Mimoto redeems the code and stores the
 *    `ldp_vc`. The card appears under Stored Cards.
 * 3. Share it with Inji Verify: the test asks verify-service for a request (as Inji Verify's own UI does),
 *    opens it on Inji Web's /authorize page, trusts the verifier, consents, and reads Inji Verify's result.
 */
import { expect, test, type Page } from '@playwright/test';

const INJI_WEB = process.env.INJI_WEB_URL ?? 'http://localhost:28004';
const VERIFY = process.env.INJI_VERIFY_URL ?? 'http://localhost:28080';
const TLS_FRONT_PORT = process.env.STACK_TLS_PORT ?? '28443';
const PASSCODE = '246810';
const SHOTS = process.env.E2E_SCREENSHOTS;
/** Pre-registered with Mimoto (deploy/inji-stack/config/mimoto-trusted-verifiers.json). */
const VERIFIER_CLIENT_ID = 'ps02-playground';

test.use({
  // The stack's test CA is not in the browser's trust store.
  ignoreHTTPSErrors: true,
  launchOptions: { args: [`--host-resolver-rules=MAP ref.ps02.test:443 127.0.0.1:${TLS_FRONT_PORT}`] },
});

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function logIn(page: Page): Promise<void> {
  await page.goto(INJI_WEB);
  await page.getByTestId('google-login-button').click();
  await page.waitForURL('**/user/passcode');
  const passcode = page.getByTestId('input-passcode');
  await expect(passcode.first()).toBeVisible();
  for (const [index, digit] of [...PASSCODE].entries()) await passcode.nth(index).fill(digit);
  // The first login sets the passcode (with a confirmation row); later logins only unlock the wallet.
  const confirmation = page.getByTestId('input-confirm-passcode');
  if ((await confirmation.count()) > 0) {
    for (const [index, digit] of [...PASSCODE].entries()) await confirmation.nth(index).fill(digit);
  }
  await page.getByTestId('btn-submit-passcode').click();
  await page.waitForURL('**/user/home');
}

const LDP_FORMAT = {
  ldp_vc: { proof_type: ['Ed25519Signature2020', 'Ed25519Signature2018', 'RsaSignature2018'] },
};

/** A request at verify-service, and the OpenID4VP URL Inji Verify's UI would hand to a web wallet. */
async function createVerifyRequest(): Promise<{ requestId: string; transactionId: string; query: string }> {
  const response = await fetch(`${VERIFY}/v1/verify/vp-request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: VERIFIER_CLIENT_ID,
      presentationDefinition: {
        id: 'ps02-inji-web-ui',
        purpose: 'Inji Interoperability Playground: Inji Web UI test',
        format: LDP_FORMAT,
        input_descriptors: [
          {
            id: 'farmer',
            format: LDP_FORMAT,
            constraints: {
              // Mimoto refuses a field filter without `pattern` (gap G23).
              fields: [{ path: ['$.type'], filter: { type: 'object', pattern: 'FarmerCredential' } }],
            },
          },
        ],
      },
    }),
  });
  expect(response.status, 'verify-service created the request').toBeLessThan(300);
  const created = (await response.json()) as {
    requestId: string;
    transactionId: string;
    authorizationDetails: {
      clientId: string;
      nonce: string;
      responseUri: string;
      responseMode?: string;
      responseType?: string;
      presentationDefinition: unknown;
    };
  };
  const details = created.authorizationDetails;
  const query = new URLSearchParams({
    client_id: details.clientId,
    state: created.requestId,
    response_mode: details.responseMode ?? 'direct_post',
    response_type: details.responseType ?? 'vp_token',
    nonce: details.nonce,
    response_uri: details.responseUri,
    presentation_definition: JSON.stringify(details.presentationDefinition),
    client_metadata: JSON.stringify({
      client_name: 'Inji Interoperability Playground',
      vp_formats: { ldp_vp: LDP_FORMAT.ldp_vc },
    }),
  });
  return { requestId: created.requestId, transactionId: created.transactionId, query: query.toString() };
}

test('Inji Web UI: log in, add a card from Inji Certify, share it with Inji Verify: VALID', async ({
  page,
}) => {
  await logIn(page);
  await page.goto(`${INJI_WEB}/user/credentials`);
  const cards = page.getByTestId('vc-card-view');
  // The card list renders after Mimoto answers; an empty wallet shows none.
  await page.waitForLoadState('networkidle');
  const before = await cards.count();

  await page.goto(`${INJI_WEB}/user/home`);
  await page.getByTestId('ItemBox-Outer-Container-1-FarmerAC').click();
  await shot(page, '17-inji-web-credential-types');
  await page.getByTestId('ItemBox-Outer-Container-2-FarmerCredential').click();
  // Test authorization server -> /redirect -> Mimoto stores the credential -> Stored Cards.
  await page.waitForURL('**/user/credentials', { timeout: 120_000 });
  await expect(cards).toHaveCount(before + 1, { timeout: 60_000 });
  await expect(cards.last()).toContainText('Farmer Verifiable Credential');
  await shot(page, '18-inji-web-stored-cards');

  const request = await createVerifyRequest();
  await page.goto(`${INJI_WEB}/authorize?${request.query}`);
  await page.waitForURL('**/user/authorize**');
  // Asked once per wallet; a verifier trusted on an earlier run is not asked about again.
  const trust = page.getByTestId('btn-trust-verifier');
  const consent = page.getByTestId('btn-consent-share').filter({ visible: true });
  await expect(trust.or(consent)).toBeVisible({ timeout: 30_000 });
  if (await trust.isVisible()) await trust.click();
  await expect(page.getByTestId('title-verifier-request')).toContainText('Inji Interoperability Playground');
  await page.locator('input[data-testid^="checkbox-"]').first().check();
  await shot(page, '19-inji-web-share-consent');
  await consent.click();

  await expect
    .poll(
      async () => {
        const status = await fetch(`${VERIFY}/v1/verify/vp-request/${request.requestId}/status`);
        return ((await status.json()) as { status?: string }).status;
      },
      { message: 'Inji Verify received the presentation', timeout: 60_000 },
    )
    .toBe('VP_SUBMITTED');
  const result = await fetch(`${VERIFY}/v1/verify/v2/vp-results/${request.transactionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(result.status).toBe(200);
  const body = (await result.json()) as {
    allChecksSuccessful: boolean;
    credentialResults: { allChecksSuccessful: boolean; verifiableCredential: string }[];
  };
  expect(body.allChecksSuccessful, JSON.stringify(body).slice(0, 500)).toBe(true);
  expect(body.credentialResults).toHaveLength(1);
  const shared = JSON.parse(body.credentialResults[0]!.verifiableCredential) as {
    type: string[];
    proof: { verificationMethod: string };
  };
  expect(shared.type).toContain('FarmerCredential');
  expect(shared.proof.verificationMethod).toMatch(/^did:web:certify-ac\.ps02\.test#/);
});
