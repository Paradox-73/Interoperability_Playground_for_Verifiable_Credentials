/**
 * @inji-playground/scenarios: the happy path, the tamper scenarios and the valid probe variants a run
 * can apply, each with the outcome a correct verifier must report and the specification text that
 * makes it correct.
 *
 * - `scenarioCatalog`: the definitions (data). `listScenarios()` / `findScenario()` give the
 *   `ScenarioSpec` view the API serves; `findScenarioDefinition()` the full entry roles act on.
 * - `scenarioHooks()`: orchestrator hooks; `issuanceOptionsFor()` and friends: reference issuer input;
 *   `respondWithScenario()`: the reference wallet's answer to a request under a scenario.
 * - `scenarioApplies()` / `referenceCells()`: which combinations a scenario can run on.
 */
import { ScenarioSpecSchema, type ScenarioSpec } from '@inji-playground/protocol';
import { scenarioCatalog, type ScenarioDefinition } from './catalogue.js';

export * from './catalogue.js';
export * from './issuer.js';
export * from './tamper.js';
export * from './wallet.js';
export * from './hooks.js';

const byId: ReadonlyMap<string, ScenarioDefinition> = new Map(
  scenarioCatalog.map((scenario) => [scenario.id, scenario]),
);
// Parsed once at load: a catalogue entry that breaks the shared schema stops the server at start-up.
const specs: readonly ScenarioSpec[] = scenarioCatalog.map((scenario) => ScenarioSpecSchema.parse(scenario));
const specById: ReadonlyMap<string, ScenarioSpec> = new Map(specs.map((spec) => [spec.id, spec]));

/** The happy path as a `ScenarioSpec`. */
export const happy: ScenarioSpec = specById.get('happy')!;

/** Every scenario as the API serves it (protocol fields only), in the order the UI lists them. */
export function listScenarios(): ScenarioSpec[] {
  return [...specs];
}

/** The scenario with this id as the API serves it, or `undefined` when there is none. */
export function findScenario(id: string): ScenarioSpec | undefined {
  return specById.get(id);
}

/** The full definition (issuer variant, tampering, wallet behaviour) of a scenario. */
export function findScenarioDefinition(id: string): ScenarioDefinition | undefined {
  return byId.get(id);
}
