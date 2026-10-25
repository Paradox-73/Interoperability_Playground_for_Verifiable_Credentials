// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The phone step (manual-wallet modal) and the Inji Verify SDK panel, against a mocked server. The SDK
 * itself is replaced by a stand-in that records its props and offers buttons for its callbacks, so the
 * test checks what the playground passes to it and sends back, not the SDK's own UI.
 */
import { RunEventSchema, type RunEvent } from '@inji-playground/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { presentationDefinitionFor } from '../src/features/inji-verify-sdk/definition';
import { api, runSocketLink } from './msw/handlers';
import { server } from './msw/server';
import { renderApp } from './render';

const sdkProps: Array<Record<string, unknown>> = [];
vi.mock('@injistack/react-inji-verify-sdk', () => ({
  OpenID4VPVerification: (props: Record<string, unknown>) => {
    sdkProps.push(props);
    return (
      <div>
        <p>SDK stand-in</p>
        <button type="button" onClick={() => (props.onVPReceived as (id: string) => void)('txn-42')}>
          simulate VP received
        </button>
        <button
          type="button"
          onClick={() => (props.onError as (e: object) => void)({ errorMessage: 'boom', errorCode: 'E1' })}
        >
          simulate error
        </button>
      </div>
    );
  },
}));

const RUN_ID = 'run-phone-0001';
const AT = '2026-10-05T10:00:00.000Z';

function config(overrides: Record<string, string> = {}) {
  return {
    issuer: 'ref-issuer',
    wallet: 'mobile-wallet',
    verifier: 'ref-verifier',
    format: 'vc+sd-jwt',
    vciProfile: 'draft13',
    vpProfile: 'inji-draft',
    scenario: 'happy',
    ...overrides,
  };
}

const OFFER =
  'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Flocalhost%3A28100%2Fref%2Fissuer%2Fdraft13%2Foffers%2Fabc';

function personEvents(): RunEvent[] {
  return RunEventSchema.array().parse([
    { type: 'run.started', runId: RUN_ID, config: config(), at: AT },
    { type: 'step.started', runId: RUN_ID, step: 'issuer.offer', label: 'Issuer prepares an offer', at: AT },
    { type: 'step.finished', runId: RUN_ID, step: 'issuer.offer', status: 'ok', at: AT },
    {
      type: 'step.started',
      runId: RUN_ID,
      step: 'person.action',
      label: 'A person acts',
      at: new Date().toISOString(),
    },
    {
      type: 'person.action-needed',
      runId: RUN_ID,
      action: {
        id: `${RUN_ID}-scan-offer`,
        kind: 'scan-offer',
        title: 'Scan the credential offer with the wallet app',
        instructions: ['Open the wallet app on the phone.', 'Scan this QR code.'],
        qrText: OFFER,
        deepLink: OFFER,
        timeoutMs: 600_000,
      },
    },
  ]);
}

/** Streams `initial` to subscribers of `runId`; returns a function that sends more events. */
function stream(runId: string, initial: readonly RunEvent[]) {
  const clients: Array<{ send(data: string): void }> = [];
  server.use(
    runSocketLink.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (message) => {
        if (typeof message.data !== 'string') return;
        const data = JSON.parse(message.data) as { type: string; runId: string };
        if (data.type !== 'subscribe' || data.runId !== runId) return;
        clients.push(client);
        for (const event of initial) client.send(JSON.stringify(event));
      });
    }),
  );
  return (events: readonly unknown[]) => {
    for (const client of clients) for (const event of events) client.send(JSON.stringify(event));
  };
}

function recordPosts(path: string): unknown[] {
  const bodies: unknown[] = [];
  server.use(
    http.post(api(path), async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ runId: RUN_ID, status: 'running' });
    }),
  );
  return bodies;
}

