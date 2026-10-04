/**
 * Builds the Fastify application without listening, so tests can call routes with `app.inject()`
 * and `main.ts` decides where to listen.
 *
 * Wiring, in order: SQLite store (runs left unfinished by a previous process are closed as `error`),
 * event bus, role registry (Inji adapters, then the development-only fake roles when enabled, then
 * roles passed by the caller), orchestrator, OpenAPI generator, routes, built UI.
 */
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { type ScenarioHooks, type ScenarioSpec } from '@inji-playground/protocol';
import { findScenario, listScenarios } from '@inji-playground/scenarios';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { injiRoles } from './adapters/inji/index.js';
import { catalogueRoutes } from './api/catalogue.js';
import { installErrorHandler } from './api/errors.js';
import { healthRoutes } from './api/health.js';
import { registerOpenApi } from './api/openapi.js';
import { runRoutes } from './api/runs.js';
import type { PlaygroundServices } from './api/services.js';
import { websocketRoutes } from './api/ws.js';
import { databasePath, hasWebDist, type Config } from './config/index.js';
import { EventBus } from './events/bus.js';
import { devFakeRoles } from './orchestrator/fake-roles.js';
import { Orchestrator, type ScenarioCatalogue } from './orchestrator/orchestrator.js';
import { RoleRegistry, type RoleRegistration } from './orchestrator/registry.js';
import { RunStore } from './store/run-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Store, bus, registry and orchestrator of this server, for in-process callers (CLI, tests). */
    playground: PlaygroundServices;
  }
}

export interface BuildAppOptions {
  config: Config;
  /** Fastify logger options; `false` in tests. Defaults to the configured log level. */
  logger?: FastifyServerOptions['logger'];
  /** Roles to register after the Inji adapters and the fake roles. */
  roles?: RoleRegistration[];
  /** Scenario catalogue; `@inji-playground/scenarios` by default. */
  scenarios?: ScenarioCatalogue;
  /** Hooks of a scenario (tamper variants); none by default. */
  hooksFor?: (scenario: ScenarioSpec) => ScenarioHooks;
}

/**
 * Path prefixes that belong to the server. A request under one of them that matches no route gets a
 * JSON 404; any other GET for a page (no file extension) gets the UI's index.html, so client-side
 * routes such as /runs/42 work after a browser reload.
 */
const SERVER_PREFIXES = ['/api/', '/ws', '/v1/', '/ref/', '/proxy/', '/metrics'];

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.logLevel },
    // Inji Verify's status poll holds a request open for up to 55 s; keep the default timeouts above that.
    requestTimeout: 120_000,
  }).withTypeProvider<ZodTypeProvider>();

  // Route schemas are zod schemas from @inji-playground/protocol: one definition validates requests,
  // serialises responses and generates the OpenAPI document.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);

  const store = RunStore.open(databasePath(config));
  const interrupted = store.interruptUnfinished(new Date().toISOString());
  if (interrupted > 0)
    app.log.warn({ interrupted }, 'closed runs left unfinished by a previous server process');

  const bus = new EventBus((error, event) =>
    app.log.error({ err: error, runId: event.runId, type: event.type }, 'run event listener failed'),
  );
  const registry = new RoleRegistry();
  for (const role of injiRoles()) registry.register({ role });
  if (config.fakeRoles) {
    app.log.warn('PLAYGROUND_FAKE_ROLES is on: development-only fake roles are registered');
    for (const role of devFakeRoles()) registry.register({ role });
  }
  for (const registration of options.roles ?? []) registry.register(registration);

  const scenarios = options.scenarios ?? { findScenario, listScenarios };
  const orchestrator = new Orchestrator({
    store,
    bus,
    registry,
    scenarios,
    timeouts: {
      referenceMs: config.referenceStepTimeoutMs,
      injiMs: config.injiStepTimeoutMs,
      personMs: config.personTimeoutMs,
    },
    ...(options.hooksFor ? { hooksFor: options.hooksFor } : {}),
    logger: app.log,
  });

  const services: PlaygroundServices = { config, store, bus, registry, orchestrator, scenarios };
  app.decorate('playground', services);
  app.addHook('onClose', async () => {
    await orchestrator.close();
    store.close();
  });

  await registerOpenApi(app);
  await app.register(fastifyWebsocket);
  await app.register(healthRoutes);
  await app.register(catalogueRoutes, { services });
  await app.register(runRoutes, { services });
  await app.register(websocketRoutes, { services });

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
