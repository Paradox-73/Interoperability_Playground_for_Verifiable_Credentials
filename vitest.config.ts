/**
 * One Vitest run covers every workspace; each workspace is a Vitest "project" named after its folder.
 *
 * - `npm test` runs every project except `live`.
 * - `npm run test:live` runs only `live`: tests in packages/server/test/live/ that need the local Inji
 *   stack (`npm run stack:up`).
 * - `npm test -w @inji-playground/<name>` runs one project.
 *
 * Workspace packages are resolved through their `source` export condition, so tests run against
 * `src/` and never need a build first.
 */
import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

const nodePackages = ['protocol', 'formats', 'scenarios', 'oid4vci', 'oid4vp', 'server', 'cli'] as const;

const sourceConditions = ['source', ...defaultServerConditions];

export default defineConfig({
  test: {
    projects: [
      ...nodePackages.map((name) => ({
        extends: true as const,
        test: {
          name,
          root: `packages/${name}`,
          environment: 'node',
          include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['test/live/**', '**/node_modules/**', '**/dist/**'],
        },
      })),
      {
        extends: true as const,
        test: {
          name: 'live',
          root: 'packages/server',
          environment: 'node',
          include: ['test/live/**/*.test.ts'],
          // Inji Certify's first metadata call took 52 s on a cold start (measured 2026-10-04).
          testTimeout: 180_000,
          hookTimeout: 300_000,
          // Live runs share one Inji stack, so they never run in parallel.
          fileParallelism: false,
        },
      },
      // The web package brings its own Vite config (React plugin, jsdom, setup file).
      'packages/web',
    ],
  },
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions } },
});
