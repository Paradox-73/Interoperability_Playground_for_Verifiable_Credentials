// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Runs: start one, list the history, read one with its events and recorded exchanges, and act on a
 * running one (cancel, confirm a person's action, deliver a browser verifier's callback).
 */
import {
  ApiErrorSchema,
  CreateRunRequestSchema,
  CreateRunResponseSchema,
  PersonDoneRequestSchema,
  RecordedExchangeSchema,
  RunActionResponseSchema,
  RunDetailSchema,
  RunEventListSchema,
  RunIdSchema,
  RunListQuerySchema,
  RunListResponseSchema,
  VerifierCallbackSchema,
  type RunDetail,
} from '@inji-playground/protocol';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BrowserWalletRole } from '../adapters/manual/browser-wallet.js';
import { RunRequestError } from '../orchestrator/errors.js';
import type { RouteOptions } from './services.js';

const RunParamsSchema = z.object({ id: RunIdSchema });
/** A Digital Credentials API request or answer (`{ protocol, data }`, OpenID4VP 1.0 Appendix A). */
const DcApiMessageSchema = z.object({ protocol: z.string().min(1), data: z.record(z.string(), z.unknown()) });
const errors = { 400: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema };

export const runRoutes: FastifyPluginCallbackZod<RouteOptions> = (app, { services }, done) => {
  const { store, orchestrator } = services;

  const detail = (runId: string): RunDetail => {
    const run = store.getRun(runId);
    if (!run) throw new RunRequestError('run-not-found', `no run with id "${runId}"`, 404);
    const pendingAction = orchestrator.pendingAction(runId);
    return pendingAction ? { ...run, pendingAction } : run;
  };

  app.post(
    '/api/runs',
    {
      schema: {
        summary: 'Start a run',
        description:
          'Starts one issuer -> wallet -> verifier run in the background and answers with its id; follow it on the WebSocket (`/ws?runId=<id>`) or with `GET /api/runs/{id}`. Send a full configuration, or `replayOf` with the id of a stored run to repeat its configuration (fields sent next to it override the copied ones). A combination the compatibility check rejects is stored at once with the verdict `not-supported`.',
        tags: ['runs'],
        body: CreateRunRequestSchema,
        response: { 201: CreateRunResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const { runId } = orchestrator.create(request.body);
      return reply.code(201).header('location', `/api/runs/${runId}`).send({ runId });
    },
  );

  app.get(
    '/api/runs',
    {
      schema: {
        summary: 'Run history, newest first, with filters and paging',
        tags: ['runs'],
        querystring: RunListQuerySchema,
        response: { 200: RunListResponseSchema, 400: ApiErrorSchema },
      },
    },
    (request) => store.listRuns(request.query),
  );

  app.get(
    '/api/runs/:id',
    {
      schema: {
        summary:
          'One run: configuration, status, report once finished, and the action a person must take, if any',
        tags: ['runs'],
        params: RunParamsSchema,
        response: { 200: RunDetailSchema, 404: ApiErrorSchema },
      },
    },
    (request) => detail(request.params.id),
  );

  app.get(
    '/api/runs/:id/events',
    {
      schema: {
        summary: 'Events of a run in the order they were emitted (the messages the WebSocket streams)',
        tags: ['runs'],
        params: RunParamsSchema,
        querystring: z.object({
          after: z.coerce.number().int().min(0).default(0).describe('Only events after this sequence number'),
        }),
        response: { 200: RunEventListSchema, 404: ApiErrorSchema },
      },
    },
    (request) => {
      detail(request.params.id);
      return store.listEvents(request.params.id, request.query.after);
    },
  );

  app.get(
    '/api/runs/:id/exchanges',
    {
      schema: {
        summary: 'HTTP exchanges recorded during a run, in order, with full headers and bodies',
        tags: ['runs'],
        params: RunParamsSchema,
        response: { 200: z.array(RecordedExchangeSchema), 404: ApiErrorSchema },
      },
    },
    (request) => {
      detail(request.params.id);
      return store.listExchanges(request.params.id);
    },
  );

  app.post(
    '/api/runs/:id/cancel',
    {
      schema: {
        summary: 'Cancel a queued or running run',
        description:
          'The run stops at once; its report gets the verdict `error` with the code `run.cancelled`.',
        tags: ['runs'],
        params: RunParamsSchema,
        response: { 202: RunActionResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const status = orchestrator.cancel(request.params.id);
      return reply.code(202).send({ runId: request.params.id, status });
    },
  );

  app.post(
    '/api/runs/:id/person-done',
    {
      schema: {
        summary: 'Confirm that the person did what the run is waiting for (manual fallback)',
        description:
          "Used when the server cannot observe the person's action itself, for example a wallet app on a phone whose traffic does not pass through the playground.",
        tags: ['runs'],
        params: RunParamsSchema,
        // A POST without a body arrives as null.
        body: PersonDoneRequestSchema.nullish(),
        response: { 202: RunActionResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      orchestrator.personDone(request.params.id, request.body?.actionId);
      return reply.code(202).send({ runId: request.params.id, status: 'running' as const });
    },
  );

  app.post(
    '/api/runs/:id/verifier-callback',
    {
      schema: {
        summary: 'Deliver a signal from a verifier component running outside the server',
        description:
          "The Inji Verify React SDK runs in the browser and reports through callbacks; the UI forwards `onVPReceived(transactionId)` (kind `vp-received`), `onVPProcessed` and `onError` here, and the run's verifier role receives them in order through `RunContext.waitForCallback()`.",
        tags: ['runs'],
        params: RunParamsSchema,
        body: VerifierCallbackSchema,
        response: { 202: RunActionResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      orchestrator.deliverCallback(request.params.id, request.body);
      return reply.code(202).send({ runId: request.params.id, status: 'running' as const });
    },
  );
  app.post(
    '/api/runs/:id/dc-api/provider',
    {
      schema: {
        summary: "Let the playground's reference wallet answer a Digital Credentials API request",
        description:
          "For a run with the browser wallet: the page passes the request it would give to navigator.credentials.get() and gets the answer a wallet would return, bound to the page's origin (the Origin header). The page then posts that answer to the verifier as it would post the browser's.",
        tags: ['runs'],
        params: RunParamsSchema,
        body: DcApiMessageSchema,
        response: { 200: DcApiMessageSchema, ...errors },
      },
    },
    async (request, reply) => {
      const run = store.getRun(request.params.id);
      if (!run) throw new RunRequestError('run-not-found', `no run with id "${request.params.id}"`, 404);
      const role = services.registry.wallet(run.config.wallet);
      if (!(role instanceof BrowserWalletRole)) {
        throw new RunRequestError('dc-api-not-browser', 'this run does not use the browser wallet', 409);
      }
      const origin = request.headers.origin ?? `${request.protocol}://${request.headers.host ?? 'localhost'}`;
      try {
        const answer = await role.provide(request.params.id, request.body, origin);
        return reply.code(200).send(answer);
      } catch (error) {
        throw new RunRequestError(
          'dc-api-provider-failed',
          error instanceof Error ? error.message : String(error),
          409,
        );
      }
    },
  );
  done();
};
