/**
 * Test helpers around the synthetic role catalogue: descriptors validated against the shared contract,
 * with health set per test.
 */
import {
  RoleDescriptorSchema,
  type HealthStatus,
  type RoleDescriptor,
  type RoleStatus,
} from '@inji-playground/protocol';
import catalogue from './roles.synthetic.json';

export const CHECKED_AT = '2026-10-04T10:00:00.000Z';

export const DESCRIPTORS: readonly RoleDescriptor[] = RoleDescriptorSchema.array().parse(catalogue.roles);

export function descriptor(id: string): RoleDescriptor {
  const found = DESCRIPTORS.find((d) => d.id === id);
  if (!found) throw new Error(`no role ${id} in the synthetic catalogue`);
  return found;
}

/**
 * The catalogue as `GET /api/roles` returns it. Every role is healthy unless `health` says otherwise;
 * `ecosystem` sets the status of every role of one ecosystem at once.
 */
export function roleStatuses(
  options: {
    health?: Record<string, HealthStatus>;
    ecosystem?: Partial<Record<RoleDescriptor['ecosystem'], HealthStatus>>;
    only?: readonly string[];
  } = {},
): RoleStatus[] {
  return DESCRIPTORS.filter((d) => !options.only || options.only.includes(d.id)).map((d) => ({
    descriptor: d,
    health: {
      status: options.health?.[d.id] ?? options.ecosystem?.[d.ecosystem] ?? 'up',
      checkedAt: CHECKED_AT,
      latencyMs: 12,
    },
  }));
}
