// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The playground's REST API as the matrix runner uses it: what is registered, start a run, wait for it
 * to finish, fetch its redacted export. Every answer is parsed with the protocol's zod schemas.
 */
import {
  CreateRunResponseSchema,
  RoleListResponseSchema,
  RunDetailSchema,
  RunExportSchema,
  ScenarioSpecSchema,
  type RoleStatus,
  type RunConfigInput,
  type RunDetail,
  type RunExport,
  type ScenarioSpec,
} from '@inji-playground/protocol';
import { z, type ZodType } from 'zod';

const HealthSchema = z.object({ status: z.string(), version: z.string() }).loose();

export class PlaygroundApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlaygroundApiError';
  }
}

export interface PlaygroundClientOptions {
  /** How often a run's status is read while waiting. Default 250 ms. */
  pollMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class PlaygroundClient {
  readonly baseUrl: string;
  readonly #pollMs: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(baseUrl: string, options: PlaygroundClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.#pollMs = options.pollMs ?? 250;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  /** The server's version; throws when it does not answer, with a hint on how to start one. */
  async version(): Promise<string> {
    try {
      return (await this.#get('/api/health', HealthSchema)).version;
    } catch (error) {
      if (error instanceof PlaygroundApiError) throw error;
      throw new PlaygroundApiError(
        `no playground server answers at ${this.baseUrl} (${messageOf(error)}); start one with "npm start", or use --reference`,
      );
    }
  }

  roles(): Promise<RoleStatus[]> {
    return this.#get('/api/roles', RoleListResponseSchema);
  }

  scenarios(): Promise<ScenarioSpec[]> {
    return this.#get('/api/scenarios', ScenarioSpecSchema.array());
  }

  async startRun(config: RunConfigInput): Promise<string> {
    const response = await this.#fetch(`${this.baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    });
    const body = await readJson(response);
    if (response.status !== 201) throw apiError('POST /api/runs', response.status, body);
    return CreateRunResponseSchema.parse(body).runId;
  }

  /** Resolves with the run once it has finished (its report stored); rejects after `timeoutMs`. */
  async waitForRun(runId: string, timeoutMs: number): Promise<RunDetail> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const run = await this.#get(`/api/runs/${encodeURIComponent(runId)}`, RunDetailSchema);
      if (run.status === 'finished' && run.report) return run;
      if (Date.now() > deadline) {
        throw new PlaygroundApiError(`run ${runId} did not finish within ${Math.round(timeoutMs / 1000)} s`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.#pollMs));
    }
  }

  exportRun(runId: string): Promise<RunExport> {
    return this.#get(`/api/runs/${encodeURIComponent(runId)}/export`, RunExportSchema);
  }

  async #get<T>(path: string, schema: ZodType<T>): Promise<T> {
    const response = await this.#fetch(`${this.baseUrl}${path}`, { headers: { accept: 'application/json' } });
    const body = await readJson(response);
    if (!response.ok) throw apiError(`GET ${path}`, response.status, body);
    return schema.parse(body);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text === '' ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return text;
  }
}

function apiError(what: string, status: number, body: unknown): PlaygroundApiError {
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String(body.message)
      : JSON.stringify(body);
  return new PlaygroundApiError(`${what} answered HTTP ${status}: ${message}`, status);
}

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}
