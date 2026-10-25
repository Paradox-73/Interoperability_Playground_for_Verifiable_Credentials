// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The interoperability gap register, `docs/gaps/gaps.json`: real gaps found by playground runs, each
 * linked to the matrix cells that show it. The file is written by people (and checked by
 * `npm run docs:check`); the server only reads it, so a missing or half-edited file must never stop
 * the server: missing means an empty register, and entries that do not match the schema are left out
 * and listed as problems.
 */
import { readFileSync, statSync } from 'node:fs';
import { GapSchema, type Gap, type GapList, type MatrixCellKey } from '@inji-playground/protocol';
import { z } from 'zod';

/** What is published about a security-relevant gap until MOSIP agrees to disclose it. */
function privateView(gap: Gap): Gap {
  return {
    id: gap.id,
    title: 'Reported privately',
    repository: gap.repository,
    ...(gap.severity ? { severity: gap.severity } : {}),
    cells: [],
    disclosure: 'private',
  };
}

/** `issuer/wallet/verifier/format/vpProfile/scenario`: the id of a matrix cell. */
export function cellId(key: MatrixCellKey): string {
  return [key.issuer, key.wallet, key.verifier, key.format, key.vpProfile, key.scenario].join('/');
}

/**
 * True when `pattern` (a cell id in which `*` matches any segment, and trailing segments may be left
 * out) matches the cell.
 */
export function cellMatches(pattern: string, key: MatrixCellKey): boolean {
  const wanted = pattern.split('/');
  const actual = cellId(key).split('/');
  if (wanted.length > actual.length) return false;
  return wanted.every((segment, index) => segment === '*' || segment === actual[index]);
}

export class GapRegister {
  readonly #path: string;
  readonly #displayPath: string;
  #cache: { mtimeMs: number; list: GapList } | undefined;

  /**
   * @param path file to read
   * @param displayPath how the file is named in answers; by default `docs/gaps/gaps.json` or the file name,
   *   never an absolute path
   */
  constructor(path: string, displayPath?: string) {
    this.#path = path;
    // Answers name the file without the machine's directory layout.
    const normalised = path.replaceAll('\\', '/');
    this.#displayPath =
      displayPath ??
      (normalised.endsWith('docs/gaps/gaps.json')
        ? 'docs/gaps/gaps.json'
        : (normalised.split('/').at(-1) ?? normalised));
  }

  /** Every valid entry, private ones reduced to id, repository and severity. Re-read when the file changes. */
  list(): GapList {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.#path).mtimeMs;
    } catch {
      return { source: null, gaps: [], problems: [] };
    }
    if (this.#cache?.mtimeMs === mtimeMs) return this.#cache.list;
    const list = this.#read();
    this.#cache = { mtimeMs, list };
    return list;
  }

  /** Ids of the public gaps linked to a matrix cell. */
  gapIdsFor(key: MatrixCellKey): string[] {
    return this.list()
      .gaps.filter(
        (gap) => gap.disclosure === 'public' && gap.cells.some((pattern) => cellMatches(pattern, key)),
      )
      .map((gap) => gap.id);
  }

  #read(): GapList {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.#path, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        source: this.#displayPath,
        gaps: [],
        problems: [{ index: -1, message: `unreadable: ${message}` }],
      };
    }
    // Either a bare array or `{ "gaps": [...] }`, so the file can carry its own description.
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { gaps?: unknown }).gaps)
        ? (parsed as { gaps: unknown[] }).gaps
        : undefined;
    if (!entries) {
      return {
        source: this.#displayPath,
        gaps: [],
        problems: [{ index: -1, message: 'expected an array of gaps or an object with a "gaps" array' }],
      };
    }
    const gaps: Gap[] = [];
    const problems: GapList['problems'] = [];
    entries.forEach((entry, index) => {
      const result = GapSchema.safeParse(entry);
      if (!result.success) {
        problems.push({ index, message: z.prettifyError(result.error) });
        return;
      }
      gaps.push(result.data.disclosure === 'private' ? privateView(result.data) : result.data);
    });
    return { source: this.#displayPath, gaps, problems };
  }
}
