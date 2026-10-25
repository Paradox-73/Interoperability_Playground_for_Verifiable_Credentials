// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * One error body for every failure: `{ error, message, details? }` (`ApiErrorSchema`). Request
 * validation errors become 400 with the zod issues as details; refusals from the orchestrator keep
 * their own code and status; anything else is a 500 whose detail stays in the server log.
 */
import type { ApiError } from '@inji-playground/protocol';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { RunRequestError } from '../orchestrator/errors.js';

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: ApiError = {
        error: 'bad-request',
        message: error.message,
        details: error.validation.map((issue) => ({ path: issue.instancePath, message: issue.message })),
      };
      return reply.code(400).send(body);
    }
    if (error instanceof RunRequestError) {
      return reply.code(error.status).send({ error: error.code, message: error.message } satisfies ApiError);
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, cause: error.cause }, 'response did not match its schema');
      return reply
        .code(500)
        .send({ error: 'internal', message: 'response did not match its schema' } satisfies ApiError);
    }
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'request failed');
    return reply
      .code(status)
      .send({ error: status >= 500 ? 'internal' : 'bad-request', message: error.message } satisfies ApiError);
  });
}
