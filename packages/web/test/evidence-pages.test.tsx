/**
 * The evidence pages against a mocked server: compatibility matrix, run history, run report, gap
 * register, and the tamper controls of the run bar. These are the acceptance checks of WP-13.
 */
import { RunEventSchema, type RunConfigInput, type RunEvent } from '@inji-playground/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { describe, expect, it } from 'vitest';
import { FAIL_RUN, PASS_RUN, failReport, gaps, matrix, metrics, runList } from './fixtures/evidence';
import { api, createRunHandler, runSocketLink } from './msw/handlers';
import { server } from './msw/server';
import { renderApp } from './render';

// jsdom cannot compute colours; contrast is checked from the theme tokens in theme-contrast.test.ts.
const AXE: axe.RunOptions = { rules: { 'color-contrast': { enabled: false } } };

async function expectNoAxeViolations(): Promise<void> {
  const result = await axe.run(document.body, AXE);
  expect(
    result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`),
  ).toEqual([]);
}

/** Answers `path` with `body` and records the query string of every request to it. */
function recordQueries(path: string, body: JsonBodyType): URLSearchParams[] {
  const seen: URLSearchParams[] = [];
  server.use(
    http.get(api(path), ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json(body);
    }),
  );
  return seen;
}

const cellOf = (id: string) => document.querySelector<HTMLElement>(`[data-cell-id="${id}"]`)!;

describe('compatibility matrix', () => {
  it('shows each cell as icon and word, never colour alone, linked to the newest run report', async () => {
    recordQueries('/api/matrix', matrix);
    renderApp('/matrix');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Compatibility matrix' }),
    ).toBeInTheDocument();
    await screen.findByRole('table', { name: /Compatibility matrix, scenario “happy”/ });

    const pass = cellOf('ref-issuer/ref-wallet/ref-verifier/vc+sd-jwt/inji-draft/happy');
    expect(pass).toHaveAttribute('data-status', 'pass');
    expect(pass).toHaveTextContent('Pass');
    // The icon repeats the word and is hidden from screen readers.
    expect(pass.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(
      within(pass).getByRole('link', { name: /Pass.*open the report of the newest run/ }),
    ).toHaveAttribute('href', `/runs/${PASS_RUN}/report`);

    const fail = cellOf('ref-issuer/ref-wallet/inji-verify/vc+sd-jwt/inji-draft/happy');
    expect(fail).toHaveTextContent('Fail');
    expect(within(fail).getByRole('link', { name: /Fail/ })).toHaveAttribute(
      'href',
      `/runs/${FAIL_RUN}/report`,
    );
    expect(fail).toHaveTextContent('outcome.unexpected');
    // A red cell links to the gap register entries that explain it.
    expect(within(fail).getByRole('link', { name: /Gap register: G2/ })).toHaveAttribute(
      'href',
      `/gaps?cell=${encodeURIComponent('ref-issuer/ref-wallet/inji-verify/vc+sd-jwt/inji-draft/happy')}`,
    );

    const blocked = cellOf('ref-issuer/ref-wallet/inji-verify/ldp_vc/inji-draft/happy');
    expect(blocked).toHaveTextContent('Not supported');
    expect(blocked).toHaveTextContent('does not support the format ldp_vc');
    expect(within(blocked).queryByRole('button', { name: /Run cell/ })).toBeNull();

    expect(cellOf('ref-issuer/ref-wallet/ref-verifier/ldp_vc/inji-draft/happy')).toHaveTextContent(
      'Not tested',
    );
  });

  it('turns filters into the API query and the page address', async () => {
    const queries = recordQueries('/api/matrix', matrix);
    const { user, router } = renderApp('/matrix');
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Credential format'), 'ldp_vc');
    await waitFor(() => expect(queries.at(-1)?.get('credentialFormat')).toBe('ldp_vc'));
    expect(router.state.location.search).toContain('credentialFormat=ldp_vc');
    await user.click(screen.getByLabelText('Hide combinations that cannot run'));
    await waitFor(() => expect(queries.at(-1)?.get('hideNotSupported')).toBe('true'));
  });

  it('runs one cell with its configuration', async () => {
    recordQueries('/api/matrix', matrix);
    const bodies: RunConfigInput[] = [];
    server.use(createRunHandler('run-new-0009', bodies));
    const { user } = renderApp('/matrix');
    await screen.findByRole('table');
    const untested = cellOf('ref-issuer/ref-wallet/ref-verifier/ldp_vc/inji-draft/happy');
    await user.click(within(untested).getByRole('button', { name: /Run cell/ }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'ref-verifier',
      format: 'ldp_vc',
      vpProfile: 'inji-draft',
      scenario: 'happy',
    });
    expect(await screen.findByRole('link', { name: 'run-new-0009' })).toHaveAttribute(
      'href',
      '/runs/run-new-0009',
    );
  });

  it('has no axe violations', async () => {
    recordQueries('/api/matrix', matrix);
    renderApp('/matrix');
    await screen.findByRole('table');
    await expectNoAxeViolations();
  });
});

describe('run history', () => {
  it('lists stored runs with outcome and verdict as words, linking each to its report', async () => {
    recordQueries('/api/runs', runList);
    recordQueries('/api/metrics', metrics);
    renderApp('/runs');
    const table = await screen.findByRole('table', { name: 'Stored runs, newest first' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.getAttribute('data-run-id'))).toEqual(runList.items.map((run) => run.runId));
    const failRow = rows[1]!;
    expect(failRow).toHaveTextContent('Fail');
    expect(failRow).toHaveTextContent('kb-wrong-nonce');
    expect(within(failRow).getByRole('link', { name: `Report of run ${FAIL_RUN}` })).toHaveAttribute(
      'href',
      `/runs/${FAIL_RUN}/report`,
    );
    expect(rows[2]).toHaveTextContent('Pass');
    expect(rows[0]).toHaveTextContent('Not supported');
    expect(screen.getByText('Runs 1–3 of 3')).toBeInTheDocument();
  });

  it('sends every filter change to the API and keeps it in the page address', async () => {
    const runQueries = recordQueries('/api/runs', runList);
    const metricQueries = recordQueries('/api/metrics', metrics);
    const { user, router } = renderApp('/runs');
    await screen.findByRole('table', { name: 'Stored runs, newest first' });
    expect(runQueries.at(-1)?.get('order')).toBe('newest');

    await user.selectOptions(screen.getByLabelText('Credential format'), 'vc+sd-jwt');
    await waitFor(() => expect(runQueries.at(-1)?.get('format')).toBe('vc+sd-jwt'));
    await user.selectOptions(screen.getByLabelText('Verdict'), 'fail');
    await waitFor(() => expect(runQueries.at(-1)?.get('verdict')).toBe('fail'));
    expect(router.state.location.search).toContain('verdict=fail');
    // A success rate over failed runs only would always read 0 %, so metrics ignore the verdict filter.
    await waitFor(() => expect(metricQueries.at(-1)?.get('format')).toBe('vc+sd-jwt'));
    expect(metricQueries.at(-1)?.has('verdict')).toBe(false);

    await user.type(screen.getByLabelText('From (UTC day)'), '2026-10-01');
    await waitFor(() => expect(runQueries.at(-1)?.get('from')).toBe('2026-10-01T00:00:00.000Z'));
  });

  it('says so when nothing is stored', async () => {
    renderApp('/runs');
    expect(await screen.findByText(/No runs are stored yet/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    recordQueries('/api/runs', runList);
    recordQueries('/api/metrics', metrics);
    renderApp('/runs');
    await screen.findByRole('table', { name: 'Stored runs, newest first' });
    await expectNoAxeViolations();
  });
});

describe('run report', () => {
  function serveReport() {
    server.use(http.get(api(`/api/runs/${FAIL_RUN}/report.json`), () => HttpResponse.json(failReport)));
  }

  it('renders every mandatory field: issuer, wallet, verifier, format, proof type, outcome, error', async () => {
    serveReport();
    renderApp(`/runs/${FAIL_RUN}/report`);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Interoperability report of run ${FAIL_RUN}` }),
    ).toBeInTheDocument();
    const field = (name: string) => document.querySelector(`[data-field="${name}"]`)!;
    await waitFor(() => expect(field('issuer')).toHaveTextContent('Reference issuer (ref-issuer)'));
    expect(field('wallet')).toHaveTextContent('Reference wallet (headless) (ref-wallet)');
    expect(field('verifier')).toHaveTextContent('Reference verifier (ref-verifier)');
    expect(field('format')).toHaveTextContent('SD-JWT');
    expect(field('proof')).toHaveTextContent('EdDSA');
    expect(field('proof')).toHaveTextContent('holder key binding: ES256');
    expect(field('outcome')).toHaveTextContent('Valid');
    expect(field('error')).toHaveTextContent('outcome.unexpected');
    expect(
      within(field('error') as HTMLElement).getByRole('link', { name: /Open message 7 \(POST\)/ }),
    ).toHaveAttribute('href', `/runs/${FAIL_RUN}?exchange=7`);
    expect(screen.getByRole('heading', { level: 2, name: /Result/ })).toHaveTextContent('Fail');
  });

  it('offers the report as Markdown and JSON downloads, and the redacted export', async () => {
    serveReport();
    renderApp(`/runs/${FAIL_RUN}/report`);
    const actions = await screen.findByRole('navigation', { name: 'Report actions' });
    expect(within(actions).getByRole('link', { name: 'Download Markdown' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/api/runs/${FAIL_RUN}/report.md?download=true`) as string,
    );
    expect(within(actions).getByRole('link', { name: 'Download JSON' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/api/runs/${FAIL_RUN}/report.json?download=true`) as string,
    );
    expect(within(actions).getByRole('link', { name: 'Download redacted export' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/api/runs/${FAIL_RUN}/export`) as string,
    );
  });

  it('puts the expected outcome next to the actual one and explains the difference', async () => {
    serveReport();
    renderApp(`/runs/${FAIL_RUN}/report`);
    const comparison = await screen.findByTestId('outcome-comparison');
    expect(within(comparison).getByTestId('expected-outcome')).toHaveTextContent('Invalid');
    expect(within(comparison).getByTestId('actual-outcome')).toHaveTextContent('Valid');
    expect(comparison).toHaveTextContent('accepted a credential or presentation it should have refused');
  });

  it('replays the run with a tamper scenario (POST /api/runs with replayOf)', async () => {
    serveReport();
    const bodies: unknown[] = [];
    server.use(
      http.post(api('/api/runs'), async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ runId: 'run-replay-0004' }, { status: 201 });
      }),
    );
    const { user, router } = renderApp(`/runs/${FAIL_RUN}/report`);
    const select = await screen.findByLabelText('Tamper scenario');
    // The menu fills once the catalogue arrives.
    await within(select).findByRole('option', { name: 'Expired credential ("Valid but expired")' });
    await user.selectOptions(select, 'expired');
    expect(screen.getByRole('region', { name: 'Replay with tamper' })).toHaveTextContent('Valid but expired');
    await user.click(screen.getByRole('button', { name: 'Replay with this scenario' }));
    await waitFor(() => expect(bodies).toEqual([{ replayOf: FAIL_RUN, scenario: 'expired' }]));
    await waitFor(() => expect(router.state.location.pathname).toBe('/runs/run-replay-0004'));
  });

  it('says when the run has not finished yet', async () => {
    server.use(
      http.get(api('/api/runs/run-busy/report.json'), () =>
        HttpResponse.json({ error: 'run-not-finished', message: 'still running' }, { status: 409 }),
      ),
    );
    renderApp('/runs/run-busy/report');
    expect(await screen.findByText(/has not finished yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Follow the run' })).toHaveAttribute('href', '/runs/run-busy');
  });

  it('has no axe violations', async () => {
    serveReport();
    renderApp(`/runs/${FAIL_RUN}/report`);
    await screen.findByTestId('outcome-comparison');
    await expectNoAxeViolations();
  });

  it('is reachable from the run page', async () => {
    renderApp(`/runs/${FAIL_RUN}`);
    expect(await screen.findByRole('link', { name: 'Interoperability report of this run' })).toHaveAttribute(
      'href',
      `/runs/${FAIL_RUN}/report`,
    );
  });
});

describe('gap register', () => {
  it('lists the gaps of one matrix cell when opened from it', async () => {
    recordQueries('/api/gaps', gaps);
    renderApp(
      `/gaps?cell=${encodeURIComponent('ref-issuer/ref-wallet/inji-verify/vc+sd-jwt/inji-draft/happy')}`,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Interoperability gaps' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'G2 · did:web resolved only over https://' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('gap-cell-filter')).toBeInTheDocument();
  });
});

describe('tamper controls in the run bar', () => {
  const RUN_ID = 'run-tamper-0005';

  /** The events of a finished kb-wrong-nonce run that the verifier correctly rejected. */
  function finishedRun(): RunEvent[] {
    const config = {
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'ref-verifier',
      format: 'vc+sd-jwt',
      vciProfile: 'draft13',
      vpProfile: 'inji-draft',
      scenario: 'kb-wrong-nonce',
    };
    return RunEventSchema.array().parse([
      { type: 'run.started', runId: RUN_ID, config, at: '2026-10-04T12:00:00.000Z' },
      {
        type: 'run.finished',
        runId: RUN_ID,
        at: '2026-10-04T12:00:01.000Z',
        report: {
          ...failReport.report,
          runId: RUN_ID,
          scenario: { id: 'kb-wrong-nonce', expected: 'INVALID' },
          outcome: 'INVALID',
          verdict: 'pass',
          error: undefined,
        },
      },
    ]);
  }

  function streamRun(events: readonly RunEvent[]) {
    server.use(
      runSocketLink.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', (message) => {
          if (typeof message.data !== 'string') return;
          const data = JSON.parse(message.data) as { type: string; runId: string };
          if (data.type !== 'subscribe' || data.runId !== RUN_ID) return;
          for (const event of events) client.send(JSON.stringify(event));
        });
      }),
    );
  }

  async function chooseReferenceTrio(user: ReturnType<typeof renderApp>['user']) {
    await screen.findAllByRole('radio');
    await user.click(screen.getByRole('radio', { name: 'Reference issuer' }));
    await user.click(screen.getByRole('radio', { name: 'Reference wallet (headless)' }));
    await user.click(screen.getByRole('radio', { name: 'Reference verifier' }));
    await user.selectOptions(screen.getByLabelText('Credential format'), 'vc+sd-jwt');
  }

  it('shows the expected outcome before the run, sends the scenario, then shows expected and actual', async () => {
    const bodies: RunConfigInput[] = [];
    server.use(createRunHandler(RUN_ID, bodies));
    const compatibility: URLSearchParams[] = [];
    server.use(
      http.get(api('/api/compatibility'), ({ request }) => {
        compatibility.push(new URL(request.url).searchParams);
        return HttpResponse.json({ runnable: true, mode: 'reference', reasons: [] });
      }),
    );
    streamRun(finishedRun());
    const { user } = renderApp();
    await chooseReferenceTrio(user);

    const picker = screen.getByLabelText('Scenario');
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'Key binding with the wrong nonce' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(picker, 'kb-wrong-nonce');
    const expectation = screen.getByTestId('scenario-expectation');
    expect(expectation).toHaveTextContent('Key binding with the wrong nonce');
    expect(expectation).toHaveTextContent('Expected outcome: Invalid');
    expect(expectation).toHaveTextContent('RFC 9901 section 7.3 step 5f');
    expect(picker).toHaveAttribute('aria-describedby', expectation.id);
    // The server checks the scenario too (a tamper variant needs the reference roles).
    await waitFor(() => expect(compatibility.at(-1)?.get('scenario')).toBe('kb-wrong-nonce'));

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ format: 'vc+sd-jwt', scenario: 'kb-wrong-nonce' });

    const result = await screen.findByRole('region', {
      name: `Expected and actual outcome of run ${RUN_ID}`,
    });
    await waitFor(() => expect(within(result).getByTestId('actual-outcome')).toHaveTextContent('Invalid'));
    expect(within(result).getByTestId('expected-outcome')).toHaveTextContent('Invalid');
    expect(result).toHaveTextContent('The verifier answered exactly what this scenario requires.');
  });

  it('offers only the scenarios that fit the format, and falls back to the happy path', async () => {
    const { user } = renderApp();
    await chooseReferenceTrio(user);
    const picker = screen.getByLabelText('Scenario');
    await waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(3));
    await user.selectOptions(picker, 'kb-wrong-nonce');
    // kb-wrong-nonce applies to SD-JWT only.
    await user.selectOptions(screen.getByLabelText('Credential format'), 'ldp_vc');
    expect(within(picker).queryByRole('option', { name: 'Key binding with the wrong nonce' })).toBeNull();
    expect(picker).toHaveValue('happy');
  });
});
