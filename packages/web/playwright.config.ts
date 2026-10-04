/**
 * Browser tests.
 *
 * - Project `e2e`: everything under e2e/ except e2e/live/; runs against the UI in reference mode
 *   (no Docker needed). Root command: `npm run e2e`.
 * - Project `e2e-live`: e2e/live/; needs the bundle (Inji stack + playground) to be running.
 *   Root command: `npm run e2e:live`.
 *
 * The base URL defaults to the Vite preview port (28174); set PLAYWRIGHT_BASE_URL to test the bundle
 * on 28100 instead.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:28174';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'e2e',
      testIgnore: ['live/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e-live',
      testMatch: ['live/**/*.spec.ts'],
      // Inji Verify's LDP verification took up to 13 s and Certify's first call 52 s (measured 2026-10-04).
      timeout: 180_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
