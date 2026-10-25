// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * @inji-playground/server as a library: lets the CLI and tests start a server in-process.
 */
export { buildApp, type BuildAppOptions } from './app.js';
export type { PlaygroundServices } from './api/services.js';
export { ConfigSchema, databasePath, loadConfig, type Config } from './config/index.js';
export { EventBus } from './events/index.js';
export * from './gaps/index.js';
export * from './matrix/index.js';
export * from './metrics/index.js';
export * from './orchestrator/index.js';
export * from './recording/index.js';
export * from './reports/index.js';
export * from './store/index.js';
export { SERVER_VERSION } from './version.js';
