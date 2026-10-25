// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Project `e2e-live` (`npm run e2e:live`): an all-Inji run in the playground page, against the bundle with
 * the holder-web profile: Inji Certify (authorization code, certify-ac) issues to Inji Web through Mimoto,
 * which presents to Inji Verify (API). With E2E_SCREENSHOTS set (`npm run e2e:live -- --screenshots`) it
 * writes screenshots 1-3 of docs/ux/README.md.
 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test('Inji Certify (authorization code) -> Inji Web -> Inji Verify in the playground: VALID', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Inji Certify (authorization code)' }).check();
  await page.getByRole('radio', { name: 'Inji Web (through Mimoto)' }).check();
  await page.getByRole('radio', { name: 'Inji Verify (API)' }).check();
  // Inji Web presents only ldp_vc to Inji Verify (gap G25).
  await page.getByLabel('Credential format').selectOption('ldp_vc');
  await expect(page.getByText('Inji stack not configured')).toHaveCount(0);
  await shot(page, '1-playground');
  await page.getByRole('button', { name: 'Run' }).click();

  const result = page.getByTestId('run-result');
  await expect(result).toContainText('Pass', { timeout: 150_000 });
  await expect(result).toContainText('Valid');
  await shot(page, '2-timeline-and-inspector');

  const href = await page.getByRole('link', { name: 'Open this run on its own page' }).getAttribute('href');
  const runId = decodeURIComponent(href!.split('/').pop()!);
  await page.goto(`/runs/${encodeURIComponent(runId)}/report`);
  await expect(page.locator('[data-field="issuer"]')).toContainText('Inji Certify');
  await expect(page.locator('[data-field="wallet"]')).toContainText('Inji Web');
  await expect(page.locator('[data-field="verifier"]')).toContainText('Inji Verify');
  await expect(page.locator('[data-field="outcome"]')).toContainText('Valid');
  await shot(page, '3-report');
});