describe('manual-wallet modal', () => {
  it('shows the QR code, the link with a copy button and the steps while the run waits for the phone', async () => {
    stream(RUN_ID, personEvents());
    const { user } = renderApp(`/runs/${RUN_ID}`);
    const dialog = await screen.findByRole('dialog', {
      name: 'Scan the credential offer with the wallet app',
    });
    expect(within(dialog).getByRole('img', { name: 'QR code for the wallet app' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('manual-wallet-link')).toHaveTextContent(OFFER);
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Open the wallet app on the phone.', 'Scan this QR code.']);
    expect(dialog).toHaveTextContent('Waiting for the wallet.');
    expect(dialog).toHaveTextContent(/Time left: (9|10) min/);
    // Focus moves into the dialog so keyboard and screen-reader users land on it.
    await waitFor(() => expect(within(dialog).getByRole('heading', { level: 2 })).toHaveFocus());

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(OFFER);
    expect(within(dialog).getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it('"Done" confirms the pending action, "Cancel run" cancels, and the modal closes when the step ends', async () => {
    const done = recordPosts(`/api/runs/${RUN_ID}/person-done`);
    const cancelled = recordPosts(`/api/runs/${RUN_ID}/cancel`);
    const send = stream(RUN_ID, personEvents());
    const { user } = renderApp(`/runs/${RUN_ID}`);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(done).toEqual([{ actionId: `${RUN_ID}-scan-offer` }]));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel run' }));
    await waitFor(() => expect(cancelled).toHaveLength(1));

    act(() => send([{ type: 'step.finished', runId: RUN_ID, step: 'person.action', status: 'ok', at: AT }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Inji Verify SDK panel', () => {
  it('runs the official component against /v1/verify on this origin and forwards its callbacks', async () => {
    sdkProps.length = 0;
    const callbacks = recordPosts(`/api/runs/${RUN_ID}/verifier-callback`);
    const events = RunEventSchema.array().parse([
      {
        type: 'run.started',
        runId: RUN_ID,
        config: config({ wallet: 'ref-wallet', verifier: 'inji-verify-sdk', format: 'ldp_vc' }),
        at: AT,
      },
      {
        type: 'step.started',
        runId: RUN_ID,
        step: 'verifier.request',
        label: 'Verifier creates a request',
        at: AT,
      },
    ]);
    stream(RUN_ID, events);
    const { user } = renderApp(`/runs/${RUN_ID}`);
    const panel = await screen.findByTestId('inji-verify-sdk-panel');
    await within(panel).findByText('SDK stand-in');
    const props = sdkProps.at(-1)!;
    expect(props.verifyServiceUrl).toBe(new URL('/v1/verify', window.location.origin).toString());
    expect(props.isSameDeviceFlowEnabled).toBe(false);
    expect(props.presentationDefinition).toEqual(presentationDefinitionFor('ldp_vc'));

    await user.click(within(panel).getByRole('button', { name: 'simulate VP received' }));
    await waitFor(() => expect(callbacks).toEqual([{ kind: 'vp-received', transactionId: 'txn-42' }]));
    expect(within(panel).getByTestId('inji-verify-sdk-status')).toHaveTextContent('Presentation received');
    await user.click(within(panel).getByRole('button', { name: 'simulate error' }));
    await waitFor(() =>
      expect(callbacks.at(-1)).toEqual({ kind: 'error', errorCode: 'E1', errorMessage: 'boom' }),
    );
  });

  it('asks for any farmer credential by vct for SD-JWT VC and by type for ldp_vc', () => {
    const field = presentationDefinitionFor('vc+sd-jwt').input_descriptors[0]!.constraints.fields[0]!;
    // A pattern, not a const: Inji Verify keeps only `pattern` (G17), Mimoto needs one (G23).
    expect(field).toEqual({ path: ['$.vct'], filter: { type: 'string', pattern: '[Ff]armer' } });
    const pattern = new RegExp(field.filter.pattern as string);
    expect(pattern.test('https://playground.ps02.test/vct/farmer/v1')).toBe(true);
    // Inji Certify's vct (deploy/inji-stack/config/seed/).
    expect(pattern.test('urn:ps02:playground:FarmerCredential')).toBe(true);
    expect(presentationDefinitionFor('ldp_vc').input_descriptors[0]!.constraints.fields[0]!.path).toEqual([
      '$.type',
    ]);
  });

  it('is not shown before the verifier creates its request', async () => {
    const events = RunEventSchema.array().parse([
      {
        type: 'run.started',
        runId: RUN_ID,
        config: config({ wallet: 'ref-wallet', verifier: 'inji-verify-sdk', format: 'ldp_vc' }),
        at: AT,
      },
      {
        type: 'step.started',
        runId: RUN_ID,
        step: 'issuer.offer',
        label: 'Issuer prepares an offer',
        at: AT,
      },
    ]);
    stream(RUN_ID, events);
    renderApp(`/runs/${RUN_ID}`);
    await screen.findByText('Issuer prepares an offer');
    expect(screen.queryByTestId('inji-verify-sdk-panel')).toBeNull();
  });

  it('is not shown for other verifiers', async () => {
    stream(RUN_ID, personEvents());
    renderApp(`/runs/${RUN_ID}`);
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('inji-verify-sdk-panel')).toBeNull();
  });
});
