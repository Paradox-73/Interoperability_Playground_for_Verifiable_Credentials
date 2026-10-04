/**
 * The gap register: a missing file, valid, invalid and private entries, re-reading after an edit,
 * cell patterns, and `GET /api/gaps`.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GapListSchema, type MatrixCellKey } from '@inji-playground/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { GapRegister, cellId, cellMatches } from '../src/gaps/register.js';
import { buildTestApp } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'ps02-gaps-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const KEY: MatrixCellKey = {
  issuer: 'inji-certify',
  wallet: 'ref-wallet',
  verifier: 'inji-verify',
  format: 'ldp_vc',
  vpProfile: 'inji-draft',
  scenario: 'happy',
};

const ENTRIES = [
  {
    id: 'G2',
    title: 'did:web of Certify not resolved by Inji Verify',
    repository: 'mosip/inji-verify',
    version: '0.18.2',
    severity: 'high',
    status: 'new',
    cells: ['inji-certify/*/inji-verify/ldp_vc'],
  },
  {
    id: 'G7',
    title: 'secret detail',
    repository: 'mosip/inji-verify',
    severity: 'critical',
    disclosure: 'private',
    cells: ['*'],
  },
  { id: 'broken', repository: 'x' },
];

describe('cell patterns', () => {
  it('match by segment with * wildcards and optional trailing segments', () => {
    expect(cellId(KEY)).toBe('inji-certify/ref-wallet/inji-verify/ldp_vc/inji-draft/happy');
    expect(cellMatches('inji-certify/*/inji-verify/ldp_vc', KEY)).toBe(true);
    expect(cellMatches('*/*/*/ldp_vc/inji-draft/happy', KEY)).toBe(true);
    expect(cellMatches('*/*/*/vc+sd-jwt', KEY)).toBe(false);
    expect(cellMatches('inji-certify/ref-wallet/inji-verify/ldp_vc/inji-draft/happy/extra', KEY)).toBe(false);
  });
});

describe('GapRegister', () => {
  it('treats a missing file as an empty register', () => {
    expect(new GapRegister(join(dir, 'none.json')).list()).toEqual({ source: null, gaps: [], problems: [] });
  });

  it('keeps valid entries, reduces private ones, lists invalid ones as problems and links cells', () => {
    const file = join(dir, 'gaps.json');
    writeFileSync(file, JSON.stringify({ description: 'register', gaps: ENTRIES }));
    const register = new GapRegister(file);
    const list = GapListSchema.parse(register.list());
    expect(list.source).toBe('gaps.json');
    expect(list.gaps.map((gap) => gap.id)).toEqual(['G2', 'G7']);
    expect(list.gaps[1]).toEqual({
      id: 'G7',
      title: 'Reported privately',
      repository: 'mosip/inji-verify',
      severity: 'critical',
      cells: [],
      disclosure: 'private',
    });
    expect(JSON.stringify(list)).not.toContain('secret detail');
    expect(list.problems).toHaveLength(1);
    expect(list.problems[0]?.index).toBe(2);
    expect(register.gapIdsFor(KEY)).toEqual(['G2']);
    expect(register.gapIdsFor({ ...KEY, format: 'vc+sd-jwt' })).toEqual([]);
  });

  it('re-reads the file after it changes and reports unreadable JSON', () => {
    const file = join(dir, 'edited.json');
    writeFileSync(file, JSON.stringify([ENTRIES[0]]));
    const register = new GapRegister(file);
    expect(register.list().gaps).toHaveLength(1);
    writeFileSync(file, '{ not json');
    // Make sure the modification time differs even on coarse file systems.
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const broken = register.list();
    expect(broken.gaps).toEqual([]);
    expect(broken.problems[0]?.message).toMatch(/^unreadable/);
  });

  it('names the default register by its repository path, never by an absolute path', () => {
    const nested = join(dir, 'docs', 'gaps');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'gaps.json'), '[]');
    expect(new GapRegister(join(nested, 'gaps.json')).list().source).toBe('docs/gaps/gaps.json');
  });
});

describe('GET /api/gaps', () => {
  it('serves the register named by PLAYGROUND_GAPS_FILE', async () => {
    const file = join(dir, 'served.json');
    writeFileSync(file, JSON.stringify(ENTRIES.slice(0, 1)));
    const app = await buildTestApp({ env: { PLAYGROUND_GAPS_FILE: file } });
    try {
      const res = await app.inject('/api/gaps');
      expect(res.statusCode).toBe(200);
      const body = GapListSchema.parse(res.json());
      expect(body.gaps[0]).toMatchObject({
        id: 'G2',
        cells: ['inji-certify/*/inji-verify/ldp_vc'],
        disclosure: 'public',
      });
    } finally {
      await app.close();
    }
  });
});
