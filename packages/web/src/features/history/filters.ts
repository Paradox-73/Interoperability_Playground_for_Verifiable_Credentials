/**
 * History filters as they live in the page address (`/runs?format=ldp_vc&outcome=INVALID&page=2`) and
 * as the server wants them (`GET /api/runs`, `GET /api/metrics`). Keeping them in the address makes a
 * filtered view a link a judge or a teammate can open.
 *
 * Pure functions only; values that are not in the protocol's vocabularies are dropped, so a hand-edited
 * address can never produce a request the server rejects.
 */
import {
  CredentialFormatSchema,
  OutcomeSchema,
  RoleIdSchema,
  RunModeSchema,
  ScenarioIdSchema,
  VerdictSchema,
  type CredentialFormat,
  type Outcome,
  type RunMode,
  type Verdict,
} from '@inji-playground/protocol';
import type { ZodType } from 'zod';

export const PAGE_SIZE = 20;

export interface HistoryFilter {
  issuer?: string;
  wallet?: string;
  verifier?: string;
  /** Matches a run where any of the three roles had this version. */
  version?: string;
  format?: CredentialFormat;
  scenario?: string;
  outcome?: Outcome;
  verdict?: Verdict;
  mode?: RunMode;
  /** First day included, `YYYY-MM-DD` (UTC). */
  fromDate?: string;
  /** Last day included, `YYYY-MM-DD` (UTC). */
  toDate?: string;
}

export type HistoryFilterKey = keyof HistoryFilter;

/** Filter keys whose values come from a protocol vocabulary, with that vocabulary's schema. */
const VOCABULARY: Partial<Record<HistoryFilterKey, ZodType>> = {
  issuer: RoleIdSchema,
  wallet: RoleIdSchema,
  verifier: RoleIdSchema,
  format: CredentialFormatSchema,
  scenario: ScenarioIdSchema,
  outcome: OutcomeSchema,
  verdict: VerdictSchema,
  mode: RunModeSchema,
};

/** Every filter, in the order the filter bar shows them. */
export const FILTER_KEYS: readonly HistoryFilterKey[] = [
  'issuer',
  'wallet',
  'verifier',
  'version',
  'format',
  'scenario',
  'outcome',
  'verdict',
  'mode',
  'fromDate',
  'toDate',
];

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValid(key: HistoryFilterKey, value: string): boolean {
  if (key === 'version') return value.trim().length > 0 && value.length <= 100;
  if (key === 'fromDate' || key === 'toDate') {
    return DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  }
  return VOCABULARY[key]?.safeParse(value).success ?? false;
}

/** Reads the filter and the 1-based page number from the page address. */
export function filterFromParams(params: URLSearchParams): { filter: HistoryFilter; page: number } {
  const filter: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null && isValid(key, value)) filter[key] = value.trim();
  }
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return { filter: filter, page: Number.isFinite(page) && page >= 1 ? page : 1 };
}

/** The page address for a filter and page; page 1 and empty values are left out. */
export function filterToParams(filter: HistoryFilter, page = 1): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filter[key];
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  return params;
}

/** `YYYY-MM-DD` to the ISO time the day starts at (UTC). */
export function dayStart(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** `YYYY-MM-DD` to the ISO time the next day starts at, so the `to` bound includes the whole day. */
export function dayAfter(day: string): string {
  const next = new Date(Date.parse(dayStart(day)) + 24 * 60 * 60 * 1000);
  return next.toISOString();
}

/** The server query shared by the run list and the metrics. */
function serverParams(filter: HistoryFilter, keys: readonly HistoryFilterKey[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = filter[key];
    if (!value) continue;
    if (key === 'fromDate') params.set('from', dayStart(value));
    else if (key === 'toDate') params.set('to', dayAfter(value));
    else params.set(key, value);
  }
  return params;
}

/** `GET /api/runs` for one page of the history, newest first. */
export function runListPath(filter: HistoryFilter, page: number): string {
  const params = serverParams(filter, FILTER_KEYS);
  params.set('order', 'newest');
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String((page - 1) * PAGE_SIZE));
  return `/api/runs?${params.toString()}`;
}

/**
 * `GET /api/metrics` for the same runs. Outcome and verdict are left out on purpose: a success rate
 * computed only over failed runs would always read 0 %.
 */
export function metricsPath(filter: HistoryFilter): string {
  const keys = FILTER_KEYS.filter((key) => key !== 'outcome' && key !== 'verdict');
  const query = serverParams(filter, keys).toString();
  return query ? `/api/metrics?${query}` : '/api/metrics';
}

/** Whether any filter is set. */
export function hasFilter(filter: HistoryFilter): boolean {
  return FILTER_KEYS.some((key) => Boolean(filter[key]));
}
