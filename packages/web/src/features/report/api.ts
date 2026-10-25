// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * `GET /api/runs/{id}/report.json`: the stored interoperability report of a finished run plus versions,
 * step labels and timings, the failing exchange and the download links. The server answers 409 while
 * the run is still going; the page then says so and refreshes when the run finishes.
 */
import { RunReportDocumentSchema, type RunReportDocument } from '@inji-playground/protocol';
import { useQuery } from '@tanstack/react-query';
import { ApiError, getJson } from '../../api/http';

export const reportKey = (runId: string) => ['report', runId] as const;

export const reportPaths = (runId: string) => {
  const id = encodeURIComponent(runId);
  return {
    json: `/api/runs/${id}/report.json`,
    markdownDownload: `/api/runs/${id}/report.md?download=true`,
    jsonDownload: `/api/runs/${id}/report.json?download=true`,
    export: `/api/runs/${id}/export`,
  };
};

export function useRunReport(runId: string) {
  return useQuery<RunReportDocument>({
    queryKey: reportKey(runId),
    queryFn: ({ signal }) =>
      getJson(reportPaths(runId).json, (json) => RunReportDocumentSchema.parse(json), signal),
    retry: false,
  });
}

/** The run exists but has not finished, so it has no report yet. */
export function isNotFinished(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
