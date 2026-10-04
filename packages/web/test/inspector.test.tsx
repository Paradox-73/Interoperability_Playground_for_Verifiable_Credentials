import type { RunEvent } from '@inji-playground/protocol';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { RunExplorer } from '../src/inspector/RunExplorer';
import {
  CREDENTIAL,
  EVENTS,
  EXCHANGES,
  FORGED,
  GIVEN_NAME,
  ISSUER_JWT,
  KB_JWT,
  PRESENTATION,
  REQUEST_OBJECT,
  RUN_ID,
} from './fixtures/decodable-run';

vi.mock('mermaid', async () => (await import('./fake-mermaid')).fakeMermaidModule());

async function openMessage(name: RegExp) {
  const user = userEvent.setup();
  render(<RunExplorer runId={RUN_ID} events={EVENTS} />);
  const nav = screen.getByRole('navigation', { name: /recorded messages/i });
  await user.click(within(nav).getByRole('button', { name }));
  return { user, detail: screen.getByTestId('exchange-detail') };
}

function section(detail: HTMLElement, kind: string): HTMLElement {
  const found = detail.querySelector<HTMLElement>(`[data-section="${kind}"]`);
  if (!found) throw new Error(`no ${kind} section`);
  return found;
}

describe('protocol inspector', () => {
  it('groups the recorded messages by step and follows the newest one until the person chooses', () => {
    render(<RunExplorer runId={RUN_ID} events={EVENTS} />);
    const nav = screen.getByRole('navigation', { name: /recorded messages/i });
    expect(within(nav).getAllByRole('button')).toHaveLength(EXCHANGES.length + 1);
    expect(nav).toHaveTextContent('Wallet proves it holds its key and receives the credential');
    expect(screen.getByTestId('exchange-detail')).toHaveAttribute('data-exchange-id', `${RUN_ID}-x7`);
    expect(screen.getByText(/Showing the newest message/)).toBeInTheDocument();
  });

  it('shows decoded SD-JWT disclosures next to the raw credential string', async () => {
    const { detail } = await openMessage(/^3\. POST \/ref\/issuer\/credential/);
    const credential = section(detail, 'credential');
    expect(within(credential).getByTestId('section-raw')).toHaveTextContent(CREDENTIAL);
    const decoded = within(credential).getByTestId('section-decoded');
    const table = within(decoded).getByRole('table', { name: /2 disclosures/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'given_name',
      'birth_year',
    ]);
    expect(rows[0]).toHaveTextContent('"Asha"');
    expect(rows[0]).toHaveTextContent('salt-given-name');
    // Digests are computed with Web Crypto and compared with the issuer JWT's _sd list.
    await waitFor(() => expect(rows[0]).toHaveTextContent(/yes$/));
    expect(within(decoded).getByText(/No key-binding JWT/)).toBeInTheDocument();
    // The proof of possession of the request is decoded as well.
    expect(section(detail, 'proof-jwt')).toHaveTextContent('openid4vci-proof+jwt');
  });

  it('flags a disclosure the issuer never signed (altered disclosure)', async () => {
    const tampered = `${ISSUER_JWT}~${GIVEN_NAME}~${FORGED}~`;
    const events: RunEvent[] = [
      EVENTS[0]!,
      { type: 'artifact', runId: RUN_ID, kind: 'credential', format: 'vc+sd-jwt', raw: tampered },
    ];
    render(<RunExplorer runId={RUN_ID} events={events} />);
    const detail = screen.getByTestId('artifact-detail');
    const row = within(detail).getByRole('rowheader', { name: 'nationality' }).closest('tr')!;
    await waitFor(() => expect(row).toHaveTextContent('no: not signed by the issuer'));
  });

  it('decodes the request object and the presentation definition it carries', async () => {
    const { detail } = await openMessage(/^5\. GET \/ref\/verifier\/requests\/r1/);
    const requestObject = section(detail, 'request-object');
    expect(within(requestObject).getByTestId('section-raw')).toHaveTextContent(REQUEST_OBJECT);
    const decoded = within(requestObject).getByTestId('section-decoded');
    expect(decoded).toHaveTextContent('"oauth-authz-req+jwt"');
    expect(decoded).toHaveTextContent('"synthetic-vp-nonce"');
    expect(section(detail, 'presentation-definition')).toHaveTextContent('"example-identity"');
    // The step explanation links the specification section that defines the step.
    const help = within(detail).getByTestId('step-help');
    expect(help).toHaveTextContent('Request Object by reference');
    expect(within(help).getByRole('link')).toHaveAttribute(
      'href',
      'https://openid.net/specs/openid-4-verifiable-presentations-1_0.html',
    );
  });

  it('decodes the vp_token with its key-binding JWT, and the presentation_submission', async () => {
    const { detail } = await openMessage(/^6\. POST \/ref\/verifier\/response/);
    const vpToken = section(detail, 'vp-token');
    expect(within(vpToken).getByTestId('section-raw')).toHaveTextContent(PRESENTATION);
    const decoded = within(vpToken).getByTestId('section-decoded');
    expect(within(decoded).getByRole('table', { name: /1 disclosure/ })).toHaveTextContent('given_name');
    expect(decoded).toHaveTextContent('Key-binding JWT');
    expect(decoded).toHaveTextContent('"kb+jwt"');
    expect(decoded).toHaveTextContent(KB_JWT.split('.')[2]!);
    expect(section(detail, 'presentation-submission')).toHaveTextContent('"descriptor_map"');
  });

  it('shows the verification result and the raw request and response panes', async () => {
    const { detail } = await openMessage(/^7\. GET/);
    expect(section(detail, 'verification-result')).toHaveTextContent('"VALID"');
    expect(within(detail).getByRole('region', { name: 'Request' })).toHaveTextContent(
      'GET http://localhost:28100/ref/verifier/results/synthetic-txn-1',
    );
    expect(within(detail).getByRole('region', { name: 'Response' })).toHaveTextContent('HTTP 200');
  });

  it('copies a payload to the clipboard and downloads it as a file', async () => {
    const { user, detail } = await openMessage(/^3\. POST \/ref\/issuer\/credential/);
    const credential = section(detail, 'credential');
    await user.click(within(credential).getByRole('button', { name: 'Copy Credential' }));
    expect(await navigator.clipboard.readText()).toBe(CREDENTIAL);
    expect(within(credential).getByRole('button', { name: 'Copied Credential' })).toBeInTheDocument();

    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await user.click(within(credential).getByRole('button', { name: 'Download Credential' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    const anchor = clicked.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(`${RUN_ID}_message-3_response_body-credential.txt`);
    clicked.mockRestore();
  });

  it('has no axe violations with a payload open', async () => {
    const { detail } = await openMessage(/^6\. POST/);
    expect(detail).toBeInTheDocument();
    const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
});
