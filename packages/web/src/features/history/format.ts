/**
 * Display helpers for evidence pages. Times are shown in UTC with the zone written out, so a screenshot
 * or a printed report means the same thing to every reader, wherever they are.
 */
import { formatDuration } from '../../state/run-view';

/** `2026-10-04T10:00:00.160Z` -> `2026-10-04 10:00 UTC`. */
export function formatUtc(iso: string | undefined): string {
  if (!iso) return '—';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** 0.875 -> `87.5 %`; null (nothing measured) -> `—`. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 1000) / 10} %`;
}

/** Milliseconds as on the timeline (`850 ms`, `1.2 s`); null -> `—`. */
export function formatMs(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : formatDuration(ms);
}
