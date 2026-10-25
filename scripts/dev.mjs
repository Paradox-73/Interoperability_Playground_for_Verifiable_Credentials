#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `npm run dev`: starts the playground server from source (reloads on change, port 28100) and the
 * Vite dev server for the UI (port 28173, forwards API and WebSocket calls to 28100).
 * Ctrl+C stops both. If either process exits, the other is stopped too.
 */
import { spawn, spawnSync } from 'node:child_process';

// Fixed command lines (no user input), run through a shell so `npm` resolves to npm.cmd on Windows.
const processes = [
  { name: 'server', color: 36, command: 'npm run dev -w @inji-playground/server' },
  { name: 'web', color: 35, command: 'npm run dev -w @inji-playground/web' },
];

/** Prefixes every output line with the process name, so the two logs can be told apart. */
function pipe(stream, target, label) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) target.write(`${label} ${line}\n`);
  });
  stream.on('end', () => pending && target.write(`${label} ${pending}\n`));
}

/** The shell starts npm, which starts node; on Windows only taskkill /T stops the whole tree. */
function stop(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

const children = processes.map(({ name, color, command }) => {
  const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const label = `\x1b[${color}m[${name}]\x1b[0m`;
  pipe(child.stdout, process.stdout, label);
  pipe(child.stderr, process.stderr, label);
  return child;
});

let exitCode = 0;
let stopping = false;
const stopAll = (code) => {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  children.forEach(stop);
};

for (const child of children) {
  child.on('exit', (code) => {
    stopAll(code ?? 0);
    if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) process.exit(exitCode);
  });
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
