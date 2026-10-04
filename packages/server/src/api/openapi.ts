/**
 * The OpenAPI document, generated from the zod schemas of the routes (one definition validates the
 * request, serialises the response and documents both). Served at `/api/openapi.json`, browsable at
 * `/api/docs`.
 */
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { SERVER_VERSION } from '../version.js';

/** Must run before any route is added: the generator collects routes as they are registered. */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Inji Interoperability Playground API',
        version: SERVER_VERSION,
        description:
          'Runs verifiable credential flows issuer -> wallet -> verifier across Inji modules and independent reference implementations, records every HTTP exchange, and reports pass/fail per combination.',
        license: { name: 'MIT', identifier: 'MIT' },
      },
      tags: [
        { name: 'system', description: 'Server health and API description' },
        { name: 'roles', description: 'Roles, scenarios, Inji stack health and the compatibility check' },
        { name: 'runs', description: 'Starting, following and controlling runs' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  app.get('/api/openapi.json', { schema: { hide: true } }, () => app.swagger());
}
