/**
 * The Inji versions a report names (`INJI_IMAGES`) must be the images the stack runs: a bump in
 * `deploy/inji-stack/compose.yaml` alone would otherwise report the old version.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { INJI_IMAGES } from '../src/adapters/inji/common.js';

const compose = parse(
  readFileSync(new URL('../../../deploy/inji-stack/compose.yaml', import.meta.url), 'utf8'),
) as { services: Record<string, { image?: string }> };

describe('INJI_IMAGES', () => {
  it('lists exactly the Inji images of the stack compose file', () => {
    const stackImages = new Set(
      Object.values(compose.services)
        .map((service) => service.image)
        .filter((image) => image?.startsWith('injistack/')),
    );
    expect([...stackImages].sort()).toEqual([...new Set(Object.values(INJI_IMAGES))].sort());
  });
});
