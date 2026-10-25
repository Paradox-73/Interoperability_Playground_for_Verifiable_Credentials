// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Keeps evidence pages current: subscribes to every run (`'*'`) on the shared WebSocket and refetches
 * the given queries when a run finishes, so a run started from the matrix turns its cell green or red
 * without a reload.
 */
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRunSocket } from '../../api/socket-context';

/** Finished runs arrive in bursts when a whole matrix row runs; refetch once per burst. */
const DEBOUNCE_MS = 500;

export function useRefreshOnRunFinished(keys: readonly QueryKey[]): void {
  const socket = useRunSocket();
  const queryClient = useQueryClient();
  // A stable string, so a new array literal on every render does not resubscribe.
  const serialized = JSON.stringify(keys);

  useEffect(() => {
    const prefixes = JSON.parse(serialized) as QueryKey[];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = socket.subscribe('*', (event) => {
      if (event.type !== 'run.finished') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const queryKey of prefixes) void queryClient.invalidateQueries({ queryKey });
      }, DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [socket, queryClient, serialized]);
}
