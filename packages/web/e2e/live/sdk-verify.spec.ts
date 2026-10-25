// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Project `e2e-live` (`npm run e2e:live`): the official Inji Verify web component as the verifier of a
 * run, against the bundle or a host-mode server on 28100 with the Inji stack up. The component draws its
 * QR code from verify-service (through the playground's /v1/verify proxy), the reference wallet answers
 * the request the server rebuilt from that session, and the page shows the result.
 */
import { expect, test } from '@playwright/test';

test('Inji Certify -> reference wallet -> Inji Verify web component: VALID', async ({ page }) => {
  await page.goto('/');
  // Exact: "Inji Certify (authorization code)" (certify-ac) is listed too.
  await page.getByRole('radio', { name: 'Inji Certify', exact: true }).check();
  await page.getByRole('radio', { name: 'Reference wallet (headless)' }).check();
  await page.getByRole('radio', { name: 'Inji Verify (web component)' }).check();
  await page.getByLabel('Credential format').selectOption('vc+sd-jwt');
  await page.getByRole('button', { name: 'Run' }).click();

  // The panel and its QR code show only while the verifier step runs; the reference wallet answers within
  // a second or two, so the test does not wait for them. The run can end only through the component: the
  // server takes the request from the component's /vp-session-request and the result from its callback.
  await expect(page.getByTestId('run-result')).toContainText('Pass', { timeout: 150_000 });
  await expect(page.getByTestId('run-result')).toContainText('Valid');
});
