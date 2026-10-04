/**
 * The scenario catalogue (`GET /api/scenarios`) and the replay request (`POST /api/runs` with
 * `replayOf`), which the run bar, the report page and the matrix share.
 */
import {
  CreateRunResponseSchema,
  ScenarioSpecSchema,
  type CreateRunRequest,
  type CreateRunResponse,
  type ScenarioSpec,
} from '@inji-playground/protocol';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getJson, postJson } from '../../api/http';

export const scenariosKey = ['scenarios'] as const;

const parseScenarios = (json: unknown): ScenarioSpec[] => ScenarioSpecSchema.array().parse(json);

/** The catalogue changes only with a server release, so it is fetched once per page load. */
export function useScenarios() {
  return useQuery<ScenarioSpec[]>({
    queryKey: scenariosKey,
    queryFn: ({ signal }) => getJson('/api/scenarios', parseScenarios, signal),
    staleTime: Infinity,
  });
}

/**
 * Starts a run from any `CreateRunRequest`: a full configuration (run a matrix cell) or `replayOf`
 * plus the fields to override (replay with tamper).
 */
export function useStartRun() {
  return useMutation<CreateRunResponse, Error, CreateRunRequest>({
    mutationFn: (body) => postJson('/api/runs', body, (json) => CreateRunResponseSchema.parse(json)),
  });
}
