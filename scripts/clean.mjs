#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run clean` (after `tsc -b --clean`): removes build output that TypeScript does not track,
 * so the next build starts from nothing. Never touches node_modules or the run directory.
 */
import { rmSync } from 'node:fs';

const paths = [
  'packages/web/dist',
  'coverage',
  'packages/web/playwright-report',
  'packages/web/test-results',
];
for (const path of paths) rmSync(path, { recursive: true, force: true });
console.log(`removed: ${paths.join(', ')}`);
