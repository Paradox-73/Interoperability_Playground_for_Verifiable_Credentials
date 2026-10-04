/**
 * @inji-playground/scenarios: the catalogue of scenarios a run can apply.
 *
 * Only the happy path exists so far; the tamper scenarios (expired, wrong type, bad signature, altered
 * disclosure, replayed nonce, ...) are added with their expected outcomes in a later package.
 */
import { ScenarioSpecSchema, type ScenarioSpec } from '@inji-playground/protocol';

export const happy: ScenarioSpec = ScenarioSpecSchema.parse({
  id: 'happy',
  title: 'Happy path',
  description:
    'The issuer issues a valid credential, the wallet presents it unchanged, and the verifier must accept it.',
  expected: 'VALID',
  target: 'none',
});

const catalogue: ReadonlyMap<string, ScenarioSpec> = new Map([[happy.id, happy]]);

/** Every scenario, in the order the UI lists them. */
export function listScenarios(): ScenarioSpec[] {
  return [...catalogue.values()];
}

/** The scenario with this id, or `undefined` when there is none. */
export function findScenario(id: string): ScenarioSpec | undefined {
  return catalogue.get(id);
}
