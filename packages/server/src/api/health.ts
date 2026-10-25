// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { ServerHealthSchema, type ServerHealth } from '@inji-playground/protocol';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { SERVER_VERSION } from '../version.js';

/** `GET /api/health`: liveness of the server process only; the Inji stack is reported by `/api/stack/status`. */
export const healthRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  const startedAt = process.hrtime.bigint();
  app.get(
    '/api/health',
    {
      schema: {
        summary: 'Liveness of the playground server',
        tags: ['system'],
        response: { 200: ServerHealthSchema },
      },
    },
    (): ServerHealth => ({
      status: 'ok',
      service: 'inji-interop-playground',
      version: SERVER_VERSION,
      uptimeSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
      time: new Date().toISOString(),
    }),
  );
  done();
};
