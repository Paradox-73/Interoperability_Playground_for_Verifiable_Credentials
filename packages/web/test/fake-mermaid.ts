/**
 * Stand-in for Mermaid in jsdom, which cannot lay out SVG text (no getBBox). It reads the generated
 * diagram source and writes the same element classes Mermaid 11 writes for a sequence diagram: `<title>`
 * and `<desc>` from accTitle and accDescr, then one `.messageText` and one `.messageLine0` / `.messageLine1`
 * per message, so the component's post-processing is tested against the real class names.
 *
 * Use with: vi.mock('mermaid', async () => (await import('./fake-mermaid')).fakeMermaidModule())
 * The real loader (src/sequence/mermaid-loader.ts) then runs against this stand-in.
 */
import type { MermaidRenderer } from '../src/sequence/mermaid-loader';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const renderedSources: string[] = [];

export const fakeRenderer: MermaidRenderer = {
  render(id, source) {
    renderedSources.push(source);
    const parts: string[] = [];
    let title = '';
    let desc = '';
    for (const line of source.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('accTitle:')) title = trimmed.slice('accTitle:'.length).trim();
      else if (trimmed.startsWith('accDescr:')) desc = trimmed.slice('accDescr:'.length).trim();
      else if (trimmed.startsWith('Note over'))
        parts.push(`<text class="noteText">${escape(trimmed)}</text>`);
      else {
        const message = /^(\w+)(->>|-x)(\w+): (.*)$/.exec(trimmed);
        if (message) {
          parts.push(`<text class="messageText">${escape(message[4]!)}</text>`);
          parts.push(`<line class="messageLine0" data-from="${message[1]}" data-to="${message[3]}"></line>`);
        }
      }
    }
    const svg =
      `<svg id="${id}" role="graphics-document document" aria-roledescription="sequence" aria-labelledby="${id}-title" aria-describedby="${id}-desc">` +
      `<title id="${id}-title">${escape(title)}</title><desc id="${id}-desc">${escape(desc)}</desc>${parts.join('')}</svg>`;
    return Promise.resolve({ svg });
  },
};

/** Module shape of `mermaid` as the loader uses it. */
export function fakeMermaidModule() {
  return { default: { initialize: () => undefined, render: fakeRenderer.render } };
}

/** Makes `matchMedia('(prefers-reduced-motion: reduce)')` answer `reduced`; other queries answer false. */
export function stubReducedMotion(reduced: boolean): void {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion') ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
