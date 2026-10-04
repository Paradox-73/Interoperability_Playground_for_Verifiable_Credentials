import exampleRun from '@inji-playground/protocol/fixtures/example-run.synthetic.json';
import { RunEventSchema, type RunEvent } from '@inji-playground/protocol';
import { describe, expect, it } from 'vitest';
import { applyRunEvent, buildRunView, emptyRunView, formatDuration } from './run-view';

const EVENTS: RunEvent[] = RunEventSchema.array().parse(exampleRun.events);
const RUN_ID = 'example-run-0001';
const at = (ms: number) => new Date(Date.UTC(2026, 9, 4, 10, 0, 0, ms)).toISOString();

describe('buildRunView', () => {
  it('turns the synthetic example run into eight finished steps with a passing report', () => {
    const view = buildRunView(RUN_ID, EVENTS);
    expect(view.config?.format).toBe('vc+sd-jwt');
    expect(view.rows.map((row) => row.step)).toEqual([
      'issuer.offer',
      'issuer.metadata',
      'token',
      'credential',
      'verifier.request',
      'wallet.fetch-request',
      'wallet.submit',
      'verifier.result',
    ]);
    expect(view.rows.every((row) => row.status === 'ok' && row.durationMs !== undefined)).toBe(true);
    expect(view.exchangeCount).toBe(7);
    expect(view.finished).toBe(true);
    expect(view.report?.verdict).toBe('pass');
  });

  it('keeps the server label and adds the protocol term and specification of each step', () => {
    const [offer] = buildRunView(RUN_ID, EVENTS).rows;
    expect(offer?.label).toBe('Issuer prepares a credential offer for the wallet');
    expect(offer?.protocolTerm).toBe('Credential Offer');
    expect(offer?.spec?.section).toBe('Credential Offer');
  });

  it('ignores events of other runs', () => {
    const view = emptyRunView(RUN_ID);
    const other: RunEvent = { type: 'step.started', runId: 'other', step: 'token', label: 'x', at: at(0) };
    expect(applyRunEvent(view, other)).toBe(view);
  });

  it('records a failed step with its error and duration', () => {
    const view = buildRunView(RUN_ID, [
      { type: 'step.started', runId: RUN_ID, step: 'token', label: 'Token', at: at(0) },
      {
        type: 'step.finished',
        runId: RUN_ID,
        step: 'token',
        status: 'failed',
        error: { code: 'http.400', message: 'invalid_grant' },
        at: at(250),
      },
    ]);
    expect(view.rows[0]).toMatchObject({ status: 'failed', durationMs: 250, error: { code: 'http.400' } });
  });

  it('gives a repeated step its own row and closes the latest open one', () => {
    const view = buildRunView(RUN_ID, [
      { type: 'step.started', runId: RUN_ID, step: 'token', label: 'Token', at: at(0) },
      { type: 'step.finished', runId: RUN_ID, step: 'token', status: 'failed', at: at(10) },
      { type: 'step.started', runId: RUN_ID, step: 'token', label: 'Token again', at: at(20) },
      { type: 'step.finished', runId: RUN_ID, step: 'token', status: 'ok', at: at(50) },
    ]);
    expect(view.rows.map((row) => [row.label, row.status, row.durationMs])).toEqual([
      ['Token', 'failed', 10],
      ['Token again', 'ok', 30],
    ]);
    expect(new Set(view.rows.map((row) => row.key)).size).toBe(2);
  });

  it('adds a row for a step that finishes without having started', () => {
    const view = buildRunView(RUN_ID, [
      { type: 'step.finished', runId: RUN_ID, step: 'nonce', status: 'skipped', at: at(0) },
    ]);
    expect(view.rows[0]).toMatchObject({ step: 'nonce', status: 'skipped', protocolTerm: 'Nonce Request' });
  });

  it('marks the person step as waiting while a person must act', () => {
    const view = buildRunView(RUN_ID, [
      { type: 'step.started', runId: RUN_ID, step: 'person.action', label: 'Scan the QR code', at: at(0) },
      {
        type: 'person.action-needed',
        runId: RUN_ID,
        action: {
          id: 'a1',
          kind: 'scan-offer',
          title: 'Scan the credential offer with your wallet',
          instructions: ['Open the wallet', 'Scan the code'],
          timeoutMs: 600_000,
        },
      },
    ]);
    expect(view.rows[0]?.status).toBe('waiting');
    expect(view.rows[0]?.personAction?.title).toBe('Scan the credential offer with your wallet');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 ms'],
    [850.4, '850 ms'],
    [1234, '1.2 s'],
    [12_345, '12 s'],
    [125_999, '2 min 5 s'],
  ])('%d ms -> %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
