/**
 * Server reads of the history dashboard: one page of stored runs and the metrics of the same runs.
 * Both refresh when any run finishes (see `useRefreshOnRunFinished`).
 */
import {
  MetricsSchema,
  RunListResponseSchema,
  type Metrics,
  type RunListResponse,
} from '@inji-playground/protocol';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson } from '../../api/http';
import { metricsPath, runListPath, type HistoryFilter } from './filters';

/** Prefixes for invalidation: every page and filter of the history shares the first element. */
export const historyKeys = {
  runs: ['runs'] as const,
  metrics: ['metrics'] as const,
};

export function useRunList(filter: HistoryFilter, page: number) {
  const path = runListPath(filter, page);
  return useQuery<RunListResponse>({
    queryKey: [...historyKeys.runs, path],
    queryFn: ({ signal }) => getJson(path, (json) => RunListResponseSchema.parse(json), signal),
    // Keep the current rows on screen while the next page or filter loads, so the table does not jump.
    placeholderData: keepPreviousData,
  });
}

export function useMetrics(filter: HistoryFilter) {
  const path = metricsPath(filter);
  return useQuery<Metrics>({
    queryKey: [...historyKeys.metrics, path],
    queryFn: ({ signal }) => getJson(path, (json) => MetricsSchema.parse(json), signal),
    placeholderData: keepPreviousData,
  });
}
