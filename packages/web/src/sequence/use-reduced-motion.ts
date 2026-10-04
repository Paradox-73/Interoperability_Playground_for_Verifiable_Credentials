/**
 * Whether the person asked the operating system for reduced motion (`prefers-reduced-motion: reduce`,
 * WCAG 2.3.3). Follows changes while the page is open.
 */
import { useEffect, useState } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function query(): MediaQueryList | undefined {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : undefined;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const media = query();
    if (!media) return;
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
