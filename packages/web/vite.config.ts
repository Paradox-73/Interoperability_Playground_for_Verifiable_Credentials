/// <reference types="vitest/config" />
/**
 * Vite configuration of the playground UI, also used by Vitest for the `web` test project.
 *
 * Ports (project range 28000-28999): dev server 28173, preview 28174. The dev server forwards every
 * server path to the playground server on 28100, so the UI always talks to its own origin.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

const serverUrl = process.env.PLAYGROUND_SERVER_URL ?? 'http://localhost:28100';
const forward = { target: serverUrl, changeOrigin: false };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Workspace packages are bundled from their TypeScript sources (`source` export condition).
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: 28173,
    strictPort: true,
    proxy: {
      '/api': forward,
      '/ws': { ...forward, ws: true },
      '/v1/verify': forward,
      '/ref': forward,
      '/proxy': forward,
    },
  },
  preview: { port: 28174, strictPort: true },
  build: { sourcemap: true },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    // Page tests render the whole app in jsdom and run axe-core; on a laptop that is also building
    // other packages one test measured 7 s, so the 5 s default made them fail without a real fault.
    testTimeout: 30_000,
  },
});
