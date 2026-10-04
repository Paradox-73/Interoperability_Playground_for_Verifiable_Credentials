#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { USAGE, parseCli } from './index.js';

const version = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

try {
  const invocation = parseCli(process.argv.slice(2));
  switch (invocation.command) {
    case 'help':
      console.log(USAGE);
      break;
    case 'version':
      console.log(version);
      break;
    case 'run':
    case 'matrix':
      console.error(`inji-playground ${invocation.command}: not implemented yet (WP-15)`);
      process.exitCode = 1;
      break;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
