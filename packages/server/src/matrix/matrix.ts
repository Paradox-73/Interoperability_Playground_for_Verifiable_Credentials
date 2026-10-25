// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The compatibility matrix: one cell per issuer x wallet x verifier x format x OpenID4VP profile x
 * scenario. A cell shows the verdict of its newest finished run; a combination that was never run is
 * listed from the compatibility check, either as `untested` (it could run) or `not-supported` with
 * the reasons. The matrix is a pure function of stored runs and registered roles, so the API, the CLI
 * and the tests all build it the same way.
 */
import {
  CREDENTIAL_FORMATS,
  VpProfileSchema,
  type CompatibilityResult,
  type CredentialFormat,
  type Matrix,
  type MatrixCell,
  type MatrixCellKey,
  type MatrixCellStatus,
  type MatrixLatestRun,
  type MatrixQuery,
  type MatrixRole,
  type RoleDescriptor,
  type RunDetail,
  type ScenarioSpec,
  type VciProfile,
  type VpProfile,
} from '@inji-playground/protocol';
import { cellId } from '../gaps/register.js';
import { checkCompatibility, runModeOf } from '../orchestrator/compatibility.js';
import type { CellLatestRun } from '../store/run-store.js';

const VP_PROFILES = VpProfileSchema.options;
/** A cell has no VCI profile in its key; it can run if either profile works, draft 13 tried first. */
const VCI_PROFILES: readonly VciProfile[] = ['draft13', 'v1'];

export interface MatrixInput {
  query: MatrixQuery;
  /** Registered roles, in registration order (the order of the selector columns). */
  roles: readonly RoleDescriptor[];
  /** Newest finished run per cell, from `RunStore.latestRunPerCell`. */
  stored: readonly CellLatestRun[];
  findScenario: (id: string) => ScenarioSpec | undefined;
  gapIdsFor: (key: MatrixCellKey) => string[];
  playgroundVersion: string;
  now?: Date;
}

/** Compatibility of a cell for the roles as registered now; undefined when a role or the scenario is unknown. */
function compatibilityOf(
  key: MatrixCellKey,
  byId: ReadonlyMap<string, RoleDescriptor>,
  findScenario: MatrixInput['findScenario'],
): CompatibilityResult | undefined {
  const issuer = byId.get(key.issuer);
  const wallet = byId.get(key.wallet);
  const verifier = byId.get(key.verifier);
  const scenario = findScenario(key.scenario);
  if (!issuer || !wallet || !verifier || !scenario) return undefined;
  let first: CompatibilityResult | undefined;
  for (const vciProfile of VCI_PROFILES) {
    const result = checkCompatibility({
      issuer,
      wallet,
      verifier,
      format: key.format,
      vciProfile,
      vpProfile: key.vpProfile,
      scenario,
    });
    if (result.runnable) return result;
    first ??= result;
  }
  return first;
}

function latestRunOf(run: RunDetail): MatrixLatestRun {
  return {
    runId: run.runId,
    createdAt: run.createdAt,
    mode: run.mode,
    vciProfile: run.config.vciProfile,
    ...(run.outcome ? { outcome: run.outcome } : {}),
    ...(run.verdict ? { verdict: run.verdict } : {}),
    ...(run.report ? { credentialProof: run.report.credentialProof } : {}),
    ...(run.error ? { error: run.error } : {}),
    versions: run.versions,
  };
}

function keyOf(run: RunDetail): MatrixCellKey {
  const { issuer, wallet, verifier, format, vpProfile, scenario } = run.config;
  return { issuer, wallet, verifier, format, vpProfile, scenario };
}

