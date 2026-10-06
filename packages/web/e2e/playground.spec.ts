/**
 * Browser tests of the playground in reference mode (`npm run e2e`): a real Chromium against the built UI
 * (vite preview on 28174) and a real playground server with the reference roles. No Docker.
 *
 * With E2E_SCREENSHOTS set (`npm run e2e -- --screenshots`), the tests also write the screenshots of
 * docs/ux/README.md.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { acceptOffer, createHolderKey } from '@inji-playground/oid4vci';
import { createDidResolver, createDocumentLoader } from '@inji-playground/formats';
import { PresentationClient } from '@inji-playground/oid4vp';
import { expect, test, type Page } from '@playwright/test';

const SERVER = process.env.E2E_SERVER_URL ?? 'http://localhost:28100';
const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** No serious or critical accessibility violations on the current page. */
async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`),
  ).toEqual([]);
}

async function chooseReferenceTrio(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Reference issuer' }).check();
  await page.getByRole('radio', { name: 'Reference wallet (headless)' }).check();
  await page.getByRole('radio', { name: 'Reference verifier', exact: true }).check();
}

/** Waits for the followed run to finish and returns its id from the timeline. */
async function finishedRunId(page: Page): Promise<string> {
  await expect(page.getByTestId('run-result')).toBeVisible({ timeout: 30_000 });
  const href = await page.getByRole('link', { name: 'Open this run on its own page' }).getAttribute('href');
  return decodeURIComponent(href!.split('/').pop()!);
}

test('reference happy path: choose the roles, run, follow the timeline, read the report', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Reference issuer' })).toBeVisible();
  await chooseReferenceTrio(page);
  await page.getByLabel('Credential format').selectOption('vc+sd-jwt');
  await shot(page, '1-playground');
  await page.getByRole('button', { name: 'Run' }).click();

  const runId = await finishedRunId(page);
  await expect(page.getByTestId('run-result')).toContainText('Pass');
  await shot(page, '2-timeline-and-inspector');

  await page.goto(`/runs/${encodeURIComponent(runId)}/report`);
  await expect(
    page.getByRole('heading', { level: 1, name: `Interoperability report of run ${runId}` }),
  ).toBeVisible();
  for (const field of ['issuer', 'wallet', 'verifier', 'format', 'proof', 'outcome', 'error']) {
    await expect(page.locator(`[data-field="${field}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-field="outcome"]')).toContainText('Valid');
  await expect(page.getByRole('link', { name: 'Download Markdown' })).toBeVisible();
  await shot(page, '3-report');
});

test('tamper path: the expected outcome before the run, expected and actual after', async ({ page }) => {
  await page.goto('/');
  await chooseReferenceTrio(page);
  await page.getByLabel('Credential format').selectOption('vc+sd-jwt');
  await page.getByLabel('Scenario').selectOption('kb-wrong-nonce');
  const expectation = page.getByTestId('scenario-expectation');
  await expect(expectation).toContainText('Expected outcome: Invalid');
  await expect(expectation).toContainText('RFC 9901');
  await page.getByRole('button', { name: 'Run' }).click();
  await finishedRunId(page);
  const result = page.getByRole('region', { name: /Expected and actual outcome of run/ });
  await expect(result.getByTestId('expected-outcome')).toContainText('Invalid');
  await expect(result.getByTestId('actual-outcome')).toContainText('Invalid');
  await expect(result).toContainText('The verifier answered exactly what this scenario requires.');
  await shot(page, '4-tamper-result');
});

test('mso_mdoc happy path: the inspector shows the CBOR vp_token as JSON', async ({ page }) => {
  await page.goto('/');
  await chooseReferenceTrio(page);
  await page.getByLabel('Credential format').selectOption('mso_mdoc');
  await page.getByRole('button', { name: 'Run' }).click();
  await finishedRunId(page);
  await expect(page.getByTestId('run-result')).toContainText('Pass');
  await page.getByRole('button', { name: 'Artefact: vp_token' }).click();
  const decoded = page.getByTestId('artifact-detail').getByTestId('cbor-view').first();
  await expect(decoded).toContainText('DeviceResponse');
  await expect(decoded).toContainText('test.ps02.playground.farmer.1');
  await shot(page, '15-mdoc-inspector');
  await expectAccessible(page);
});

