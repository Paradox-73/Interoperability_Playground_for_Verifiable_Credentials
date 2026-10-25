// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run openapi`: writes the OpenAPI document generated from the route schemas to
 * docs/api/openapi.json, so readers can browse the API without starting the server.
 *
 * The app is built with an in-memory database and no roles; nothing listens on a port. The output is
 * stable (keys in generation order, two-space indent, trailing newline), so a diff of the file shows
 * exactly which routes or schemas changed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const target = join(repoRoot, 'docs', 'api', 'openapi.json');

const app = await buildApp({
  config: loadConfig({
    PLAYGROUND_DB: ':memory:',
    PLAYGROUND_WEB_DIST: '/nonexistent',
    PLAYGROUND_LOG_LEVEL: 'silent',
  }),
  logger: false,
});
try {
  await app.ready();
  const document = app.swagger() as { paths?: Record<string, unknown> };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  const paths = Object.keys(document.paths ?? {}).length;
  console.log(`wrote ${relative(repoRoot, target).replaceAll('\\', '/')} (${paths} paths)`);
} finally {
  await app.close();
}
