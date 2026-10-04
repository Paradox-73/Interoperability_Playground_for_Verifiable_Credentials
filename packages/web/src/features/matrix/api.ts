/**
 * `GET /api/matrix` with the page's filters, which live in the page address
 * (`/matrix?credentialFormat=ldp_vc&scenario=bad-signature`) so a filtered matrix can be shared.
 */
import {
  CredentialFormatSchema,
  MatrixSchema,
  RoleIdSchema,
  RunModeSchema,
  ScenarioIdSchema,
  VpProfileSchema,
  type CredentialFormat,
  type Matrix,
  type RunMode,
  type VpProfile,
} from '@inji-playground/protocol';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { getJson } from '../../api/http';
import { HAPPY_ID } from '../tamper/scenarios';

export interface MatrixFilter {
  issuer?: string;
  wallet?: string;
  verifier?: string;
  credentialFormat?: CredentialFormat;
  vpProfile?: VpProfile;
  mode?: RunMode;
  /** Scenario whose cells are shown; the happy path by default. */
  scenario: string;
  hideNotSupported: boolean;
}

const VOCABULARY: Record<string, ZodType> = {
  issuer: RoleIdSchema,
  wallet: RoleIdSchema,
  verifier: RoleIdSchema,
  credentialFormat: CredentialFormatSchema,
  vpProfile: VpProfileSchema,
  mode: RunModeSchema,
  scenario: ScenarioIdSchema,
};

export const MATRIX_FILTER_KEYS = Object.keys(VOCABULARY) as Array<Exclude<keyof MatrixFilter, 'hideNotSupported'>>;

export function matrixFilterFromParams(params: URLSearchParams): MatrixFilter {
  const filter: Record<string, string> = {};
  for (const key of MATRIX_FILTER_KEYS) {
    const value = params.get(key);
    if (value && VOCABULARY[key]!.safeParse(value).success) filter[key] = value;
  }
  return {
    ...(filter as Omit<MatrixFilter, 'scenario' | 'hideNotSupported'>),
    scenario: filter.scenario ?? HAPPY_ID,
    hideNotSupported: params.get('hideNotSupported') === 'true',
  };
}

export function matrixFilterToParams(filter: MatrixFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of MATRIX_FILTER_KEYS) {
    const value = filter[key];
    if (value && !(key === 'scenario' && value === HAPPY_ID)) params.set(key, value);
  }
  if (filter.hideNotSupported) params.set('hideNotSupported', 'true');
  return params;
}

export function matrixPath(filter: MatrixFilter): string {
  const params = new URLSearchParams();
  for (const key of MATRIX_FILTER_KEYS) {
    const value = filter[key];
    if (value) params.set(key, value);
  }
  if (filter.hideNotSupported) params.set('hideNotSupported', 'true');
  return `/api/matrix?${params.toString()}`;
}

export const matrixKey = ['matrix'] as const;

export function useMatrix(filter: MatrixFilter) {
  const path = matrixPath(filter);
  return useQuery<Matrix>({
    queryKey: [...matrixKey, path],
    queryFn: ({ signal }) => getJson(path, (json) => MatrixSchema.parse(json), signal),
    placeholderData: keepPreviousData,
  });
}

/** Address of the Markdown matrix the server renders for the same filters (dated, with versions). */
export function matrixMarkdownPath(filter: MatrixFilter): string {
  return `${matrixPath(filter)}&format=md`;
}
