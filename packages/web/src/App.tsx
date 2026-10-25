// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The UI root: data client, live-event socket and router. main.tsx creates the real instances; tests
 * pass their own (a fresh query client, a memory router), so each test starts from a clean state.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router-dom';
import { SocketProvider } from './api/socket-context';
import type { RunSocket } from './api/socket';
import './i18n';

export type AppRouter = ReturnType<typeof createBrowserRouter>;

interface AppProps {
  queryClient: QueryClient;
  socket: RunSocket;
  router: AppRouter;
}

export function AppProviders({
  queryClient,
  socket,
  children,
}: Omit<AppProps, 'router'> & { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider socket={socket}>{children}</SocketProvider>
    </QueryClientProvider>
  );
}

export function App({ queryClient, socket, router }: AppProps) {
  return (
    <AppProviders queryClient={queryClient} socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
