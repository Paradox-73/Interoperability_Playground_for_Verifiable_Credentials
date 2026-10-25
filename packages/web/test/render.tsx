// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Renders the whole app (router, query client, socket) at a route, as a person would see it.
 */
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router-dom';
import { App } from '../src/App';
import { defaultSocketUrl, RunSocket } from '../src/api/socket';
import { routes } from '../src/app/routes';

const sockets: RunSocket[] = [];

/** Closes the sockets opened by renderApp; called after every test by test/setup.ts. */
export function disposeTestSockets(): void {
  for (const socket of sockets.splice(0)) socket.dispose();
}

export function renderApp(route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const socket = new RunSocket({ url: defaultSocketUrl(window.location), minDelayMs: 10, maxDelayMs: 50 });
  sockets.push(socket);
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const user = userEvent.setup();
  const result = render(<App queryClient={queryClient} socket={socket} router={router} />);
  return { ...result, user, socket, router, queryClient };
}
