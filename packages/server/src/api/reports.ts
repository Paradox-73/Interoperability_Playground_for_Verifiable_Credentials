// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Report and export of one run: the interoperability report as JSON or Markdown (problem statement
 * task 7), and a redacted export of everything stored about the run.
 */
import {
  ApiErrorSchema,
  RunExportSchema,
  RunIdSchema,
  RunReportDocumentSchema,
  type InteropReport,
  type RunDetail,
} from '@inji-playground/protocol';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RunRequestError } from '../orchestrator/errors.js';
import { buildRunExport } from '../reports/export.js';
import { buildReportDocument, renderReportMarkdown } from '../reports/report.js';
import { SERVER_VERSION } from '../version.js';
import type { RouteOptions } from './services.js';

const RunParamsSchema = z.object({ id: RunIdSchema });
const errors = { 404: ApiErrorSchema, 409: ApiErrorSchema };

/** A file name for downloads: the run id is URL-safe, so it is also safe in a header. */
function attachment(runId: string, extension: string): string {
  return `attachment; filename="run-${runId}.${extension}"`;
}

export const reportRoutes: FastifyPluginCallbackZod<RouteOptions> = (app, { services }, done) => {
  const { store } = services;

  const run = (runId: string): RunDetail => {
    const found = store.getRun(runId);
    if (!found) throw new RunRequestError('run-not-found', `no run with id "${runId}"`, 404);
    return found;
  };
  const finished = (runId: string): RunDetail & { report: InteropReport } => {
    const found = run(runId);
    if (!found.report) {
      throw new RunRequestError(
        'run-not-finished',
        `run "${runId}" is ${found.status}; its report exists once it has finished`,
        409,
      );
    }
    return found as RunDetail & { report: InteropReport };
  };
  const document = (runId: string) =>
    buildReportDocument(finished(runId), store.listExchanges(runId), SERVER_VERSION);

  app.get(
    '/api/runs/:id/report.json',
    {
      schema: {
        summary: 'Interoperability report of a finished run, as JSON',
        description:
          'The stored report (issuer, wallet, verifier, format, proof type, outcome, verdict, error) plus the versions of every component, each step with its label and duration, the failing exchange with links into the inspector, and the credential size. 409 while the run is still going.',
        tags: ['reports'],
        params: RunParamsSchema,
        querystring: z.object({
          download: z.enum(['true', 'false']).optional().describe('`true` adds a Content-Disposition header'),
        }),
        response: { 200: RunReportDocumentSchema, ...errors },
      },
    },
    (request, reply) => {
      if (request.query.download === 'true')
        reply.header('content-disposition', attachment(request.params.id, 'json'));
      return document(request.params.id);
    },
  );

  app.get(
    '/api/runs/:id/report.md',
    {
      schema: {
        summary: 'Interoperability report of a finished run, as Markdown',
        description:
          'The same content as `report.json`, rendered as a Markdown document whose first table holds the problem statement fields: issuer, wallet, verifier, format, proof type, outcome and error detail.',
        tags: ['reports'],
        params: RunParamsSchema,
        querystring: z.object({
          download: z.enum(['true', 'false']).optional().describe('`true` adds a Content-Disposition header'),
        }),
        produces: ['text/markdown'],
        response: { 200: z.string().describe('Markdown document'), ...errors },
      },
    },
    async (request, reply) => {
      const markdown = renderReportMarkdown(document(request.params.id));
      if (request.query.download === 'true')
        reply.header('content-disposition', attachment(request.params.id, 'md'));
      // A string with a non-JSON content type is sent as it is, not through the JSON serialiser.
      return reply.type('text/markdown; charset=utf-8').send(markdown);
    },
  );

  app.get(
    '/api/runs/:id/export',
    {
      schema: {
        summary: 'Everything stored about a run, with secrets redacted',
        description:
          'Run, events, exchanges and artefacts in one document, safe to attach to an issue. Access, refresh and ID tokens, authorization and pre-authorized codes, transaction codes, client secrets, cookies, authorization headers and private JWK members are replaced by `[redacted sha256:<8 hex>]`; credentials, presentations and verification results are kept because they are the evidence. Works for runs that are still going.',
        tags: ['reports'],
        params: RunParamsSchema,
        response: { 200: RunExportSchema, 404: ApiErrorSchema },
      },
    },
    (request, reply) => {
      reply.header('content-disposition', attachment(request.params.id, 'export.json'));
      return buildRunExport(store, run(request.params.id));
    },
  );
  done();
};
