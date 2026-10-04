/**
 * `GET /ws`: live run events. A client subscribes to one run (it first receives that run's stored
 * events, so a page opened mid-run misses nothing) or to every run (`*`, for history and matrix pages).
 *
 * Client -> server: `{"type":"subscribe","runId":"<id>|*"}` and `{"type":"unsubscribe",...}`; the query
 * `?runId=<id>|*` subscribes at connection time. Server -> client: `subscribed` / `unsubscribed`
 * acknowledgements, `error` for a malformed message, and `RunEvent` objects. A client subscribed to a
 * run and to `*` receives that run's events twice.
 */
import {
  RunIdSchema,
  WsClientMessageSchema,
  type RunEvent,
  type WsServerMessage,
} from '@inji-playground/protocol';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { RouteOptions } from './services.js';

const ALL = '*';

export const websocketRoutes: FastifyPluginCallbackZod<RouteOptions> = (app, { services }, done) => {
  const { bus, store } = services;

  app.get(
    '/ws',
    {
      websocket: true,
      schema: {
        summary: 'WebSocket stream of run events (upgrade required)',
        description:
          'Send `{"type":"subscribe","runId":"<id>"}` (or `"*"` for every run). A subscription to one run first replays its stored events, then streams new ones. Every message is a `RunEvent`, or a `subscribed` / `unsubscribed` / `error` message.',
        tags: ['runs'],
        querystring: z.object({ runId: z.union([RunIdSchema, z.literal(ALL)]).optional() }),
      },
    },
    (socket, request) => {
      const subscriptions = new Map<string, () => void>();
      const send = (message: WsServerMessage | RunEvent): void => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      };

      const subscribe = (runId: string): void => {
        if (subscriptions.has(runId)) {
          send({ type: 'subscribed', runId });
          return;
        }
        if (runId === ALL) {
          send({ type: 'subscribed', runId });
          subscriptions.set(runId, bus.subscribeAll(send));
          return;
        }
        if (!store.getRun(runId)) {
          send({ type: 'error', message: `no run with id "${runId}"` });
          return;
        }
        // Replay and attach in one synchronous block: the orchestrator also stores and publishes
        // synchronously, so no event can fall between the stored ones and the live ones.
        send({ type: 'subscribed', runId });
        for (const event of store.listEvents(runId)) send(event);
        subscriptions.set(runId, bus.subscribeRun(runId, send));
      };

      const unsubscribe = (runId: string): void => {
        subscriptions.get(runId)?.();
        subscriptions.delete(runId);
        send({ type: 'unsubscribed', runId });
      };

      socket.on('message', (data: Buffer) => {
        let parsed: ReturnType<typeof WsClientMessageSchema.safeParse>;
        try {
          parsed = WsClientMessageSchema.safeParse(JSON.parse(data.toString('utf8')));
        } catch {
          send({ type: 'error', message: 'messages must be JSON' });
          return;
        }
        if (!parsed.success) {
          send({ type: 'error', message: `invalid message: ${z.prettifyError(parsed.error)}` });
          return;
        }
        if (parsed.data.type === 'subscribe') subscribe(parsed.data.runId);
        else unsubscribe(parsed.data.runId);
      });

      socket.on('close', () => {
        for (const stop of subscriptions.values()) stop();
        subscriptions.clear();
      });

      if (request.query.runId) subscribe(request.query.runId);
    },
  );
  done();
};
