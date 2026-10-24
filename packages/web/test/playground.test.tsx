/**
 * The playground page against a mocked server: selector, default selection, run bar, live timeline and
 * accessibility. These are the acceptance checks of the UI foundation.
 */
import exampleRun from '@inji-playground/protocol/fixtures/example-run.synthetic.json';
import { RunEventSchema, type RunConfigInput, type RunEvent } from '@inji-playground/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { roleStatuses } from './fixtures/roles';
import { api, createRunHandler, rolesHandler, runSocketLink } from './msw/handlers';
import { server } from './msw/server';
import { renderApp } from './render';

const RUN_EVENTS: RunEvent[] = RunEventSchema.array().parse(exampleRun.events);
const RUN_ID = 'example-run-0001';

// The live timeline and axe tests render the whole app, click Run and wait for eight streamed steps. The
// 30 s default of this package timed out once on a busy machine (2026-10-25), so these two get double.
const SLOW_TEST_MS = 60_000;

/** The radio of a role card, by the role's name. */
const card = (name: string) => screen.getByRole('radio', { name });

async function waitForCards() {
  await screen.findAllByRole('radio');
}

/** Streams the given events to every client that subscribes to RUN_ID; returns a function to send more. */
function streamRunEvents(initial: readonly RunEvent[]) {
  const clients: Array<{ send(data: string): void }> = [];
  server.use(
    runSocketLink.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (message) => {
        if (typeof message.data !== 'string') return;
        const data = JSON.parse(message.data) as { type: string; runId: string };
        if (data.type !== 'subscribe' || data.runId !== RUN_ID) return;
        clients.push(client);
        for (const event of initial) client.send(JSON.stringify(event));
      });
    }),
  );
  return (events: readonly RunEvent[]) => {
    for (const client of clients) for (const event of events) client.send(JSON.stringify(event));
  };
}