export function buildMatrix(input: MatrixInput): Matrix {
  const { query } = input;
  const now = input.now ?? new Date();
  const byId = new Map(input.roles.map((role) => [role.id, role]));
  const cells = new Map<string, MatrixCell>();

  // 1. Cells with stored runs (the store already applied the role, format and mode filters).
  for (const { run, counts } of input.stored) {
    const key = keyOf(run);
    if (query.vpProfile && key.vpProfile !== query.vpProfile) continue;
    const compatibility = compatibilityOf(key, byId, input.findScenario);
    const status: MatrixCellStatus = run.verdict ?? 'error';
    cells.set(cellId(key), {
      id: cellId(key),
      key,
      status,
      source: 'run',
      latestRun: latestRunOf(run),
      counts,
      reasons: compatibility?.reasons ?? [],
      gapIds: input.gapIdsFor(key),
    });
  }

  // 2. Every other combination of registered roles, for the requested scenario, from the check alone.
  const scenario = input.findScenario(query.scenario);
  if (scenario) {
    const ofKind = (kind: RoleDescriptor['kind'], wanted?: string) =>
      input.roles.filter((role) => role.kind === kind && (wanted === undefined || role.id === wanted));
    const formats: readonly CredentialFormat[] = query.credentialFormat
      ? [query.credentialFormat]
      : CREDENTIAL_FORMATS;
    const vpProfiles: readonly VpProfile[] = query.vpProfile ? [query.vpProfile] : VP_PROFILES;
    for (const issuer of ofKind('issuer', query.issuer))
      for (const wallet of ofKind('wallet', query.wallet))
        for (const verifier of ofKind('verifier', query.verifier)) {
          if (query.mode && runModeOf([issuer, wallet, verifier]) !== query.mode) continue;
          for (const format of formats)
            for (const vpProfile of vpProfiles) {
              const key: MatrixCellKey = {
                issuer: issuer.id,
                wallet: wallet.id,
                verifier: verifier.id,
                format,
                vpProfile,
                scenario: scenario.id,
              };
              const id = cellId(key);
              if (cells.has(id)) continue;
              const compatibility = compatibilityOf(key, byId, input.findScenario);
              const runnable = compatibility?.runnable ?? false;
              cells.set(id, {
                id,
                key,
                status: runnable ? 'untested' : 'not-supported',
                source: 'compatibility',
                counts: { runs: 0, pass: 0, fail: 0, error: 0, notSupported: 0 },
                reasons: compatibility?.reasons ?? [],
                gapIds: input.gapIdsFor(key),
              });
            }
        }
  }

  let list = [...cells.values()];
  if (query.hideNotSupported) list = list.filter((cell) => cell.status !== 'not-supported');
  list.sort(cellOrder(input.roles));

  const totals = { cells: list.length, pass: 0, fail: 0, error: 0, notSupported: 0, untested: 0 };
  for (const cell of list) {
    if (cell.status === 'not-supported') totals.notSupported += 1;
    else totals[cell.status] += 1;
  }

  return {
    generatedAt: now.toISOString(),
    playgroundVersion: input.playgroundVersion,
    roles: matrixRoles(input.roles, list),
    totals,
    cells: list,
  };
}

/** Registered roles first, in registration order, then roles known only from stored runs. */
function matrixRoles(registered: readonly RoleDescriptor[], cells: readonly MatrixCell[]): MatrixRole[] {
  const roles: MatrixRole[] = registered.map((role) => ({
    id: role.id,
    name: role.name,
    version: role.version,
    ecosystem: role.ecosystem,
    kind: role.kind,
    registered: true,
  }));
  const known = new Set(roles.map((role) => role.id));
  for (const cell of cells) {
    const versions = cell.latestRun?.versions;
    if (!versions) continue;
    for (const kind of ['issuer', 'wallet', 'verifier'] as const) {
      const id = cell.key[kind];
      if (known.has(id)) continue;
      known.add(id);
      roles.push({ id, name: id, version: versions[kind], ecosystem: 'external', kind, registered: false });
    }
  }
  return roles;
}

function cellOrder(roles: readonly RoleDescriptor[]): (a: MatrixCell, b: MatrixCell) => number {
  const roleIndex = new Map(roles.map((role, index) => [role.id, index]));
  const rank = (id: string): number => roleIndex.get(id) ?? Number.MAX_SAFE_INTEGER;
  const scenarioRank = (id: string): string => (id === 'happy' ? '' : id);
  return (a, b) =>
    rank(a.key.issuer) - rank(b.key.issuer) ||
    a.key.issuer.localeCompare(b.key.issuer) ||
    rank(a.key.wallet) - rank(b.key.wallet) ||
    a.key.wallet.localeCompare(b.key.wallet) ||
    rank(a.key.verifier) - rank(b.key.verifier) ||
    a.key.verifier.localeCompare(b.key.verifier) ||
    CREDENTIAL_FORMATS.indexOf(a.key.format) - CREDENTIAL_FORMATS.indexOf(b.key.format) ||
    VP_PROFILES.indexOf(a.key.vpProfile) - VP_PROFILES.indexOf(b.key.vpProfile) ||
    scenarioRank(a.key.scenario).localeCompare(scenarioRank(b.key.scenario));
}
