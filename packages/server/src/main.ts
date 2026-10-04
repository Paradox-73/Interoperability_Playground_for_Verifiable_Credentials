#!/usr/bin/env node
/**
 * Entry point of the playground server: `npm start` (built) or `npm run dev` (from source, with reload).
 */
import { buildApp } from './app.js';
import { loadConfig } from './config/index.js';

const config = loadConfig();
const app = await buildApp({ config });

let closing = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  app.close().then(
    () => process.exit(0),
    (error: unknown) => {
      app.log.error(error, 'shutdown failed');
      process.exit(1);
    },
  );
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.fatal(error, 'could not start the playground server');
  process.exit(1);
}
