// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Response of `GET /api/compatibility?issuer&wallet&verifier&format&vciProfile&vpProfile`: whether the
 * server can run that combination, and why not. The server knows things the role descriptors cannot
 * say, such as interoperability gaps found by earlier runs (`gapIds` link to the gap register).
 *
 * The shape follows the server's `CompatibilityResultSchema`. It is checked here by hand so the UI does
 * not depend on that schema before it is published in @inji-playground/protocol; optional fields get
 * defaults, so an older or newer server degrades to fewer details instead of an error.
 */
import type { CredentialFormat, RoleId, VciProfile, VpProfile } from '@inji-playground/protocol';

export type ReasonSeverity = 'blocking' | 'warning';

export interface CompatibilityReason {
  /** Stable code, for example `format.unsupported`. */
  code: string;
  /** `blocking`: the combination cannot run; `warning`: it runs, with a known limitation. */
  severity: ReasonSeverity;
  /** Plain-language reason, shown on the role card. */
  message: string;
  /** Role ids the reason is about; empty when it concerns the combination as a whole. */
  roles: RoleId[];
  /** Entries of the interoperability gap register that explain the reason. */
  gapIds: string[];
}

export interface Compatibility {
  runnable: boolean;
  reasons: CompatibilityReason[];
}

export interface CompatibilityQuery {
  issuer: RoleId;
  wallet: RoleId;
  verifier: RoleId;
  format: CredentialFormat;
  vciProfile: VciProfile;
  vpProfile: VpProfile;
  /** Scenario the run would apply; the server's default (the happy path) when missing. */
  scenario?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${where} must be a list of strings`);
  }
  return value;
}

function parseReason(value: unknown, index: number): CompatibilityReason {
  const where = `reasons[${index}]`;
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') {
    throw new Error(`${where} needs a string code and message`);
  }
  const severity = value.severity ?? 'blocking';
  if (severity !== 'blocking' && severity !== 'warning') {
    throw new Error(`${where}.severity must be "blocking" or "warning"`);
  }
  return {
    code: value.code,
    severity,
    message: value.message,
    roles: stringList(value.roles, `${where}.roles`),
    gapIds: stringList(value.gapIds, `${where}.gapIds`),
  };
}

/** Checks a response body against the shape above; throws with the first problem found. */
export function parseCompatibility(json: unknown): Compatibility {
  if (!isRecord(json) || typeof json.runnable !== 'boolean') {
    throw new Error('expected an object with a boolean "runnable"');
  }
  const reasons = json.reasons ?? [];
  if (!Array.isArray(reasons)) throw new Error('"reasons" must be an array');
  return { runnable: json.runnable, reasons: reasons.map(parseReason) };
}

/** The reasons that concern one role: those naming it, and those about the combination as a whole. */
export function reasonsFor(result: Compatibility | undefined, roleId: RoleId): CompatibilityReason[] {
  if (!result) return [];
  return result.reasons.filter((reason) => reason.roles.length === 0 || reason.roles.includes(roleId));
}

export function compatibilityPath(query: CompatibilityQuery): string {
  const params = new URLSearchParams({
    issuer: query.issuer,
    wallet: query.wallet,
    verifier: query.verifier,
    format: query.format,
    vciProfile: query.vciProfile,
    vpProfile: query.vpProfile,
  });
  if (query.scenario && query.scenario !== 'happy') params.set('scenario', query.scenario);
  return `/api/compatibility?${params.toString()}`;
}