test('matrix and history show stored runs, linked to their reports', async ({ page, request }) => {
  const created = await request.post(`${SERVER}/api/runs`, {
    data: { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier', format: 'ldp_vc' },
  });
  const { runId } = (await created.json()) as { runId: string };
  await expect
    .poll(
      async () =>
        ((await (await request.get(`${SERVER}/api/runs/${runId}`)).json()) as { status: string }).status,
    )
    .toBe('finished');

  await page.goto('/matrix');
  await expect(page.getByRole('heading', { level: 1, name: 'Compatibility matrix' })).toBeVisible();
  const cell = page.locator('[data-cell-id="ref-issuer/ref-wallet/ref-verifier/ldp_vc/inji-draft/happy"]');
  await expect(cell).toContainText('Pass');
  await expect(cell.getByRole('link').first()).toHaveAttribute('href', `/runs/${runId}/report`);
  await shot(page, '5-matrix');
  await expectAccessible(page);

  await page.goto('/runs');
  await expect(page.getByRole('heading', { level: 1, name: 'Run history' })).toBeVisible();
  await expect(page.locator(`[data-run-id="${runId}"]`)).toContainText('Pass');
  await page.getByLabel('Credential format').selectOption('vc+sd-jwt');
  await expect(page).toHaveURL(/format=vc%2Bsd-jwt/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await shot(page, '6-history');
  await expectAccessible(page);
});

test('manual-wallet modal completed by a scripted wallet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Reference issuer' }).check();
  await page.getByRole('radio', { name: /Phone wallet/ }).check();
  await page.getByRole('radio', { name: 'Reference verifier', exact: true }).check();
  await page.getByLabel('Credential format').selectOption('vc+sd-jwt');
  await page.getByRole('button', { name: 'Run' }).click();

  // The phone: the test reads the QR payload from the modal and acts as an OpenID4VC wallet app.
  const offerDialog = page.getByRole('dialog', { name: 'Scan the credential offer with the wallet app' });
  await expect(offerDialog.getByRole('img', { name: 'QR code for the wallet app' })).toBeVisible();
  await shot(page, '7-phone-wallet-modal');
  const offer = (await offerDialog.getByTestId('manual-wallet-link').textContent())!.trim();
  const holderKey = createHolderKey('ES256', 'did:jwk');
  const issued = await acceptOffer(offer, { fetch: (url, init) => fetch(url, init), holderKey });

  const requestDialog = page.getByRole('dialog', { name: 'Share the credential with the verifier' });
  await expect(requestDialog).toBeVisible({ timeout: 15_000 });
  const requestUri = (await requestDialog.getByTestId('manual-wallet-link').textContent())!.trim();
  const resolver = createDidResolver({});
  const wallet = new PresentationClient({
    fetch: (url, init) => fetch(url, init),
    holder: { keyPair: holderKey.keyPair, did: holderKey.did, verificationMethod: holderKey.kid! },
    didResolver: resolver,
    documentLoader: createDocumentLoader({ didResolver: resolver }),
  });
  const resolved = await wallet.resolveRequest(requestUri);
  const matches = wallet.selectCredentials(resolved, [
    { id: 'phone', format: 'vc+sd-jwt', raw: issued.credentials[0]!.raw },
  ]);
  await wallet.submit(resolved, await wallet.buildResponse(resolved, matches));

  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('run-result')).toContainText('Pass', { timeout: 15_000 });
});

test('keyboard only: run the happy path and open its report without a pointer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Reference issuer' })).toBeChecked();

  /** Presses Tab until the focused element matches, or fails after `limit` presses. */
  async function tabTo(name: string, role: 'button' | 'link', limit = 80): Promise<void> {
    for (let i = 0; i < limit; i += 1) {
      await page.keyboard.press('Tab');
      // Read the focused element in one step: the page re-renders while a run streams in, so a locator
      // such as `a:focus` can match on one call and no longer match on the next one.
      // A string, because the browser tests type-check without DOM types.
      const focused = await page.evaluate<{ tag: string; label: string } | null>(`(() => {
        const element = document.activeElement;
        if (!element) return null;
        return {
          tag: element.tagName.toLowerCase(),
          label: (element.getAttribute('aria-label') ?? element.innerText ?? '').trim(),
        };
      })()`);
      if (focused?.tag === (role === 'button' ? 'button' : 'a') && focused.label === name) return;
    }
    throw new Error(`could not reach the ${role} "${name}" with Tab`);
  }

  await tabTo('Run', 'button');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('run-result')).toContainText('Pass', { timeout: 30_000 });
  await tabTo('Open this run on its own page', 'link');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);
  await tabTo('Interoperability report of this run', 'link');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: /Interoperability report of run/ })).toBeVisible();
  await expectAccessible(page);
});

test('the playground and about pages have no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Reference issuer' })).toBeVisible();
  await expectAccessible(page);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1, name: 'About the playground' })).toBeVisible();
  await expectAccessible(page);
});

