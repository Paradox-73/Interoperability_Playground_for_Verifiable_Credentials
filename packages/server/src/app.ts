/**
 * Builds the Fastify application without listening, so tests can call routes with `app.inject()`
 * and `main.ts` decides where to listen.
 *
 * Wiring, in order: SQLite store (runs left unfinished by a previous process are closed as `error`),
 * event bus, recording transport (network map, in-process dispatch to this server), hosted reference
 * roles, role registry (Inji adapters, reference roles, the phone wallet, then the development-only
 * fake roles when enabled, then roles passed by the caller), orchestrator, OpenAPI generator, routes
 * (API, inbound recorder + hosted reference roles, reverse proxy), built UI.
 */
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { type ScenarioHooks, type ScenarioSpec } from '@inji-playground/protocol';
import {
  findScenario,
  findScenarioDefinition,
  listScenarios,
  scenarioHooks,
} from '@inji-playground/scenarios';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  INJI_VERIFY_CLIENT_ID,
  INJI_VERIFY_SDK_CLIENT_ID,
  injiRoles,
  injiVerifyResponseUris,
} from './adapters/inji/index.js';
import { BrowserWalletRole, MobileWalletRole } from './adapters/manual/index.js';
import { ReferenceDcApiVerifierRole, ReferenceWalletRole } from './adapters/reference/index.js';
import { referenceRoles } from './adapters/reference/index.js';
import { catalogueRoutes } from './api/catalogue.js';
import { installErrorHandler } from './api/errors.js';
import { healthRoutes } from './api/health.js';
import { insightRoutes } from './api/insights.js';
import { registerOpenApi } from './api/openapi.js';
import { reportRoutes } from './api/reports.js';
import { runRoutes } from './api/runs.js';
import type { PlaygroundServices } from './api/services.js';
import { websocketRoutes } from './api/ws.js';
import { databasePath, extraCaPath, hasWebDist, networkMapPath, type Config } from './config/index.js';
import { EventBus } from './events/bus.js';
import { GapRegister } from './gaps/register.js';
import {
  CERTIFY_AC_SCOPES,
  MIMOTO_CLIENT_ID,
  createReferenceHosting,
  type ReferenceHostingOptions,
} from './hosting/reference-hosting.js';
import { devFakeRoles } from './orchestrator/fake-roles.js';
import { Orchestrator, type ScenarioCatalogue } from './orchestrator/orchestrator.js';
import { RoleRegistry, type RoleRegistration } from './orchestrator/registry.js';
import { CaptureHub } from './recording/capture-hub.js';
import { inboundTargetOf, installInboundRecorder } from './recording/inbound.js';
import { NetworkMap, networkFetch } from './recording/network-map.js';
import { registerProxyRoutes } from './recording/proxy.js';
import { isSelfUrl, selfOriginsFor, selfTransport } from './recording/self-transport.js';
import { proxyTargets, serviceLabels } from './recording/targets.js';
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
  /**
   * Registers the Inji adapters, the reference roles and the phone wallet (default `true`). Tests that
   * check exactly the roles they pass set it to `false`; the reference roles are still hosted.
   */
  builtInRoles?: boolean;
  /** Scenario catalogue; `@inji-playground/scenarios` by default. */
  scenarios?: ScenarioCatalogue;
  /**
   * Hooks of a scenario (tamper variants). By default the hooks of `@inji-playground/scenarios` when
   * that catalogue is used, and none for a catalogue passed in `scenarios`.
   */
  hooksFor?: (scenario: ScenarioSpec) => ScenarioHooks;
}

/**
 * Path prefixes that belong to the server. A request under one of them that matches no route gets a
 * JSON 404; any other GET for a page (no file extension) gets the UI's index.html, so client-side
 * routes such as /runs/42 work after a browser reload.
 */
const SERVER_PREFIXES = [
  '/api/',
  '/ws',
  '/v1/',
  '/ref/',
  '/proxy/',
  '/metrics',
  '/.well-known/',
  '/contexts/',
];

