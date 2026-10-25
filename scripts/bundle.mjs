#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run up` / `npm run down`: the one-command bundle (deploy/compose.yaml, Docker Compose project
 * ps02-bundle): the local Inji stack plus the playground container on http://localhost:28100.
 *
 *   npm run up                     build the playground image from the last commit (git archive HEAD), start
 *                                  the stack and the playground, wait until everything answers
 *   npm run up -- --worktree       build from the working tree instead (includes uncommitted changes)
 *   npm run up -- --build-only     build the image and stop there (no containers are started)
 *   npm run up -- --no-build       start with the image that is already there
 *   npm run down                   stop and remove the containers and volumes (--keep-volumes keeps data)
 *
 * Building from `git archive HEAD` keeps unfinished work in the shared working tree out of the image.
 * Profiles: PLAYGROUND_STACK_PROFILES as for the stack (default holder-web,verify-ui).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { docker, dockerOrThrow } from '../deploy/inji-stack/scripts/lib/docker.mjs';
import {
  REPO_ROOT,
  hostUrls,
  runDir,
  selectedProfiles,
  stackRunDir,
} from '../deploy/inji-stack/scripts/lib/env.mjs';
import { request, waitFor } from '../deploy/inji-stack/scripts/lib/http.mjs';
import { probesFor, runProbe } from '../deploy/inji-stack/scripts/lib/services.mjs';

const PROJECT = 'ps02-bundle';
const BUNDLE_FILE = resolve(REPO_ROOT, 'deploy/compose.yaml');
const IMAGE = process.env.PLAYGROUND_IMAGE ?? 'ps02-playground:bundle';
const PLAYGROUND_URL = process.env.PLAYGROUND_URL ?? 'http://localhost:28100';
const WAIT_TIMEOUT_MS = 10 * 60_000;

const log = (line) => console.log(`[bundle] ${line}`);
const seconds = (ms) => `${(ms / 1000).toFixed(0)} s`;

/** Global compose arguments of the bundle project. */
function bundleArgs({ profiles = [], allProfiles = false } = {}) {
  const args = ['compose', '-p', PROJECT, '-f', BUNDLE_FILE];
  if (allProfiles) args.push('--profile', '*');
  else for (const profile of profiles) args.push('--profile', profile);
  return args;
}

/** Builds the playground image from the committed tree: `git archive HEAD | docker build -`. */
async function buildFromHead() {
  const head = await new Promise((resolvePromise, reject) => {
    const git = spawn('git', ['-C', REPO_ROOT, 'rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    git.stdout.on('data', (c) => (out += c));
    git.on('error', reject);
    git.on('close', (code) =>
      code === 0 ? resolvePromise(out.trim()) : reject(new Error('git rev-parse failed')),
    );
  });
  log(`build: ${IMAGE} from commit ${head} (git archive HEAD)`);
  const archive = spawn('git', ['-C', REPO_ROOT, 'archive', '--format=tar', 'HEAD'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const archiveDone = new Promise((resolvePromise, reject) => {
    archive.on('error', reject);
    archive.on('close', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`git archive exited with ${code}`)),
    );
  });
  const built = await docker(
    ['build', '-t', IMAGE, '--label', `org.opencontainers.image.revision=${head}`, '-'],
    {
      input: archive.stdout,
    },
  );
  await archiveDone;
  if (built.code !== 0) throw new Error(`docker build exited with ${built.code}`);
}

async function buildFromWorktree() {
  log(`build: ${IMAGE} from the working tree`);
  await dockerOrThrow(['build', '-t', IMAGE, REPO_ROOT]);
}

async function waitUntilReady(profiles, started) {
  const probes = [
    ...probesFor(hostUrls(), profiles),
    { service: 'playground', label: 'Playground /api/health', url: `${PLAYGROUND_URL}/api/health` },
  ];
  const caFile = `${stackRunDir()}/ca/ps02-test-ca.crt`;
  for (const probe of probes) {
    await waitFor(probe.label, async () => (await runProbe(probe, { caFile })).status === 200, {
      timeoutMs: WAIT_TIMEOUT_MS,
      intervalMs: 5_000,
    });
    log(`ready: ${probe.label} (${seconds(Date.now() - started)})`);
  }
}

async function up(flags) {
  const profiles = selectedProfiles();
  if (!flags.has('--no-build')) {
    if (flags.has('--worktree')) await buildFromWorktree();
    else await buildFromHead();
  }
  if (flags.has('--build-only')) {
    log(`build only: ${IMAGE} is ready; start with npm run up -- --no-build`);
    return;
  }
  for (const sub of ['ca', 'ca-private', 'tls', 'mimoto'])
    mkdirSync(`${stackRunDir()}/${sub}`, { recursive: true });
  const started = Date.now();
  log(
    `up: stack (core${profiles.length ? ` + ${profiles.join(', ')}` : ''}) and playground, project ${PROJECT}`,
  );
  // --no-build: the image was built above from the chosen source; compose must not rebuild it from the tree.
  await dockerOrThrow([...bundleArgs({ profiles }), 'up', '--detach', '--no-build', '--remove-orphans'], {
    env: { ...process.env, PLAYGROUND_RUN_DIR: runDir(), PLAYGROUND_IMAGE: IMAGE },
  });
  await waitUntilReady(profiles, started);
  const health = await request('health', `${PLAYGROUND_URL}/api/health`);
  log(`playground: ${PLAYGROUND_URL} ${JSON.stringify(health.body)}`);
  log(`bundle is up after ${seconds(Date.now() - started)}; stop it with npm run down`);
}

async function down(flags) {
  log('down: removing the bundle containers' + (flags.has('--keep-volumes') ? '' : ' and volumes'));
  const args = [...bundleArgs({ allProfiles: true }), 'down', '--remove-orphans'];
  if (!flags.has('--keep-volumes')) args.push('--volumes');
  await dockerOrThrow(args, { env: { ...process.env, PLAYGROUND_RUN_DIR: runDir() } });
}

async function main([command, ...rest]) {
  const flags = new Set(rest);
  if (command === 'up') return up(flags);
  if (command === 'down') return down(flags);
  throw new Error('usage: bundle.mjs <up|down> [--build-only|--worktree|--no-build|--keep-volumes]');
}

main(process.argv.slice(2)).then(
  () => process.exit(0),
  (error) => {
    console.error(`[bundle] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
