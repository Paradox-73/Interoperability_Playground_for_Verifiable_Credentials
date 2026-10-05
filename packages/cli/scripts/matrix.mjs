#!/usr/bin/env node
/**
 * `npm run matrix:<reference|live>`: runs the compatibility matrix headless and writes matrix.json,
 * matrix.md and the redacted run of every cell to docs/interop-report/<reference|live>/.
 *
 * - `reference`: `specs/reference.yaml` on an in-process server with the reference roles (no Docker).
 * - `live`: a live spec (default `live-core`; `-- --spec live-holder-web` for the other) against the
 *   server at --server (default http://localhost:28100), which must be connected to the Inji stack.
 *
 * Extra arguments after `--` go to `inji-playground matrix` (for example `--junit <file>`, `--force`).
 * The two modes write to different folders, so they never overwrite each other.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
if (mode !== 'reference' && mode !== 'live') {
  console.error('usage: node packages/cli/scripts/matrix.mjs <reference|live> [matrix options]');
  process.exit(2);
}

const hasSpec = rest.includes('--spec');
const args =
  mode === 'reference'
    ? [
        'matrix',
        '--reference',
        ...(hasSpec ? [] : ['--spec', 'reference']),
        '--out',
        'docs/interop-report/reference',
      ]
    : ['matrix', ...(hasSpec ? [] : ['--spec', 'live-core']), '--out', 'docs/interop-report/live'];

const result = spawnSync(
  process.execPath,
  ['--conditions=source', '--import', 'tsx', 'packages/cli/src/main.ts', ...args, ...rest],
  { cwd: root, stdio: 'inherit', env: { NODE_NO_WARNINGS: '1', ...process.env } },
);
process.exit(result.status ?? 1);
