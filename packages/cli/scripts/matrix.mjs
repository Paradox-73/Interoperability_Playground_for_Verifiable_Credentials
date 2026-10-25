#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run matrix:<reference|live>`: runs the compatibility matrix headless and writes matrix.json,
 * matrix.md and the redacted run of every cell.
 *
 * - `reference`: `specs/reference.yaml` on an in-process server with the reference roles (no Docker), into
 *   docs/interop-report/reference/.
 * - `live`: a live spec (default `live-core`; `-- --spec live-holder-web` for the other) against the
 *   server at --server (default http://localhost:28100), which must be connected to the Inji stack. Each
 *   live spec writes to docs/interop-report/live/<spec>/, because the live specs run in separate stack
 *   sessions; then docs/interop-report/live/matrix.md is rewritten from every spec folder there.
 *
 * Extra arguments after `--` go to `inji-playground matrix` (for example `--junit <file>`, `--force`).
 */
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
if (mode !== 'reference' && mode !== 'live') {
  console.error('usage: node packages/cli/scripts/matrix.mjs <reference|live> [matrix options]');
  process.exit(2);
}

const cli = (args) =>
  spawnSync(
    process.execPath,
    ['--conditions=source', '--import', 'tsx', 'packages/cli/src/main.ts', ...args],
    { cwd: root, stdio: 'inherit', env: { NODE_NO_WARNINGS: '1', ...process.env } },
  ).status ?? 1;

const specIndex = rest.indexOf('--spec');
if (mode === 'reference') {
  const spec = specIndex >= 0 ? [] : ['--spec', 'reference'];
  process.exit(cli(['matrix', '--reference', ...spec, '--out', 'docs/interop-report/reference', ...rest]));
}

const specName = specIndex >= 0 ? rest[specIndex + 1] : 'live-core';
const spec = specIndex >= 0 ? [] : ['--spec', specName];
const folder = basename(specName ?? 'live-core').replace(/\.ya?ml$/, '');
const status = cli(['matrix', ...spec, '--out', `docs/interop-report/live/${folder}`, ...rest]);
// The index covers what has run so far, also when this spec did not go as specified.
const indexed = cli(['index', '--out', 'docs/interop-report/live']);
process.exit(status !== 0 ? status : indexed);
