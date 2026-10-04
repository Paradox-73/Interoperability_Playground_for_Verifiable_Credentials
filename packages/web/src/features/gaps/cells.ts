/**
 * Matching gap-register cell patterns against matrix cell ids, the same rule the server applies
 * (protocol `GapSchema.cells`): ids are `issuer/wallet/verifier/format/vpProfile/scenario`, a `*`
 * segment matches any value, and trailing segments may be left out.
 *
 * Formats contain `+` (`vc+sd-jwt`) but never `/`, so splitting on `/` is safe.
 */
import type { Gap } from '@inji-playground/protocol';

export function cellMatches(pattern: string, cellId: string): boolean {
  const want = pattern.split('/');
  const have = cellId.split('/');
  if (want.length > have.length) return false;
  return want.every((segment, index) => segment === '*' || segment === have[index]);
}

/** The gaps linked to a matrix cell, by pattern or by an explicit id the matrix gave the cell. */
export function gapsForCell(gaps: readonly Gap[], cellId: string, explicitIds: readonly string[] = []): Gap[] {
  return gaps.filter(
    (gap) => explicitIds.includes(gap.id) || gap.cells.some((pattern) => cellMatches(pattern, cellId)),
  );
}
