// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * TanStack Query hooks for every server endpoint the UI foundation reads or writes. Query keys live in
 * one place so later pages can invalidate them (for example `queryKeys.roles` after a stack restart).
 */
import {
  CreateRunResponseSchema,
  RoleStatusSchema,
  ServerHealthSchema,
  StackStatusSchema,
  type CreateRunResponse,
  type RoleStatus,
  type RunConfigInput,
  type ServerHealth,
  type StackStatus,
} from '@inji-playground/protocol';
import { QueryClient, skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { compatibilityPath, parseCompatibility, type CompatibilityQuery } from './compatibility';
import { getJson, postJson } from './http';

/** Role health changes when containers start or stop; this is how often the cards re-check it. */
export const ROLE_REFRESH_MS = 15_000;
export const STACK_REFRESH_MS = 10_000;

export const queryKeys = {
  health: ['health'] as const,
  roles: ['roles'] as const,
  stackStatus: ['stack-status'] as const,
  compatibility: (query: CompatibilityQuery) => ['compatibility', query] as const,
};

const parseRoles = (json: unknown): RoleStatus[] => RoleStatusSchema.array().parse(json);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });
}

export function useServerHealth() {
  return useQuery<ServerHealth>({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getJson('/api/health', (json) => ServerHealthSchema.parse(json), signal),
    refetchInterval: STACK_REFRESH_MS,
  });
}

export function useRoles() {
  return useQuery<RoleStatus[]>({
    queryKey: queryKeys.roles,
    queryFn: ({ signal }) => getJson('/api/roles', parseRoles, signal),
    refetchInterval: ROLE_REFRESH_MS,
  });
}

export function useStackStatus() {
  return useQuery<StackStatus>({
    queryKey: queryKeys.stackStatus,
    queryFn: ({ signal }) => getJson('/api/stack/status', (json) => StackStatusSchema.parse(json), signal),
    refetchInterval: STACK_REFRESH_MS,
  });
}

/**
 * Asks the server whether one combination can run. `null` disables the query (selection incomplete or
 * already rejected by the local capability check). Errors are not retried: an older server without
 * the endpoint simply contributes no reasons.
 */
export function useCompatibility(query: CompatibilityQuery | null) {
  return useQuery({
    queryKey: query ? queryKeys.compatibility(query) : ['compatibility', 'disabled'],
    queryFn: query
      ? ({ signal }) => getJson(compatibilityPath(query), parseCompatibility, signal)
      : skipToken,
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateRun() {
  return useMutation<CreateRunResponse, Error, RunConfigInput>({
    mutationFn: (config) => postJson('/api/runs', config, (json) => CreateRunResponseSchema.parse(json)),
  });
}
