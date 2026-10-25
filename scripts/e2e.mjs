#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run e2e`: the Playwright browser tests of project `e2e`, in reference mode (no Docker). Builds
 * every package, starts the playground server on a free port of 28600-28699 (in-memory database, no
 * Inji stack) and the UI with `vite preview` on 28174, which forwards /api, /ws, /ref, /v1/verify and
 * /proxy to that server; runs the tests; stops both, whatever the result.
 *
 * `npm run e2e:live`: project `e2e-live` against a running bundle or host-mode server
 * (PLAYWRIGHT_BASE_URL, default http://localhost:28100); nothing is started. With the holder-web profile it
 * also drives Inji Web's own pages on 28004 (e2e/live/inji-web-ui.spec.ts).
 *
 * Options: `--no-build` (reuse the last build), `--screenshots` (write the UX screenshots to
 * docs/ux/screenshots/); anything else goes to `playwright test`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = `${root}packages/web`;
const args = process.argv.slice(2);
const live = args.includes('--live');
const build = !args.includes('--no-build');
const screenshots = args.includes('--screenshots');
const passThrough = args.filter((arg) => !['--live', '--no-build', '--screenshots'].includes(arg));
const playwrightCli = `${root}node_modules/@playwright/test/cli.js`;

function playwright(project, env, extra = []) {
  const result = spawnSync(
    process.execPath,
    [playwrightCli, 'test', ...extra, ...passThrough, '--project', project],
    {
      cwd: web,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    },
  );
  return result.status ?? 1;
}

// The bundle or a host-mode server answers on 28100; the config's default is the Vite preview of `npm run e2e`.
// One worker: the live tests share one stack, and the server runs live runs one at a time anyway.
if (live) {
  process.exit(
    playwright(
      'e2e-live',
      {
        PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:28100',
        ...(screenshots ? { E2E_SCREENSHOTS: `${root}docs/ux/screenshots` } : {}),
      },
      ['--workers=1'],
    ),
  );
}

function freePort(from, to) {
  return new Promise((resolve, reject) => {
    const attempt = (port) => {
      if (port > to) return reject(new Error(`no free port in ${from}-${to}`));
      const probe = createServer();
      probe.once('error', () => attempt(port + 1));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(port)));
    };
    attempt(from);
  });
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline)
      throw new Error(`${label} did not answer at ${url} within ${timeoutMs / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

if (build) {
  const built = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const port = await freePort(28_600, 28_699);
const serverUrl = `http://localhost:${port}`;
const children = [];
const stop = () => {
  for (const child of children) if (child.exitCode === null) child.kill();
};
process.on('exit', stop);

children.push(
  spawn(process.execPath, [`${root}packages/server/dist/main.js`], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      PLAYGROUND_PORT: String(port),
      PLAYGROUND_DB: ':memory:',
      PLAYGROUND_STACK: 'off',
      PLAYGROUND_LOG_LEVEL: 'warn',
      NODE_NO_WARNINGS: '1',
    },
  }),
);
children.push(
  spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview'], {
    cwd: web,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PLAYGROUND_SERVER_URL: serverUrl },
  }),
);

let status = 1;
try {
  await waitFor(`${serverUrl}/api/health`, 'playground server');
  await waitFor('http://localhost:28174/', 'vite preview');
  status = playwright('e2e', {
    E2E_SERVER_URL: serverUrl,
    ...(screenshots ? { E2E_SCREENSHOTS: `${root}docs/ux/screenshots` } : {}),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  stop();
}
process.exit(status);