test('run page, playback, gaps and not-found pages render a stored run and the gap register', async ({
  page,
  request,
}) => {
  const created = await request.post(`${SERVER}/api/runs`, {
    data: { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier', format: 'vc+sd-jwt' },
  });
  const { runId } = (await created.json()) as { runId: string };
  await expect
    .poll(
      async () =>
        ((await (await request.get(`${SERVER}/api/runs/${runId}`)).json()) as { status: string }).status,
    )
    .toBe('finished');

  await page.goto(`/runs/${encodeURIComponent(runId)}`);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(`Run ${runId}`) })).toBeVisible();
  await expect(page.getByTestId('run-result')).toContainText('Pass');
  await shot(page, '8-run-page');
  await expectAccessible(page);

  await page.goto(`/runs/${encodeURIComponent(runId)}/playback`);
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(`Playback of run ${runId}`) }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to end' }).click();
  await expect(page.getByRole('button', { name: 'Step forward' })).toBeDisabled();
  await shot(page, '9-playback');
  await expectAccessible(page);

  await page.goto('/gaps');
  await expect(page.getByRole('heading', { level: 1, name: 'Interoperability gaps' })).toBeVisible();
  await expect(page.getByText('G15', { exact: false }).first()).toBeVisible();
  await shot(page, '10-gaps');
  await expectAccessible(page);

  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1, name: 'About the playground' })).toBeVisible();
  await shot(page, '11-about');

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await shot(page, '12-not-found');
  await expectAccessible(page);
});

test('Digital Credentials API: the browser wallet answers through the page, the verifier checks the origin', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Reference issuer' }).check();
  await page.getByRole('radio', { name: 'Browser wallet (Digital Credentials API)' }).check();
  await page.getByRole('radio', { name: 'Reference verifier (Digital Credentials API)' }).check();
  await page.getByLabel('Credential format').selectOption('vc+sd-jwt');
  await page.getByLabel('Presentation protocol').selectOption('final-1.0');
  await page.getByRole('button', { name: 'Run' }).click();

  const dialog = page.getByRole('dialog', { name: "Present through the browser's Digital Credentials API" });
  await expect(dialog.getByTestId('dc-api-panel')).toBeVisible({ timeout: 15_000 });
  await shot(page, '13-dc-api');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Answer with the playground wallet' }).click();
  // The step ends as soon as the verifier has the answer, which closes the dialog.
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('run-result')).toContainText('Pass', { timeout: 15_000 });
});

test('Digital Credentials API: "Ask the browser" calls navigator.credentials.get with the unsigned request', async ({
  page,
}) => {
  // A browser wallet stand-in: records the request the page passes and answers through the playground wallet.
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (globalThis as unknown as { __dcApiCalls: unknown[] }).__dcApiCalls = calls;
    (globalThis as unknown as { DigitalCredential: unknown }).DigitalCredential = class {};
    const get = async (options: { digital: { requests: { protocol: string; data: unknown }[] } }) => {
      calls.push(options);
      const doc = (
        globalThis as unknown as {
          document: {
            querySelector(selector: string): { dataset: Record<string, string | undefined> } | null;
          };
        }
      ).document;
      const provider = doc.querySelector('[data-provider-url]')?.dataset.providerUrl;
      const answered = await fetch(provider ?? '/missing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options.digital.requests[0]),
      });
      const body = (await answered.json()) as { protocol: string; data: unknown };
      return { protocol: body.protocol, data: body.data };
    };
    // Chromium has the real API; its get() would open the browser's own wallet dialog.
    (
      globalThis as unknown as { CredentialsContainer: { prototype: { get: unknown } } }
    ).CredentialsContainer.prototype.get = get;
  });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Reference issuer' }).check();
  await page.getByRole('radio', { name: 'Browser wallet (Digital Credentials API)' }).check();
  await page.getByRole('radio', { name: 'Reference verifier (Digital Credentials API)' }).check();
  await page.getByLabel('Credential format').selectOption('ldp_vc');
  await page.getByLabel('Presentation protocol').selectOption('final-1.0');
  await page.getByRole('button', { name: 'Run' }).click();

  const dialog = page.getByRole('dialog', { name: "Present through the browser's Digital Credentials API" });
  await expect(dialog.getByTestId('dc-api-support')).toContainText('has the Digital Credentials API', {
    timeout: 15_000,
  });
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Ask the browser' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  const calls = await page.evaluate(
    () => (globalThis as unknown as { __dcApiCalls: unknown[] }).__dcApiCalls,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    mediation: 'required',
    digital: { requests: [{ protocol: 'openid4vp-v1-unsigned', data: { response_mode: 'dc_api' } }] },
  });
  await expect(page.getByTestId('run-result')).toContainText('Pass', { timeout: 15_000 });
});

test('phone-sized screen: no page scrolls sideways and the pages stay accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noSidewaysScroll = async (where: string) => {
    const overflow = await page.evaluate(() => {
      const root = (
        globalThis as unknown as {
          document: { documentElement: { scrollWidth: number; clientWidth: number } };
        }
      ).document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow, `${where} is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
  };
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Reference issuer' })).toBeVisible();
  await chooseReferenceTrio(page);
  await noSidewaysScroll('the playground page');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Run' }).click();
  const runId = await finishedRunId(page);
  await shot(page, '14-phone-playground');
  await noSidewaysScroll('the playground page with a finished run');
  for (const path of [
    `/runs/${encodeURIComponent(runId)}`,
    `/runs/${encodeURIComponent(runId)}/report`,
    '/runs',
    '/matrix',
    '/gaps',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await noSidewaysScroll(path);
    await expectAccessible(page);
  }
});
