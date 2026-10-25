// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Mermaid must stay out of the main bundle: only `src/sequence/mermaid-loader.ts` may import it, and only
 * with a dynamic `import()`, which Vite turns into a separate chunk. A static import anywhere would pull
 * several hundred kilobytes into the first page load.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom gives test modules an http: import.meta.url, so the folder is found from the working directory
// (the repository root under `npm test -w`, or this package).
const SRC = [resolve('packages/web/src'), resolve('src')].find((dir) =>
  existsSync(join(dir, 'sequence', 'mermaid-loader.ts')),
)!;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('Mermaid is lazy-loaded', () => {
  it('no source file imports mermaid statically', () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /^\s*import\s+(?!type\s)[^;]*from\s+['"]mermaid['"]/m.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });

  it('the loader is the only file that imports it, dynamically', () => {
    const importers = sourceFiles(SRC).filter((file) =>
      /import\(\s*['"]mermaid['"]\s*\)/.test(readFileSync(file, 'utf8')),
    );
    expect(importers.map((file) => relative(SRC, file).split(sep).join('/'))).toEqual([
      'sequence/mermaid-loader.ts',
    ]);
  });
});
