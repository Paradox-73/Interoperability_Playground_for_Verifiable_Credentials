// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Makes one RunSocket available to the component tree. The app creates it once; tests pass their own.
 */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { RunSocket, SocketStatus } from './socket';

const SocketContext = createContext<RunSocket | null>(null);

export function SocketProvider({ socket, children }: { socket: RunSocket; children: ReactNode }) {
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useRunSocket(): RunSocket {
  const socket = useContext(SocketContext);
  if (!socket) throw new Error('useRunSocket needs a <SocketProvider> above it');
  return socket;
}

/** Re-renders when the connection status changes. */
export function useSocketStatus(): SocketStatus {
  const socket = useRunSocket();
  return useSyncExternalStore(socket.onStatus, () => socket.status);
}
