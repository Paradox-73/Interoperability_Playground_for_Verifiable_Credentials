/**
 * Reads a stored run for playback: its events (`GET /api/runs/{id}/events`) and its summary
 * (`GET /api/runs/{id}`) for the recording date. Stored runs do not change, so neither is refetched.
 */
import {
  RunDetailSchema,
  RunEventListSchema,
  type RunDetail,
  type RunEvent,
} from '@inji-playground/protocol';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '../api/http';

export const playbackKeys = {
  events: (runId: string) => ['run-events', runId] as const,
  detail: (runId: string) => ['run-detail', runId] as const,
};

export function useStoredRunEvents(runId: string) {
  return useQuery<RunEvent[]>({
    queryKey: playbackKeys.events(runId),
    queryFn: ({ signal }) =>
      getJson(
        `/api/runs/${encodeURIComponent(runId)}/events`,
        (json) => RunEventListSchema.parse(json),
        signal,
      ),
    staleTime: Infinity,
  });
}

export function useRunDetail(runId: string) {
  return useQuery<RunDetail>({
    queryKey: playbackKeys.detail(runId),
    queryFn: ({ signal }) =>
      getJson(`/api/runs/${encodeURIComponent(runId)}`, (json) => RunDetailSchema.parse(json), signal),
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * When the run was recorded: its creation time from the server, else the time of its first event, so a
 * run exported without its summary still gets a date.
 */
export function recordedAt(detail: RunDetail | undefined, events: readonly RunEvent[]): string | undefined {
  if (detail?.createdAt) return detail.createdAt;
  const started = events.find((event) => event.type === 'run.started');
  return started?.type === 'run.started' ? started.at : undefined;
}
