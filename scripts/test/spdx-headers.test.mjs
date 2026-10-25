// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
// Every tracked source file the team wrote starts with the MPL-2.0 SPDX header (after a shebang).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('licence headers', () => {
  it('start every tracked source file', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((file) => /\.(ts|tsx|mjs|js|cjs|sh)$/.test(file));
    expect(files.length).toBeGreaterThan(300);
    const missing = files.filter((file) => {
      const lines = readFileSync(root + file, 'utf8').split(/\r?\n/);
      if (lines[0].startsWith('#!')) lines.shift();
      return !/^(\/\/|#) SPDX-License-Identifier: MPL-2\.0$/.test(lines[0]);
    });
    expect(missing).toEqual([]);
  });
});
