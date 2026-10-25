// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `--reference`: a playground server started in this process, on the first free port of the range
 * reserved for test listeners (28600-28699), with an in-memory database and a temporary run directory,
 * so a matrix run leaves nothing behind and never touches a server the person has running on 28100.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, loadConfig } from '@inji-playground/server';

export const FIRST_PORT = 28_600;
export const LAST_PORT = 28_699;

export interface ReferenceServer {
  url: string;
  close(): Promise<void>;
}

export async function startReferenceServer(env: NodeJS.ProcessEnv = process.env): Promise<ReferenceServer> {
  const runDir = mkdtempSync(join(tmpdir(), 'ps02-matrix-'));
  const cleanup = () => rmSync(runDir, { recursive: true, force: true });
  try {
    for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
      const config = loadConfig({
        ...env,
        PLAYGROUND_RUN_DIR: runDir,
        PLAYGROUND_DB: ':memory:',
        PLAYGROUND_STACK: 'off',
        PLAYGROUND_LOG_LEVEL: env.PLAYGROUND_LOG_LEVEL ?? 'warn',
        PLAYGROUND_PORT: String(port),
        PLAYGROUND_HOST: '127.0.0.1',
      });
      // The reference roles advertise URLs on this port, so the app is built for it before listening.
      const app = await buildApp({ config });
      try {
        await app.listen({ port, host: config.host });
      } catch (error) {
        await app.close();
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
        throw error;
      }
      return {
        url: `http://127.0.0.1:${port}`,
        close: async () => {
          await app.close();
          cleanup();
        },
      };
    }
    throw new Error(`no free port in ${FIRST_PORT}-${LAST_PORT}`);
  } catch (error) {
    cleanup();
    throw error;
  }
}
