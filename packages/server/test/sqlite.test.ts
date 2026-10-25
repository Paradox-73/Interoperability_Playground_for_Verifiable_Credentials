// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The store uses Node's built-in SQLite module (`node:sqlite`) instead of a native add-on. It was
 * measured under plain Node 24 first; these tests prove it also loads inside the Vitest runner and
 * supports what the store needs: JSON functions and write-ahead logging on a file database.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';

describe('node:sqlite under Vitest', () => {
  it('opens an in-memory database, writes and reads JSON rows', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE runs (id TEXT PRIMARY KEY, report TEXT NOT NULL)');
    db.prepare('INSERT INTO runs (id, report) VALUES (?, ?)').run('r1', JSON.stringify({ verdict: 'pass' }));
    const row = db
      .prepare("SELECT json_extract(report, '$.verdict') AS verdict FROM runs WHERE id = ?")
      .get('r1');
    expect(row).toEqual({ verdict: 'pass' });

    const version = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
    const [major = 0, minor = 0] = version.v.split('.').map(Number);
    // JSON functions are built in from 3.38; jsonb from 3.45.
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(3045);
    db.close();
  });

  const dir = mkdtempSync(join(tmpdir(), 'ps02-sqlite-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('switches a file database to write-ahead logging', () => {
    const db = new DatabaseSync(join(dir, 'playground.db'));
    const mode = db.prepare('PRAGMA journal_mode = WAL').get() as { journal_mode: string };
    expect(mode.journal_mode).toBe('wal');
    db.close();
  });
});
