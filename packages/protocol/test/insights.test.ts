/**
 * Schemas of derived data: matrix query defaults, gap register entries and metric durations.
 */
import { describe, expect, it } from 'vitest';
import { DurationStatsSchema, GapSchema, MatrixQuerySchema, MetricsQuerySchema } from '../src/index.js';

describe('insight schemas', () => {
  it('default the matrix query to JSON, the happy path and every cell', () => {
    expect(MatrixQuerySchema.parse({})).toEqual({
      format: 'json',
      scenario: 'happy',
      hideNotSupported: false,
    });
    expect(MatrixQuerySchema.parse({ format: 'md', hideNotSupported: 'true' })).toMatchObject({
      format: 'md',
      hideNotSupported: true,
    });
    expect(MatrixQuerySchema.safeParse({ credentialFormat: 'pdf' }).success).toBe(false);
  });

  it('default gap entries to public with no linked cells, and require id, title and repository', () => {
    expect(GapSchema.parse({ id: 'G1', title: 't', repository: 'mosip/inji-certify' })).toEqual({
      id: 'G1',
      title: 't',
      repository: 'mosip/inji-certify',
      cells: [],
      disclosure: 'public',
    });
    expect(GapSchema.safeParse({ id: 'G1', repository: 'r' }).success).toBe(false);
    expect(GapSchema.safeParse({ id: 'G1', title: 't', repository: 'r', severity: 'urgent' }).success).toBe(
      false,
    );
  });

  it('allow null percentiles for steps that never ran, and no paging on metrics', () => {
    expect(
      DurationStatsSchema.safeParse({ count: 0, sumMs: 0, p50Ms: null, p95Ms: null, maxMs: null }).success,
    ).toBe(true);
    expect(MetricsQuerySchema.parse({ limit: '5', format: 'ldp_vc' })).toEqual({ format: 'ldp_vc' });
  });
});