describe('role selector', () => {
  it('renders the issuer, wallet and verifier columns from /api/roles', async () => {
    renderApp();
    await waitForCards();

    const groups = screen.getAllByRole('radiogroup');
    expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toEqual([
      'column-issuer',
      'column-wallet',
      'column-verifier',
    ]);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '1. Issuer',
      '2. Wallet',
      '3. Verifier',
    ]);

    const issuers = within(groups[0]!)
      .getAllByRole('radio')
      .map((r) => r.getAttribute('value'));
    const wallets = within(groups[1]!)
      .getAllByRole('radio')
      .map((r) => r.getAttribute('value'));
    const verifiers = within(groups[2]!)
      .getAllByRole('radio')
      .map((r) => r.getAttribute('value'));
    expect(issuers).toEqual(['inji-certify', 'inji-certify-ac', 'ref-issuer']);
    expect(wallets).toEqual(['ref-wallet', 'inji-web', 'mobile-wallet']);
    expect(verifiers).toEqual(['inji-verify', 'inji-verify-sdk', 'ref-verifier']);
  });

  it('shows the tag, version, format and proof chips and health of each card', async () => {
    renderApp();
    await waitForCards();
    const certify = screen.getByTestId('role-card-inji-certify');
    expect(certify).toHaveTextContent('Inji');
    expect(certify).toHaveTextContent('Version 0.14.0');
    expect(certify).toHaveTextContent('JSON-LD VC (ldp_vc)');
    expect(certify).toHaveTextContent('SD-JWT VC (vc+sd-jwt)');
    expect(certify).toHaveTextContent('Ed25519Signature2020');
    expect(certify).toHaveTextContent('Healthy');

    const reference = screen.getByTestId('role-card-ref-wallet');
    expect(reference).toHaveTextContent('Reference (non-Inji)');
  });

  it('keeps an incompatible card visible with the reason as text', async () => {
    renderApp();
    await waitForCards();

    // Default: Inji Certify (authorization code) -> Inji Web -> Inji Verify. Pre-authorized Certify
    // only sends credential offers, which Inji Web cannot take.
    const certify = screen.getByTestId('role-card-inji-certify');
    expect(certify).toBeVisible();
    expect(certify).toHaveAttribute('data-incompatible', 'true');
    expect(certify).toHaveTextContent('Not compatible with the current selection');
    expect(certify).toHaveTextContent(
      'Inji Certify (pre-authorized code) starts issuance only with a credential offer, but Inji Web (through Mimoto) accepts only a wallet-initiated request',
    );
    // The reason is part of the radio's description, so screen readers hear it too.
    expect(card('Inji Certify (pre-authorized code)')).toHaveAccessibleDescription(
      expect.stringContaining('accepts only a wallet-initiated request'),
    );
    expect(screen.getByTestId('role-card-inji-certify-ac')).not.toHaveAttribute('data-incompatible');
  });

  it('shows blocking reasons and warnings reported by the server on the cards they name', async () => {
    server.use(
      http.get(api('/api/compatibility'), ({ request }) => {
        const verifier = new URL(request.url).searchParams.get('verifier');
        if (verifier === 'inji-verify-sdk') {
          return HttpResponse.json({
            runnable: false,
            mode: 'live',
            reasons: [
              {
                code: 'sdk.same-device',
                severity: 'blocking',
                message: 'The SDK panel needs a wallet that opens links',
                roles: ['inji-verify-sdk'],
                gapIds: ['G7'],
              },
            ],
          });
        }
        if (verifier === 'ref-verifier') {
          return HttpResponse.json({
            runnable: true,
            mode: 'live',
            reasons: [
              {
                code: 'did.padded-jwk',
                severity: 'warning',
                message: 'Certify pads the did:jwk it binds',
                roles: ['ref-verifier'],
              },
            ],
          });
        }
        return HttpResponse.json({ runnable: true, mode: 'live', reasons: [] });
      }),
    );
    renderApp();
    const sdkCard = await screen.findByTestId('role-card-inji-verify-sdk');
    await waitFor(() =>
      expect(sdkCard).toHaveTextContent('The SDK panel needs a wallet that opens links (gap register: G7)'),
    );
    expect(sdkCard).toHaveAttribute('data-incompatible', 'true');

    const refCard = screen.getByTestId('role-card-ref-verifier');
    await waitFor(() => expect(refCard).toHaveTextContent('Runs, with a known limitation'));
    expect(refCard).toHaveTextContent('Certify pads the did:jwk it binds');
    expect(refCard).not.toHaveAttribute('data-incompatible');
    expect(screen.getByTestId('role-card-inji-verify')).not.toHaveAttribute('data-incompatible');
  });

  it('preselects healthy Inji modules in every column', async () => {
    renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Inji Certify (authorization code)')).toBeChecked());
    expect(card('Inji Web (through Mimoto)')).toBeChecked();
    expect(card('Inji Verify (API)')).toBeChecked();
    expect(screen.getByText('Healthy Inji modules were selected in every column.')).toBeInTheDocument();
    expect(screen.getByTestId('mode-badge')).toHaveTextContent('Mode: Live');
  });

  it('falls back to reference roles when the Inji modules are not healthy', async () => {
    server.use(rolesHandler(roleStatuses({ health: { 'inji-verify': 'down', 'inji-verify-sdk': 'down' } })));
    renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Reference issuer')).toBeChecked());
    expect(card('Reference wallet (headless)')).toBeChecked();
    expect(card('Reference verifier')).toBeChecked();
    expect(screen.getByText(/so the playground's reference roles were selected/)).toBeInTheDocument();
    expect(screen.getByTestId('mode-badge')).toHaveTextContent('Mode: Reference');
  });

  it('keeps the person’s choice when role health is refreshed', async () => {
    const { user, queryClient } = renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());
    await user.click(card('Reference verifier'));
    await queryClient.refetchQueries({ queryKey: ['roles'] });
    expect(card('Reference verifier')).toBeChecked();
  });
});

