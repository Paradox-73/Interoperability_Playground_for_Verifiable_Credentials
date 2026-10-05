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

  const panel = page.getByTestId('inji-verify-sdk-panel');
  await expect(panel).toBeVisible({ timeout: 120_000 });
  // The component renders its own QR code once verify-service answered /vp-session-request.
  await expect(panel.locator('svg, canvas, img').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('run-result')).toContainText('Pass', { timeout: 150_000 });
  await expect(page.getByTestId('run-result')).toContainText('Valid');
});
