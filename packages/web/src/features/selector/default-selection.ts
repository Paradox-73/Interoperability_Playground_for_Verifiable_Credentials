/**
 * The combination preselected on the first visit (PS02 task 2: "starting with all three being Inji
 * modules"):
 *
 * 1. healthy Inji modules in all three columns, if some such combination is compatible;
 * 2. otherwise healthy reference roles;
 * 3. otherwise reference roles whatever their health (they run inside the playground server, so a
 *    failed probe usually means the probe, not the role, is broken).
 *
 * Within a tier, roles that run automatically come before roles needing this browser tab or a person,
 * so the default run never waits for a phone. Ties keep the server's order.
 */
import type {
  Ecosystem,
  Interaction,
  RoleDescriptor,
  RoleId,
  RoleKind,
  RoleStatus,
} from '@inji-playground/protocol';
import { findIncompatibilities } from './compatibility';

export type Selection = Record<RoleKind, RoleId>;
export type DefaultBasis = 'inji' | 'reference';

export interface DefaultSelection {
  selection: Selection;
  basis: DefaultBasis;
}

const INTERACTION_RANK: Record<Interaction, number> = { automatic: 0, browser: 1, manual: 2 };

interface Tier {
  basis: DefaultBasis;
  ecosystem: Ecosystem;
  healthyOnly: boolean;
}

const TIERS: readonly Tier[] = [
  { basis: 'inji', ecosystem: 'inji', healthyOnly: true },
  { basis: 'reference', ecosystem: 'reference', healthyOnly: true },
  { basis: 'reference', ecosystem: 'reference', healthyOnly: false },
];

function candidates(roles: readonly RoleStatus[], kind: RoleKind, tier: Tier): RoleDescriptor[] {
  return roles
    .filter(
      ({ descriptor, health }) =>
        descriptor.kind === kind &&
        descriptor.ecosystem === tier.ecosystem &&
        (!tier.healthyOnly || health.status === 'up'),
    )
    .map(({ descriptor }) => descriptor)
    .sort((a, b) => INTERACTION_RANK[a.interaction] - INTERACTION_RANK[b.interaction]);
}

export function pickDefaultSelection(roles: readonly RoleStatus[]): DefaultSelection | undefined {
  for (const tier of TIERS) {
    for (const issuer of candidates(roles, 'issuer', tier)) {
      for (const wallet of candidates(roles, 'wallet', tier)) {
        for (const verifier of candidates(roles, 'verifier', tier)) {
          if (findIncompatibilities({ issuer, wallet, verifier }).length === 0) {
            return {
              basis: tier.basis,
              selection: { issuer: issuer.id, wallet: wallet.id, verifier: verifier.id },
            };
          }
        }
      }
    }
  }
  return undefined;
}
