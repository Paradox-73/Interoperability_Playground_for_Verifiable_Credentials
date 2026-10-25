// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The run bar's scenario state: the catalogue from the server, the person's choice, and the scenario a
 * run with the current format will actually use.
 */
import type { CredentialFormat, ScenarioSpec } from '@inji-playground/protocol';
import { useMemo } from 'react';
import { useScenarios } from './api';
import { HAPPY_FALLBACK, effectiveScenario, groupScenarios, type ScenarioGroup } from './scenarios';
import { useTamperStore } from './store';

export interface ScenarioChoice {
  /** The scenario a run would use now. */
  scenario: ScenarioSpec;
  groups: ScenarioGroup[];
  choose: (id: string) => void;
  loading: boolean;
  /** Set when the catalogue could not be loaded; only the happy path is offered then. */
  error?: Error;
}

export function useScenarioChoice(format: CredentialFormat | undefined): ScenarioChoice {
  const { data, error, isPending } = useScenarios();
  const chosenId = useTamperStore((state) => state.scenarioId);
  const choose = useTamperStore((state) => state.chooseScenario);
  return useMemo(() => {
    const catalogue = data && data.length > 0 ? data : [HAPPY_FALLBACK];
    return {
      scenario: effectiveScenario(catalogue, chosenId, format),
      groups: groupScenarios(catalogue, format),
      choose,
      loading: isPending,
      ...(error ? { error } : {}),
    };
  }, [data, error, isPending, chosenId, choose, format]);
}
