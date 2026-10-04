/**
 * Loads Mermaid on first use. Mermaid and its diagram renderers are several hundred kilobytes, so the
 * dynamic `import()` keeps them out of the main bundle: Vite puts them in a separate chunk that the
 * browser downloads only when a run's diagram is first shown.
 *
 * This file is the only place that loads `mermaid` (its type import is erased at build time);
 * `test/sequence-lazy.test.ts` fails if a static import appears anywhere.
 */
import type { Mermaid } from 'mermaid';

/** The part of the Mermaid API the diagram uses. */
export interface MermaidRenderer {
  render: (id: string, source: string) => Promise<{ svg: string }>;
}

export type DiagramTheme = 'default' | 'dark';

let loading: Promise<Mermaid> | undefined;

export async function loadMermaid(theme: DiagramTheme): Promise<MermaidRenderer> {
  loading ??= import('mermaid').then((module) => module.default);
  let mermaid: Mermaid;
  try {
    mermaid = await loading;
  } catch (error) {
    // Let the next attempt try again (for example after a network hiccup loading the chunk).
    loading = undefined;
    throw error;
  }
  mermaid.initialize({
    startOnLoad: false,
    // Labels come from recorded traffic: strict mode escapes HTML in them and disables click scripts.
    securityLevel: 'strict',
    theme,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    sequence: { useMaxWidth: true, showSequenceNumbers: false, wrap: false, mirrorActors: false },
  });
  return { render: (id, source) => mermaid.render(id, source) };
}