/**
 * Second line of defence for a UI that shows untrusted credential content: scripts only from this server
 * (the Vite build has no inline script), no plugins, no framing. Inline styles stay allowed because
 * mermaid writes a <style> element into each diagram.
 */
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

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
  // Proxied Inji answers keep the upstream's own headers.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/proxy/')) void reply.headers(SECURITY_HEADERS);
  });

  const store = RunStore.open(databasePath(config));
  const interrupted = store.interruptUnfinished(new Date().toISOString());
  if (interrupted > 0)
    app.log.warn({ interrupted }, 'closed runs left unfinished by a previous server process');

  const bus = new EventBus((error, event) =>
    app.log.error({ err: error, runId: event.runId, type: event.type }, 'run event listener failed'),
  );
  // Recording transport: calls to this server are dispatched in-process (see self-transport.ts); every
  // other call goes out through the network map. Calls to the proxy or the hosted reference roles are
  // recorded there, so the roles' outbound client skips them (no duplicate records).
  const selfOrigins = selfOriginsFor(config.port, config.publicUrl);
  const caFile = extraCaPath(config);
  const network = networkFetch(NetworkMap.fromFile(networkMapPath(config)), {
    ...(caFile ? { ca: readFileSync(caFile, 'utf8') } : {}),
  });
  const transport = selfTransport(app, { selfOrigins, network });
  const selfCapture = (url: URL): boolean =>
    isSelfUrl(url, selfOrigins) &&
    (inboundTargetOf(url.pathname) !== undefined ||
      url.pathname.startsWith('/proxy/') ||
      url.pathname.startsWith('/v1/verify/'));

  // The orchestrator is created below; the hub only asks it for recorders while runs are active.
  const orchestratorRef: { current?: Orchestrator } = {};
  const capture = new CaptureHub({
    recorderFor: (runId) => orchestratorRef.current?.recorderFor(runId),
    bus,
  });
  const reference = await createReferenceHosting({
    publicUrl: config.publicUrl ?? `http://localhost:${config.port}`,
    // An in-memory database keeps nothing after the process ends; the reference keys follow it.
    ...(config.dbPath === ':memory:' ? {} : { keysDir: join(config.runDir, 'keys') }),
    issuerDidMethod: config.refIssuerDid,
    trustedIssuers: config.trustedIssuers,
    didWebAllowedHosts: config.didWebAllowedHosts,
    fetch: () => transport,
    ...(config.stack === 'off'
      ? {}
      : {
          remoteContexts: { cacheDir: join(config.runDir, 'contexts') },
          ...holderWebResources(config),
        }),
  });

  const registry = new RoleRegistry();
  if (options.builtInRoles ?? true) {
    for (const role of injiRoles({
      config,
      hub: capture,
      onCertifyTrustAnchors: (pems) => reference.verifier.addX5cTrustAnchors(pems),
      reference,
    })) {
      // The web component's run waits for a person to have the page open, so it gets the person timeout.
      const browser = role.describe().interaction === 'browser';
      registry.register({ role, ...(browser ? { stepTimeoutMs: config.personTimeoutMs } : {}) });
    }
    const responseUris = injiVerifyResponseUris(config);
    for (const role of referenceRoles(reference, capture, {
      preRegisteredClients: [
        { clientId: INJI_VERIFY_CLIENT_ID, responseUris },
        { clientId: INJI_VERIFY_SDK_CLIENT_ID, responseUris },
      ],
    })) {
      registry.register({ role });
    }
    // The Digital Credentials API pair: a verifier that asks through the browser, and the browser's wallet.
    // Its pages: this server, and the UI's Vite dev (28173) and preview (28174) servers, which forward to it.
    const dcApiOrigins = [...selfOrigins, 'http://localhost:28173', 'http://localhost:28174'];
    registry.register({ role: new ReferenceDcApiVerifierRole(reference, capture, dcApiOrigins) });
    registry.register({
      role: new BrowserWalletRole({
        referenceWallet: new ReferenceWalletRole(reference),
        hub: capture,
        completePerson: (runId, actionId) => {
          try {
            orchestratorRef.current?.personDone(runId, actionId);
          } catch {
            // The person pressed "done" first, or the run ended: nothing is waiting any more.
          }
        },
        timeoutMs: config.personTimeoutMs,
      }),
      stepTimeoutMs: config.personTimeoutMs,
    });
    registry.register({
      role: new MobileWalletRole({
        hub: capture,
        completePerson: (runId, actionId) => {
          try {
            orchestratorRef.current?.personDone(runId, actionId);
          } catch {
            // The person pressed "done" first, or the run ended: nothing is waiting any more.
          }
        },
        timeoutMs: config.personTimeoutMs,
      }),
    });
  }
  if (config.fakeRoles) {
    app.log.warn('PLAYGROUND_FAKE_ROLES is on: development-only fake roles are registered');
    for (const role of devFakeRoles()) registry.register({ role });
  }
  for (const registration of options.roles ?? []) registry.register(registration);

  const scenarios = options.scenarios ?? { findScenario, listScenarios };
  const hooksFor =
    options.hooksFor ??
    (options.scenarios
      ? undefined
      : (scenario: ScenarioSpec): ScenarioHooks => {
          const definition = findScenarioDefinition(scenario.id);
          return definition ? scenarioHooks(definition) : {};
        });
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
    ...(hooksFor ? { hooksFor } : {}),
    logger: app.log,
    http: { fetch: transport, selfCapture, labelFor: serviceLabels(config) },
  });
  orchestratorRef.current = orchestrator;

  const services: PlaygroundServices = {
    config,
    store,
    bus,
    registry,
    orchestrator,
    scenarios,
    gaps: new GapRegister(config.gapsFile),
    capture,
    reference,
  };
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
  await app.register(reportRoutes, { services });
  await app.register(insightRoutes, { services });
  await app.register(websocketRoutes, { services });

  // Capture points: the inbound recorder must be installed before the routes it watches exist.
  installInboundRecorder(app, capture);
  await reference.register(app);
  await registerProxyRoutes(app, {
    hub: capture,
    targets: proxyTargets(config),
    fetch: network,
    timeoutMs: config.proxyTimeoutMs,
  });

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

/**
 * What the test authorization server needs for the holder-web profile: certify-ac's scope and audience, and
 * Mimoto as a private_key_jwt client with the key from the certificate the stack generated for it
 * (`$PLAYGROUND_RUN_DIR/stack/mimoto/oidc-client.crt`), when that file exists.
 */
function holderWebResources(
  config: Config,
): Pick<ReferenceHostingOptions, 'extraResources' | 'extraClients'> {
  const extraResources = [
    {
      scopes: [...CERTIFY_AC_SCOPES],
      audience: `${config.injiCertifyAcIssuer.replace(/\/+$/, '')}/v1/certify/issuance/credential`,
    },
  ];
  const certificate = join(config.runDir, 'stack', 'mimoto', 'oidc-client.crt');
  if (!existsSync(certificate)) return { extraResources };
  const jwk = new X509Certificate(readFileSync(certificate)).publicKey.export({ format: 'jwk' });
  return {
    extraResources,
    extraClients: [
      {
        clientId: MIMOTO_CLIENT_ID,
        redirectUris: [`${config.injiWebUrl.replace(/\/+$/, '')}/redirect`],
        authMethod: 'private_key_jwt',
        jwks: { keys: [{ ...jwk, alg: 'RS256', use: 'sig' }] },
      },
    ],
  };
}
