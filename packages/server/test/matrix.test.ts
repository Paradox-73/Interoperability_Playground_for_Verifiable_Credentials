/**
 * The compatibility matrix: newest finished run per cell with counts, cells from the compatibility
 * check (untested, or not supported with reasons), gap links, filters, the dated Markdown rendering
 * and the route.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatrixSchema, type MatrixQuery, type ScenarioSpec } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildMatrix } from '../src/matrix/matrix.js';
import { renderMatrixMarkdown } from '../src/matrix/markdown.js';
import { RunStore } from '../src/store/run-store.js';
import { FAKE_CELL, buildTestApp, fakeSet, registrations } from './helpers.js';
import { descriptor, seedRun } from './run-fixtures.js';

const dir = mkdtempSync(join(tmpdir(), 'ps02-matrix-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const HAPPY: ScenarioSpec = {
  id: 'happy',
  title: 'Happy path',
  description: 'd',
  expected: 'VALID',
  target: 'none',
};
const EXPIRED: ScenarioSpec = {
  id: 'tamper.expired',
  title: 'Expired',
  description: 'd',
  expected: 'EXPIRED',
  target: 'credential',
};
const scenarios = [HAPPY, EXPIRED];
const findScenario = (id: string) => scenarios.find((scenario) => scenario.id === id);

const ROLES = [
  descriptor('ref-issuer', 'issuer', ['ldp_vc', 'vc+sd-jwt']),
  descriptor('ref-wallet', 'wallet', ['ldp_vc', 'vc+sd-jwt']),
  descriptor('ref-verifier', 'verifier', ['ldp_vc', 'vc+sd-jwt'], {
    vpProfiles: ['inji-draft', 'final-1.0'],
  }),
  descriptor('inji-verify', 'verifier', ['ldp_vc', 'vc+sd-jwt'], { vpProfiles: ['inji-draft'] }),
];

function query(overrides: Partial<MatrixQuery> = {}): MatrixQuery {
  return { format: 'json', scenario: 'happy', hideNotSupported: false, ...overrides };
}

function seeded(): RunStore {
  const store = RunStore.open(':memory:');
  // Same cell three times: fail, pass, then fail again (newest).
  seedRun(store, {
    id: 'a1',
    createdAt: '2026-10-01T10:00:00.000Z',
    report: { verdict: 'fail', outcome: 'INVALID' },
  });
  seedRun(store, { id: 'a2', createdAt: '2026-10-02T10:00:00.000Z' });
  seedRun(store, {
    id: 'a3',
    createdAt: '2026-10-03T10:00:00.000Z',
    report: {
      verdict: 'fail',
      outcome: 'ERROR',
      error: { step: 'wallet.submit', code: 'http.400', message: 'presentation rejected' },
    },
  });
  // Another cell, a tamper scenario, that passed.
  seedRun(store, {
    id: 'b1',
    createdAt: '2026-10-02T11:00:00.000Z',
    config: { scenario: 'tamper.expired' },
    report: { outcome: 'EXPIRED', verdict: 'pass', scenario: { id: 'tamper.expired', expected: 'EXPIRED' } },
  });
  // A run of a role that is no longer registered.
  seedRun(store, { id: 'c1', createdAt: '2026-10-02T12:00:00.000Z', config: { wallet: 'old-wallet' } });
  // Unfinished runs never count.
  seedRun(store, { id: 'd1', createdAt: '2026-10-04T10:00:00.000Z', unfinished: true });
  return store;
}

describe('buildMatrix', () => {
  it('keeps the newest finished run per cell with counts of all its runs', () => {
    const store = seeded();
    const matrix = MatrixSchema.parse(
      buildMatrix({
        query: query(),
        roles: ROLES,
        stored: store.latestRunPerCell(),
        findScenario,
        gapIdsFor: () => [],
        playgroundVersion: '0.1.0',
        now: new Date('2026-10-04T12:00:00Z'),
      }),
    );
    const cell = matrix.cells.find(
      (entry) => entry.id === 'ref-issuer/ref-wallet/ref-verifier/vc+sd-jwt/inji-draft/happy',
    );
    expect(cell).toMatchObject({
      status: 'fail',
      source: 'run',
      latestRun: { runId: 'a3', outcome: 'ERROR', error: { code: 'http.400' } },
      counts: { runs: 3, pass: 1, fail: 2, error: 0, notSupported: 0 },
    });
    const tamper = matrix.cells.find((entry) => entry.key.scenario === 'tamper.expired');
    expect(tamper).toMatchObject({ status: 'pass', latestRun: { runId: 'b1' } });
    const orphan = matrix.cells.find((entry) => entry.key.wallet === 'old-wallet');
    expect(orphan).toMatchObject({ status: 'pass', reasons: [] });
    expect(matrix.roles.find((role) => role.id === 'old-wallet')).toMatchObject({
      registered: false,
      kind: 'wallet',
    });
    expect(matrix.cells.some((entry) => entry.latestRun?.runId === 'd1')).toBe(false);
    store.close();
  });

  it('adds every other combination from the compatibility check: untested, or not supported with reasons', () => {
    const store = seeded();
    const matrix = buildMatrix({
      query: query(),
      roles: ROLES,
      stored: store.latestRunPerCell(),
      findScenario,
      gapIdsFor: () => [],
      playgroundVersion: '0.1.0',
    });
    // 1 issuer x 1 wallet x 2 verifiers x 4 formats x 2 profiles = 16 happy cells, plus 2 stored cells of other kinds.
    expect(matrix.cells).toHaveLength(18);
    const untested = matrix.cells.find(
      (entry) => entry.id === 'ref-issuer/ref-wallet/ref-verifier/ldp_vc/final-1.0/happy',
    );
    expect(untested).toMatchObject({ status: 'untested', source: 'compatibility', counts: { runs: 0 } });
    const mdoc = matrix.cells.find(
      (entry) => entry.id === 'ref-issuer/ref-wallet/inji-verify/mso_mdoc/inji-draft/happy',
    );
    expect(mdoc?.status).toBe('not-supported');
    expect(mdoc?.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'issuer.format-unsupported',
        'wallet.format-unsupported',
        'verifier.format-unsupported',
      ]),
    );
    expect(mdoc?.reasons[0]?.message).toContain('does not support the format mso_mdoc');
    const profile = matrix.cells.find(
      (entry) => entry.id === 'ref-issuer/ref-wallet/inji-verify/vc+sd-jwt/final-1.0/happy',
    );
    expect(profile?.status).toBe('not-supported');
    expect(profile?.reasons[0]).toMatchObject({
      code: 'verifier.vp-profile-unsupported',
      severity: 'blocking',
    });
    expect(matrix.totals).toMatchObject({ cells: 18, pass: 2, fail: 1, notSupported: 10, untested: 5 });

    const hidden = buildMatrix({
      query: query({ hideNotSupported: true }),
      roles: ROLES,
      stored: store.latestRunPerCell(),
      findScenario,
      gapIdsFor: () => [],
      playgroundVersion: '0.1.0',
    });
    expect(hidden.cells.some((entry) => entry.status === 'not-supported')).toBe(false);
    store.close();
  });

  it('applies role, format and profile filters, and links gaps to cells', () => {
    const store = seeded();
    const matrix = buildMatrix({
      query: query({ verifier: 'inji-verify', credentialFormat: 'ldp_vc', vpProfile: 'inji-draft' }),
      roles: ROLES,
      stored: store.latestRunPerCell({ verifier: 'inji-verify', format: 'ldp_vc' }),
      findScenario,
      gapIdsFor: (key) => (key.verifier === 'inji-verify' && key.format === 'ldp_vc' ? ['G2'] : []),
      playgroundVersion: '0.1.0',
    });
    expect(matrix.cells.map((entry) => entry.id)).toEqual([
      'ref-issuer/ref-wallet/inji-verify/ldp_vc/inji-draft/happy',
    ]);
    expect(matrix.cells[0]?.gapIds).toEqual(['G2']);
    store.close();
  });

  it('renders a dated Markdown matrix with versions, results and not-supported reasons', () => {
    const store = seeded();
    const markdown = renderMatrixMarkdown(
      buildMatrix({
        query: query(),
        roles: ROLES,
        stored: store.latestRunPerCell(),
        findScenario,
        gapIdsFor: () => [],
        playgroundVersion: '0.1.0',
        now: new Date('2026-10-04T12:00:00Z'),
      }),
    );
    expect(markdown).toContain('# Compatibility matrix');
    expect(markdown).toContain('Generated 2026-10-04T12:00:00.000Z');
    expect(markdown).toContain('| verifier | `inji-verify` | Inji Verify | 0.1.0 | inji |');
    expect(markdown).toContain(
      '| `ref-issuer` | `ref-wallet` | `ref-verifier` | `vc+sd-jwt` | inji-draft | happy | FAIL | ERROR | EdDSA | 3 (1/2/0) |',
    );
    expect(markdown).toContain('`http.400` at wallet.submit: presentation rejected');
    expect(markdown).toContain('NOT RUN YET');
    expect(markdown).toContain('## Not supported');
    expect(markdown).toMatch(
      /\| `ref-issuer` \| `ref-wallet` \| `inji-verify` \| `mso_mdoc` \| inji-draft \| Reference issuer does not support the format mso_mdoc/,
    );
    store.close();
  });
});

describe('GET /api/matrix', () => {
  it('answers JSON and Markdown from runs made through the API, linked to the gap register', async () => {
    const gapsFile = join(dir, 'gaps.json');
    writeFileSync(
      gapsFile,
      JSON.stringify([
        {
          id: 'G9',
          title: 'mdoc missing',
          repository: 'mosip/inji-verify',
          cells: ['*/*/fake-verifier/mso_mdoc'],
        },
      ]),
    );
    const { roles } = fakeSet({ issuer: { formats: ['vc+sd-jwt', 'ldp_vc'] } });
    // Only the fake trio: the built-in roles would add their own combinations to the matrix.
    app = await buildTestApp({
      roles: registrations(roles),
      builtInRoles: false,
      env: { PLAYGROUND_GAPS_FILE: gapsFile },
    });
    const created = await app.inject({ method: 'POST', url: '/api/runs', payload: FAKE_CELL });
    await app.playground.orchestrator.wait(created.json<{ runId: string }>().runId);

    const res = await app.inject('/api/matrix?vpProfile=inji-draft');
    expect(res.statusCode, res.body).toBe(200);
    const matrix = MatrixSchema.parse(res.json());
    expect(matrix.cells).toHaveLength(4);
    expect(matrix.cells.find((entry) => entry.key.format === 'vc+sd-jwt')).toMatchObject({
      status: 'pass',
      source: 'run',
    });
    expect(matrix.cells.find((entry) => entry.key.format === 'ldp_vc')?.status).toBe('untested');
    const mdoc = matrix.cells.find((entry) => entry.key.format === 'mso_mdoc');
    expect(mdoc).toMatchObject({ status: 'not-supported', gapIds: ['G9'] });

    const md = await app.inject('/api/matrix?format=md');
    expect(md.statusCode).toBe(200);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.body).toMatch(/^# Compatibility matrix/);

    expect((await app.inject('/api/matrix?scenario=no.such')).statusCode).toBe(400);
    expect((await app.inject('/api/matrix?format=xml')).statusCode).toBe(400);
  });
});
