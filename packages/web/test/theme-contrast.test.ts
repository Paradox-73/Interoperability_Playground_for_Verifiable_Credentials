/**
 * WCAG 2.2 AA contrast of the light and dark themes, computed from the colour tokens in src/index.css
 * (jsdom cannot render colours, so axe's contrast rule cannot run in unit tests).
 *
 * - 1.4.3: text pairs need 4.5:1.
 * - 1.4.11: control borders and the focus ring need 3:1 against the backgrounds they sit on.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Under jsdom, import.meta.url is not a file URL, so the path is built from the module's folder.
const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in index.css`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--c-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m): [string, string] => [m[1]!, m[2]!]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = ['bg', 'surface', 'surface-muted', 'accent-soft'];
const TEXT = ['text', 'text-muted', 'accent', 'ok', 'fail', 'warn', 'info'];

const themes = { light: tokens(':root'), dark: tokens(":root[data-theme='dark']") };

describe.each(Object.entries(themes))('%s theme', (_name, theme) => {
  it('defines every token the checks need', () => {
    for (const token of [...BACKGROUNDS, ...TEXT, 'accent-text', 'line-strong', 'focus']) {
      expect(theme[token], token).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))(
    'text colour %s on %s reaches 4.5:1',
    (fg, bg) => {
      expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('button text on the accent colour reaches 4.5:1', () => {
    expect(contrast(theme['accent-text']!, theme.accent!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(
    ['line-strong', 'focus', 'accent'].flatMap((fg) =>
      ['bg', 'surface', 'surface-muted'].map((bg) => [fg, bg] as const),
    ),
  )('control colour %s on %s reaches 3:1', (fg, bg) => {
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('contrast()', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
