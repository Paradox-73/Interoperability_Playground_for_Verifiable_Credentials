/**
 * Turns the flat cell list of `GET /api/matrix` into the grid the page draws: one row per
 * issuer -> wallet -> verifier combination, one column per credential format and OpenID4VP profile.
 * Pure functions only, so the arrangement is unit-tested without rendering.
 */
import {
  CREDENTIAL_FORMATS,
  VpProfileSchema,
  type CredentialFormat,
  type Matrix,
  type MatrixCell,
  type MatrixRole,
  type RunConfigInput,
  type VpProfile,
} from '@inji-playground/protocol';

export interface MatrixColumn {
  /** `format/vpProfile`. */
  id: string;
  format: CredentialFormat;
  vpProfile: VpProfile;
}

export interface MatrixRow {
  /** `issuer/wallet/verifier`. */
  id: string;
  issuer: string;
  wallet: string;
  verifier: string;
  /** Cells by column id; a column the row has no cell for is missing. */
  cells: Record<string, MatrixCell>;
}

export interface MatrixLayout {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  roles: Map<string, MatrixRole>;
}

const VP_PROFILES = VpProfileSchema.options;

export const columnId = (format: CredentialFormat, vpProfile: VpProfile) => `${format}/${vpProfile}`;

/** Position of a value in a list, unknown values last. */
function rank(list: readonly string[], value: string): number {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
}

/**
 * Arranges the cells of one scenario. Columns follow the protocol's format order, then the profile
 * order (Inji's stable profile first); rows follow the order the server lists the roles in, which puts
 * the Inji modules first, as on the playground page.
 */
export function layoutMatrix(matrix: Matrix, scenario: string): MatrixLayout {
  const roles = new Map(matrix.roles.map((role) => [role.id, role] as const));
  const roleOrder = matrix.roles.map((role) => role.id);
  const columns = new Map<string, MatrixColumn>();
  const rows = new Map<string, MatrixRow>();

  for (const cell of matrix.cells) {
    const { key } = cell;
    if (key.scenario !== scenario) continue;
    const column = columnId(key.format, key.vpProfile);
    if (!columns.has(column)) columns.set(column, { id: column, format: key.format, vpProfile: key.vpProfile });
    const rowId = `${key.issuer}/${key.wallet}/${key.verifier}`;
    let row = rows.get(rowId);
    if (!row) {
      row = { id: rowId, issuer: key.issuer, wallet: key.wallet, verifier: key.verifier, cells: {} };
      rows.set(rowId, row);
    }
    row.cells[column] = cell;
  }

  const sortedColumns = [...columns.values()].sort(
    (a, b) =>
      rank(CREDENTIAL_FORMATS, a.format) - rank(CREDENTIAL_FORMATS, b.format) ||
      rank(VP_PROFILES, a.vpProfile) - rank(VP_PROFILES, b.vpProfile),
  );
  const sortedRows = [...rows.values()].sort(
    (a, b) =>
      rank(roleOrder, a.issuer) - rank(roleOrder, b.issuer) ||
      rank(roleOrder, a.wallet) - rank(roleOrder, b.wallet) ||
      rank(roleOrder, a.verifier) - rank(roleOrder, b.verifier) ||
      a.id.localeCompare(b.id),
  );
  return { columns: sortedColumns, rows: sortedRows, roles };
}

/** Whether "run this cell" makes sense: the compatibility check did not rule the cell out. */
export function isRunnable(cell: MatrixCell): boolean {
  return cell.status !== 'not-supported';
}

/** Red cells: the run gave a wrong answer or broke; they link to the gap register. */
export function isRed(cell: MatrixCell): boolean {
  return cell.status === 'fail' || cell.status === 'error';
}

/**
 * `POST /api/runs` body that runs a cell again. The issuance profile is not part of the cell key; the
 * one of the latest run is reused, else the server's default (Inji's stable draft 13) applies.
 */
export function runConfigOfCell(cell: MatrixCell): RunConfigInput {
  const { key, latestRun } = cell;
  return {
    issuer: key.issuer,
    wallet: key.wallet,
    verifier: key.verifier,
    format: key.format,
    vpProfile: key.vpProfile,
    scenario: key.scenario,
    ...(latestRun ? { vciProfile: latestRun.vciProfile } : {}),
  };
}
