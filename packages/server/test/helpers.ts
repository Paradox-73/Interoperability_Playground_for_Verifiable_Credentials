// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Shared set-up for the server tests: an app on an in-memory database with fake roles, and a free TCP
 * port inside the range reserved for test listeners (28600-28699).
 */
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AnyRole, ScenarioSpec } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import {
  FakeNetwork,
  createFakeIssuer,
  createFakeVerifier,
  createFakeWallet,
  type FakeRoleOptions,
} from '../src/orchestrator/fake-roles.js';
import type { RoleRegistration } from '../src/orchestrator/registry.js';

/** Configuration for tests: in-memory database, no built UI, quiet logs; `env` adds variables. */
export function testConfig(env: Record<string, string> = {}) {
  return loadConfig({ PLAYGROUND_DB: ':memory:', PLAYGROUND_WEB_DIST: '/nonexistent', ...env });
}

export interface FakeSetOptions {
  issuer?: FakeRoleOptions;
  wallet?: FakeRoleOptions;
  verifier?: FakeRoleOptions;
}

/** One fake issuer, wallet and verifier sharing an in-memory network, ready to register. */
export function fakeSet(options: FakeSetOptions = {}): { roles: AnyRole[]; network: FakeNetwork } {
  const network = new FakeNetwork();
  return {
    network,
    roles: [
      createFakeIssuer(options.issuer),
      createFakeWallet(network, options.wallet),
      createFakeVerifier(network, options.verifier),
    ],
  };
}

export function registrations(roles: AnyRole[], stepTimeoutMs?: number): RoleRegistration[] {
  return roles.map((role) => ({ role, ...(stepTimeoutMs ? { stepTimeoutMs } : {}) }));
}

export async function buildTestApp(
  options: Partial<BuildAppOptions> & { env?: Record<string, string> } = {},
): Promise<FastifyInstance> {
  const { env, ...rest } = options;
  const app = await buildApp({ config: testConfig(env), logger: false, ...rest });
  // `inject()` readies the app itself, `injectWS()` does not.
  await app.ready();
  return app;
}

/** The default fake trio's run configuration. */
export const FAKE_CELL = {
  issuer: 'fake-issuer',
  wallet: 'fake-wallet',
  verifier: 'fake-verifier',
  format: 'vc+sd-jwt',
} as const;

/** Scenarios for tests that need an expectation other than the happy path. */
export function scenarioCatalogue(extra: ScenarioSpec[]) {
  const all: ScenarioSpec[] = [
    {
      id: 'happy',
      title: 'Happy path',
      description: 'Valid credential, presented unchanged.',
      expected: 'VALID',
      target: 'none',
    },
    ...extra,
  ];
  return {
    findScenario: (id: string) => all.find((scenario) => scenario.id === id),
    listScenarios: () => all,
  };
}

/**
 * Starts an HTTP server on the first free port of 28600-28699 (several test files run in parallel, so
 * a fixed port could collide). Returns the server and its base URL.
 */
export async function listenInTestRange(
  handler: RequestListener,
  fromTop = false,
): Promise<{ server: Server; url: string }> {
  for (let i = 0; i < 100; i += 1) {
    const port = fromTop ? 28_699 - i : 28_600 + i;
    const server = createServer(handler);
    const bound = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (bound) return { server, url: `http://127.0.0.1:${port}` };
  }
  throw new Error('no free port in 28600-28699');
}

/**
 * A port in 28600-28699 with nothing listening (for connection-refused tests). It scans down from the top:
 * scanning up would return the lowest free port, which the next parallel test file then binds.
 */
export async function unusedTestPort(): Promise<number> {
  const { server, url } = await listenInTestRange(() => undefined, true);
  await new Promise((resolve) => server.close(resolve));
  return Number(new URL(url).port);
}
