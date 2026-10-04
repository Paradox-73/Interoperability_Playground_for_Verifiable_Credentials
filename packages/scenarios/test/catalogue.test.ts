import { ScenarioSpecSchema } from '@inji-playground/protocol';
import { describe, expect, it } from 'vitest';
import { findScenario, listScenarios } from '../src/index.js';

describe('scenario catalogue', () => {
  it('contains the happy path, which expects VALID and tampers with nothing', () => {
    expect(findScenario('happy')).toMatchObject({ expected: 'VALID', target: 'none' });
  });

  it('lists only scenarios that satisfy the shared schema, with unique ids', () => {
    const scenarios = listScenarios();
    for (const s of scenarios) expect(ScenarioSpecSchema.safeParse(s).success).toBe(true);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it('returns undefined for an unknown id', () => {
    expect(findScenario('no-such-scenario')).toBeUndefined();
  });
});
