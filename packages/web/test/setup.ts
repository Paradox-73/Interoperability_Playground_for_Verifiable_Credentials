// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect, with their TypeScript types.
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import '../src/i18n';
import { resetAnnouncer } from '../src/state/announcer';
import { resetPlaygroundStore } from '../src/state/playground';
import { resetRunEventsStore } from '../src/state/run-events';
import { server } from './msw/server';
import { disposeTestSockets } from './render';

// findBy* and waitFor give up after 1 s by default, too short for a full page render under CPU load.
configure({ asyncUtilTimeout: 5_000 });

// A request no handler answers is a test bug, so it fails the test instead of reaching the network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  disposeTestSockets();
  server.resetHandlers();
  resetPlaygroundStore();
  resetRunEventsStore();
  resetAnnouncer();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterAll(() => server.close());
