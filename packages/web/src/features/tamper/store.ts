/**
 * The scenario chosen in the run bar. Kept apart from the playground store because the matrix and
 * the report page read it too, and it is the only tamper state the UI holds.
 */
import { create } from 'zustand';
import { HAPPY_ID } from './scenarios';

interface TamperState {
  scenarioId: string;
  chooseScenario: (id: string) => void;
}

export const useTamperStore = create<TamperState>()((set) => ({
  scenarioId: HAPPY_ID,
  chooseScenario: (scenarioId) => set({ scenarioId }),
}));

export function resetTamperStore(): void {
  useTamperStore.setState({ scenarioId: HAPPY_ID });
}
