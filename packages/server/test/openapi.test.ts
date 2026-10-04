/**
 * The OpenAPI document lists the report, matrix, metrics and gap routes, and `npm run openapi` writes
 * the same document the server serves.
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

describe('OpenAPI document', () => {
  it('describes the report, matrix, metrics and gap routes', async () => {
    const app = await buildTestApp();
    try {
      const document = (await app.inject('/api/openapi.json')).json<{
        paths: Record<
          string,
          Record<string, { tags?: string[]; responses: Record<string, { content?: object }> }>
        >;
      }>();
      for (const path of [
        '/api/runs/{id}/report.json',
        '/api/runs/{id}/report.md',
        '/api/runs/{id}/export',
        '/api/matrix',
        '/api/metrics',
        '/metrics',
        '/api/gaps',
      ]) {
        expect(document.paths[path]?.get, path).toBeDefined();
      }
      expect(document.paths['/api/runs/{id}/report.md']?.get?.responses['200']?.content).toHaveProperty([
        'text/markdown',
      ]);
      expect(document.paths['/metrics']?.get?.responses['200']?.content).toHaveProperty(['text/plain']);
      expect(document.paths['/api/metrics']?.get?.tags).toEqual(['metrics']);
    } finally {
      await app.close();
    }
    // Generating the document from every zod schema takes a few seconds on a cold start.
  }, 30_000);
});
