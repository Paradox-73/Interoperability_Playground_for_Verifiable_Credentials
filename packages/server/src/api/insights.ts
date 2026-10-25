// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * What the stored runs add up to: the compatibility matrix, run metrics (JSON, Prometheus and Obsrv events)
 * and the interoperability gap register. With `PLAYGROUND_OBSRV_URL` set, each finished run is also pushed
 * to that Obsrv dataset.
 */
import {
  ApiErrorSchema,
  GapListSchema,
  MatrixQuerySchema,
  MatrixSchema,
  MetricsQuerySchema,
  MetricsSchema,
  RunIdSchema,
} from '@inji-playground/protocol';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { buildMatrix } from '../matrix/matrix.js';
import { renderMatrixMarkdown } from '../matrix/markdown.js';
import { computeMetrics } from '../metrics/metrics.js';
import { ObsrvEventSchema, obsrvEvents, pushToObsrv } from '../metrics/obsrv.js';
import { PROMETHEUS_CONTENT_TYPE, renderPrometheus } from '../metrics/prometheus.js';
import { RunRequestError } from '../orchestrator/errors.js';
import { SERVER_VERSION } from '../version.js';
import type { RouteOptions } from './services.js';

export const insightRoutes: FastifyPluginCallbackZod<RouteOptions> = (app, { services }, done) => {
  const { store, registry, scenarios, gaps, bus, config } = services;

  const { obsrvUrl } = config;
  if (obsrvUrl) {
    const pending = new Set<Promise<void>>();
    const unsubscribe = bus.subscribeAll((event) => {
      if (event.type !== 'run.finished') return;
      const push = pushToObsrv(obsrvUrl, event.report)
        .catch((error: unknown) =>
          app.log.warn({ err: error, runId: event.runId }, 'pushing run telemetry to Obsrv failed'),
        )
        .finally(() => pending.delete(push));
      pending.add(push);
    });
    // A server closed right after a run (the CLI, `npm run smoke`) would otherwise drop the last push.
    app.addHook('onClose', async () => {
      unsubscribe();
      await Promise.allSettled(pending);
    });
  }

  app.get(
    '/api/matrix',
    {
      schema: {
        summary: 'Compatibility matrix: newest run per cell, plus cells that cannot run and why',
        description:
          'A cell is issuer x wallet x verifier x format x OpenID4VP profile x scenario. Cells with a stored run show the verdict of the newest finished one and the counts of all of them; every other combination of registered roles (for the `scenario` given, `happy` by default) is listed from the compatibility check as `untested` or `not-supported` with the blocking reasons. `format=md` answers with a dated Markdown document instead of JSON.',
        tags: ['reports'],
        querystring: MatrixQuerySchema,
        response: {
          200: MatrixSchema.or(z.string().describe('Markdown document, when `format=md`')),
          400: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { query } = request;
      if (!scenarios.findScenario(query.scenario)) {
        throw new RunRequestError('unknown-scenario', `no scenario with id "${query.scenario}"`, 400);
      }
      const matrix = buildMatrix({
        query,
        roles: registry.list().map((entry) => entry.descriptor),
        stored: store.latestRunPerCell({
          ...(query.issuer ? { issuer: query.issuer } : {}),
          ...(query.wallet ? { wallet: query.wallet } : {}),
          ...(query.verifier ? { verifier: query.verifier } : {}),
          ...(query.credentialFormat ? { format: query.credentialFormat } : {}),
          ...(query.mode ? { mode: query.mode } : {}),
        }),
        findScenario: (id) => scenarios.findScenario(id),
        gapIdsFor: (key) => gaps.gapIdsFor(key),
        playgroundVersion: SERVER_VERSION,
      });
      if (query.format === 'md') {
        // A string with a non-JSON content type is sent as it is, not through the JSON serialiser.
        return reply.type('text/markdown; charset=utf-8').send(renderMatrixMarkdown(matrix));
      }
      return matrix;
    },
  );

  app.get(
    '/api/metrics',
    {
      schema: {
        summary: 'Success rate and p50/p95 durations per step, role pair and flow; credential sizes',
        description:
          'Computed from the finished runs that match the filters. Success rate of a step: ok / ran; of a role pair: phases whose steps all finished ok / phases attempted (issuance = issuer -> wallet, presentation = wallet -> verifier); of a flow and overall: pass / (pass + fail + error). Percentiles use the nearest-rank method. Credential sizes give bytes and the PixelPass QR text length with a fits-a-version-40-QR flag.',
        tags: ['metrics'],
        querystring: MetricsQuerySchema,
        response: { 200: MetricsSchema, 400: ApiErrorSchema },
      },
    },
    (request) => computeMetrics(store.listFinishedReports(request.query)),
  );

  app.get(
    '/metrics',
    {
      schema: {
        summary: 'The same metrics in the Prometheus text format',
        description:
          'Gauges `playground_runs`, `playground_success_ratio`, `playground_step_success_ratio`, `playground_pair_success_ratio`, `playground_flow_success_ratio`, `playground_credential_bytes`, `playground_credential_pixelpass_chars`, `playground_credential_fits_qr_v40`; summaries `playground_step_duration_seconds`, `playground_pair_duration_seconds`, `playground_flow_duration_seconds` with quantiles 0.5 and 0.95.',
        tags: ['metrics'],
        produces: ['text/plain'],
        response: { 200: z.string().describe('Prometheus text exposition format 0.0.4') },
      },
    },
    async (_request, reply) =>
      reply.type(PROMETHEUS_CONTENT_TYPE).send(renderPrometheus(computeMetrics(store.listFinishedReports()))),
  );

  app.get(
    '/api/telemetry/obsrv',
    {
      schema: {
        summary:
          'Finished runs as flat Obsrv events: one RUN event per run and one STEP event per step that ran',
        description:
          'The events `PLAYGROUND_OBSRV_URL` receives, for the finished runs that match the filters (`runId` picks one run). Fields match deploy/obsrv/druid-ingestion-spec.json; see docs/telemetry-obsrv.md.',
        tags: ['metrics'],
        querystring: MetricsQuerySchema.extend({ runId: RunIdSchema.optional() }),
        response: { 200: z.object({ events: z.array(ObsrvEventSchema) }), 400: ApiErrorSchema },
      },
    },
    (request) => {
      const { runId, ...filter } = request.query;
      const reports = store
        .listFinishedReports(filter)
        .filter(({ report }) => runId === undefined || report.runId === runId);
      return { events: reports.flatMap(({ report }) => obsrvEvents(report)) };
    },
  );

  app.get(
    '/api/gaps',
    {
      schema: {
        summary: 'Interoperability gaps found so far, from docs/gaps/gaps.json',
        description:
          'Entries of the gap register with the matrix cells they explain. Security-relevant entries (`disclosure: private`) are reduced to id, repository and severity. An absent register gives `source: null` and no gaps; entries that do not match the schema are listed under `problems`.',
        tags: ['reports'],
        response: { 200: GapListSchema },
      },
    },
    () => gaps.list(),
  );
  done();
};
