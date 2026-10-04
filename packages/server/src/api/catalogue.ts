/**
 * What can be combined: the registered roles (the three selector columns) with their health, the
 * health of the local Inji stack, the scenarios, and the compatibility check for one combination.
 */
import {
  ApiErrorSchema,
  CompatibilityQuerySchema,
  CompatibilityResultSchema,
  RoleListQuerySchema,
  RoleListResponseSchema,
  ScenarioSpecSchema,
  StackStatusResponseSchema,
  type CompatibilityResult,
} from '@inji-playground/protocol';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { stackStatus } from '../adapters/inji/index.js';
import type { RouteOptions } from './services.js';

export const catalogueRoutes: FastifyPluginCallbackZod<RouteOptions> = (app, { services }, done) => {
  const { registry, orchestrator, config } = services;

  app.get(
    '/api/roles',
    {
      schema: {
        summary: 'Registered roles with their capabilities and current health',
        description:
          'One entry per implementation that can play the issuer, wallet or verifier role: its descriptor (formats, proof types, DID methods, protocol profiles, version) and the result of a health probe (cached for 5 s).',
        tags: ['roles'],
        querystring: RoleListQuerySchema,
        response: { 200: RoleListResponseSchema },
      },
    },
    async (request) => registry.status(request.query.kind),
  );

  app.get(
    '/api/stack/status',
    {
      schema: {
        summary: 'Health and image tags of the local Inji stack, plus the health of every role',
        tags: ['roles'],
        response: { 200: StackStatusResponseSchema },
      },
    },
    async () => {
      const [stack, roles] = await Promise.all([stackStatus(config.stack), registry.status()]);
      return { ...stack, roles };
    },
  );

  app.get(
    '/api/scenarios',
    {
      schema: {
        summary: 'Scenarios a run can apply: the happy path and the tamper variants, with expected outcomes',
        tags: ['roles'],
        response: { 200: z.array(ScenarioSpecSchema) },
      },
    },
    () => services.scenarios.listScenarios(),
  );

  app.get(
    '/api/compatibility',
    {
      schema: {
        summary: 'Whether one issuer x wallet x verifier x format combination can run, and why not',
        description:
          'Compares the three role descriptors. `blocking` reasons make a run end immediately with the verdict `not-supported`; `warning` reasons are shown but the run is attempted.',
        tags: ['roles'],
        querystring: CompatibilityQuerySchema,
        response: { 200: CompatibilityResultSchema, 400: ApiErrorSchema },
      },
    },
    (request): CompatibilityResult => orchestrator.resolve(request.query).compatibility,
  );
  done();
};
