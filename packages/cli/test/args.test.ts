import { describe, expect, it } from 'vitest';
import { parseCli } from '../src/index.js';

describe('parseCli', () => {
  it('defaults to help and to the local server on port 28100', () => {
    expect(parseCli([])).toMatchObject({
      command: 'help',
      server: 'http://localhost:28100',
      reference: false,
    });
  });

  it('reads the matrix options', () => {
    expect(parseCli(['matrix', '--reference', '--spec', 'specs/reference.yaml', '--out', 'out'])).toEqual({
      command: 'matrix',
      server: 'http://localhost:28100',
      reference: true,
      spec: 'specs/reference.yaml',
      out: 'out',
    });
  });

  it('rejects an unknown command with the usage text', () => {
    expect(() => parseCli(['deploy'])).toThrow(/unknown command "deploy"[\s\S]*Usage:/);
  });
});
