import type { Config } from '../config/index.js';
import type { EventBus } from '../events/bus.js';
import type { GapRegister } from '../gaps/register.js';
import type { Orchestrator, ScenarioCatalogue } from '../orchestrator/orchestrator.js';
import type { RoleRegistry } from '../orchestrator/registry.js';
import type { RunStore } from '../store/run-store.js';

/** The objects route plugins share; created once by `buildApp` and exposed as `app.playground`. */
export interface PlaygroundServices {
  config: Config;
  store: RunStore;
  bus: EventBus;
  registry: RoleRegistry;
  orchestrator: Orchestrator;
  scenarios: ScenarioCatalogue;
  /** The interoperability gap register (`docs/gaps/gaps.json`). */
  gaps: GapRegister;
}

/** Options every route plugin of the playground receives. */
export interface RouteOptions {
  services: PlaygroundServices;
}