describe('run bar', () => {
  it('posts the selected configuration when Run is pressed', async () => {
    const bodies: RunConfigInput[] = [];
    server.use(createRunHandler(RUN_ID, bodies));
    const { user } = renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      issuer: 'inji-certify-ac',
      wallet: 'inji-web',
      verifier: 'inji-verify',
      format: 'ldp_vc',
      vciProfile: 'draft13',
      vpProfile: 'inji-draft',
      scenario: 'happy',
    });
  });

  it('offers only the formats every selected role supports and sends the chosen one', async () => {
    const bodies: RunConfigInput[] = [];
    server.use(createRunHandler(RUN_ID, bodies));
    const { user } = renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());

    const format = screen.getByLabelText('Credential format');
    // certify-ac issues ldp_vc only.
    expect(
      within(format)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['ldp_vc']);

    await user.click(card('Reference issuer'));
    await user.click(card('Reference wallet (headless)'));
    await user.click(card('Reference verifier'));
    expect(
      within(format)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt']);
    await user.selectOptions(format, 'vc+sd-jwt');
    await user.selectOptions(screen.getByLabelText('Presentation protocol'), 'final-1.0');
    await user.selectOptions(screen.getByLabelText('Issuance protocol'), 'v1');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'ref-verifier',
      format: 'vc+sd-jwt',
      vciProfile: 'v1',
      vpProfile: 'final-1.0',
      scenario: 'happy',
    });
  });

  it('disables Run and says why when the selected roles cannot work together', async () => {
    const { user } = renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());
    await user.click(card('Inji Certify (pre-authorized code)'));

    const run = screen.getByRole('button', { name: 'Run' });
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription(expect.stringContaining('This combination cannot run'));
  });

  it('shows the server error when a run cannot be started', async () => {
    server.use(
      http.post(api('/api/runs'), () =>
        HttpResponse.json({ message: 'Inji stack is not running' }, { status: 409 }),
      ),
    );
    const { user } = renderApp();
    await waitForCards();
    await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The run could not be started: Inji stack is not running',
    );
  });
});

describe('live timeline', () => {
  it(
    'updates from WebSocket events and announces finished steps',
    async () => {
      server.use(createRunHandler(RUN_ID));
      // The first two events arrive on subscription; the rest are sent by the test.
      const send = streamRunEvents(RUN_EVENTS.slice(0, 2));
      const { user } = renderApp();
      await waitForCards();
      await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());
      expect(
        screen.getByText('No run yet: pick an issuer, a wallet and a verifier, then press Run.'),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Run' }));

      const steps = await screen.findByRole('list', { name: `Steps of run ${RUN_ID}` });
      // Role names come from /api/roles; the run configuration carries only ids.
      expect(
        screen.getByText('Reference issuer → Reference wallet (headless) → Reference verifier'),
      ).toBeInTheDocument();
      const firstRow = within(steps).getAllByRole('listitem')[0]!;
      expect(firstRow).toHaveTextContent('In progress');
      expect(firstRow).toHaveTextContent(
        'Issuer prepares a credential offer for the wallet (Credential Offer)',
      );

      // exchange, artifact, step.finished of the offer step.
      send(RUN_EVENTS.slice(2, 5));
      await waitFor(() => expect(firstRow).toHaveTextContent('Done'));
      expect(screen.getByTestId('live-announcer')).toHaveTextContent(
        'Step done: Issuer prepares a credential offer for the wallet',
      );
      expect(screen.getByText('1 HTTP exchange recorded')).toBeInTheDocument();

      send(RUN_EVENTS.slice(5));
      await waitFor(() => expect(within(steps).getAllByRole('listitem')).toHaveLength(8));
      const rows = within(steps).getAllByRole('listitem');
      expect(rows.every((row) => row.getAttribute('data-status') === 'ok')).toBe(true);
      expect(rows[2]).toHaveTextContent(
        'Wallet exchanges the one-time code for an access token (Token Request)',
      );
      expect(screen.getByTestId('run-result')).toHaveTextContent(
        'Pass: the verifier answered “Valid” (expected “Valid”)',
      );
      expect(screen.getByTestId('live-announcer')).toHaveTextContent('Run finished. Pass: Valid');
    },
    SLOW_TEST_MS,
  );

  it('shows a run that is opened on its own page', async () => {
    streamRunEvents(RUN_EVENTS);
    renderApp(`/runs/${RUN_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Run ${RUN_ID}` })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('run-result')).toHaveTextContent('Pass'));
  });
});

describe('accessibility', () => {
  it(
    'has no axe violations on the playground page, before and after a run',
    async () => {
      server.use(createRunHandler(RUN_ID));
      streamRunEvents(RUN_EVENTS);
      const { user } = renderApp();
      await waitForCards();
      await waitFor(() => expect(card('Inji Verify (API)')).toBeChecked());

      // jsdom cannot compute colours; contrast is checked from the theme tokens in theme-contrast.test.ts.
      const options: axe.RunOptions = { rules: { 'color-contrast': { enabled: false } } };
      const before = await axe.run(document.body, options);
      expect(before.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

      await user.click(screen.getByRole('button', { name: 'Run' }));
      await waitFor(() => expect(screen.getByTestId('run-result')).toBeInTheDocument());
      const after = await axe.run(document.body, options);
      expect(after.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    },
    SLOW_TEST_MS,
  );
});
