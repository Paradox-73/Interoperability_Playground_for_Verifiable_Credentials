/**
 * The selected combination as the rest of the page needs it: the role descriptors, the run settings
 * every role supports, the effective run configuration and the reasons it cannot run.
 */
import type { RoleDescriptor, RoleKind, RoleStatus, RunConfigInput } from '@inji-playground/protocol';
import { useMemo } from 'react';
import type { CompatibilityQuery } from '../../api/compatibility';
import { useRoles } from '../../api/queries';
import { usePlaygroundStore } from '../../state/playground';
import {
  findIncompatibilities,
  involvedKinds,
  resolveChoice,
  runOptions,
  type Incompatibility,
  type RoleTriple,
  type RunChoice,
  type RunOptions,
} from './compatibility';

export interface Combination {
  triple: RoleTriple;
  options: RunOptions;
  /** Effective run settings; undefined when the roles share no format or protocol version. */
  choice?: RunChoice;
  problems: Incompatibility[];
  /** All three roles chosen. */
  complete: boolean;
  /** The server query for this exact combination, when it passes the local check. */
  query: CompatibilityQuery | null;
}

export function evaluateCombination(triple: RoleTriple, preferred: Partial<RunChoice>): Combination {
  const options = runOptions(triple);
  const problems = findIncompatibilities(triple);
  const choice = resolveChoice(options, preferred);
  const { issuer, wallet, verifier } = triple;
  const complete = Boolean(issuer && wallet && verifier);
  const query =
    issuer && wallet && verifier && choice && problems.length === 0
      ? { issuer: issuer.id, wallet: wallet.id, verifier: verifier.id, ...choice }
      : null;
  return { triple, options, problems, complete, query, ...(choice ? { choice } : {}) };
}

/** Index of the role list by id. */
export function useRoleIndex(): Map<string, RoleStatus> {
  const { data } = useRoles();
  return useMemo(() => new Map((data ?? []).map((role) => [role.descriptor.id, role])), [data]);
}

export function useCombination(): Combination {
  const index = useRoleIndex();
  const selection = usePlaygroundStore((state) => state.selection);
  const preferred = usePlaygroundStore((state) => state.preferred);
  return useMemo(() => {
    const pick = (kind: RoleKind) => {
      const id = selection[kind];
      return id ? index.get(id)?.descriptor : undefined;
    };
    const triple: RoleTriple = {};
    const issuer = pick('issuer');
    const wallet = pick('wallet');
    const verifier = pick('verifier');
    if (issuer) triple.issuer = issuer;
    if (wallet) triple.wallet = wallet;
    if (verifier) triple.verifier = verifier;
    return evaluateCombination(triple, preferred);
  }, [index, selection, preferred]);
}

/**
 * What selecting `candidate` would mean: the combination with this card in its column, and the local
 * problems that concern this card (problems only between the two other columns are not its fault).
 */
export function candidateCombination(
  current: RoleTriple,
  candidate: RoleDescriptor,
  preferred: Partial<RunChoice>,
): { combination: Combination; ownProblems: Incompatibility[] } {
  const combination = evaluateCombination({ ...current, [candidate.kind]: candidate }, preferred);
  const ownProblems = combination.problems.filter((p) => involvedKinds(p).includes(candidate.kind));
  return { combination, ownProblems };
}

/** The body of `POST /api/runs` for a runnable combination. */
export function runConfigOf(combination: Combination, scenario = 'happy'): RunConfigInput | undefined {
  const { query } = combination;
  if (!query) return undefined;
  return { ...query, scenario };
}
