// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { readFileSync } from 'node:fs';

/** Version of the playground server, from its package.json (one level above src/ and dist/). */
export const SERVER_VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
