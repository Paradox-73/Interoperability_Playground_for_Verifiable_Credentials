/**
 * @inji-playground/server as a library: lets the CLI and tests start a server in-process.
 */
export { buildApp, type BuildAppOptions } from './app.js';
export { ConfigSchema, loadConfig, type Config } from './config/index.js';
export { SERVER_VERSION } from './version.js';
