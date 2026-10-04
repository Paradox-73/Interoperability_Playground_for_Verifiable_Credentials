/**
 * Builds the Fastify application without listening, so tests can call routes with `app.inject()`
 * and `main.ts` decides where to listen.
 */
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthRoutes } from './api/health.js';
import { hasWebDist, type Config } from './config/index.js';

export interface BuildAppOptions {
  config: Config;
  /** Fastify logger options; `false` in tests. Defaults to the configured log level. */
  logger?: FastifyServerOptions['logger'];
}

/**
 * Path prefixes that belong to the server. A request under one of them that matches no route gets a
 * JSON 404; any other GET for a page (no file extension) gets the UI's index.html, so client-side
 * routes such as /runs/42 work after a browser reload.
 */
const SERVER_PREFIXES = ['/api/', '/ws', '/v1/', '/ref/', '/proxy/', '/metrics'];

export async function buildApp({ config, logger }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ?? { level: config.logLevel },
    // Inji Verify's status poll holds a request open for up to 55 s; keep the default timeouts above that.
    requestTimeout: 120_000,
  }).withTypeProvider<ZodTypeProvider>();

  // Route schemas are zod schemas from @inji-playground/protocol: one definition validates requests,
  // serialises responses and (later) generates the OpenAPI document.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(healthRoutes);

  const serveUi = hasWebDist(config);
  if (serveUi) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false, index: ['index.html'] });
  }

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    const isServerPath = SERVER_PREFIXES.some((prefix) => path.startsWith(prefix));
    const looksLikeFile = /\.[a-z0-9]+$/i.test(path);
    if (serveUi && request.method === 'GET' && !isServerPath && !looksLikeFile) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not-found', message: `no route for ${request.method} ${path}` });
  });

  return app;
}
