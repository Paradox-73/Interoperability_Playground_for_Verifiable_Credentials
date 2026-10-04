/**
 * Pure helpers around the scenario catalogue (`GET /api/scenarios`): which scenarios fit a credential
 * format, how they are grouped in the picker, and how a finished run compares with its scenario.
 */
import {
  ScenarioSpecSchema,
  type CredentialFormat,
  type InteropReport,
  type Outcome,
  type ScenarioSpec,
  type TamperTarget,
  type Verdict,
} from '@inji-playground/protocol';

export const HAPPY_ID = 'happy';

/**
 * The happy path as the UI knows it without the server. Used while the catalogue loads, and when it
 * cannot be loaded, so the Run button never depends on the catalogue endpoint.
 */
export const HAPPY_FALLBACK: ScenarioSpec = ScenarioSpecSchema.parse({
  id: HAPPY_ID,
  title: 'Happy path',
  description:
    'The issuer issues a valid credential, the wallet presents it unchanged, and the verifier must accept it.',
  expected: 'VALID',
  target: 'none',
});

/** A scenario without a format list applies to every format. */
export function appliesTo(scenario: ScenarioSpec, format: CredentialFormat | undefined): boolean {
  return !format || !scenario.formats || scenario.formats.includes(format);
}

/** Order of the groups in the picker: no tampering first, then what is corrupted. */
export const TARGET_ORDER: readonly TamperTarget[] = ['none', 'credential', 'presentation'];

export interface ScenarioGroup {
  target: TamperTarget;
  scenarios: ScenarioSpec[];
}

/** Scenarios that fit `format`, grouped by target in catalogue order; empty groups are left out. */
export function groupScenarios(
  catalogue: readonly ScenarioSpec[],
  format: CredentialFormat | undefined,
): ScenarioGroup[] {
  return TARGET_ORDER.map((target) => ({
    target,
    scenarios: catalogue.filter((s) => s.target === target && appliesTo(s, format)),
  })).filter((group) => group.scenarios.length > 0);
}

/**
 * The scenario a run will use: the chosen one when it exists and fits the format, else the happy path.
 * Changing the format can therefore never send a scenario the issuer or wallet cannot apply.
 */
export function effectiveScenario(
  catalogue: readonly ScenarioSpec[],
  chosenId: string,
  format: CredentialFormat | undefined,
): ScenarioSpec {
  const chosen = catalogue.find((s) => s.id === chosenId);
  if (chosen && appliesTo(chosen, format)) return chosen;
  return catalogue.find((s) => s.id === HAPPY_ID) ?? HAPPY_FALLBACK;
}

/**
 * How a finished run compares with its scenario. `kind` picks the sentence that explains the result:
 * - `as-expected`: the verifier answered what the scenario expects;
 * - `accepted-tampered`: a corrupted credential or presentation was accepted (the worst case);
 * - `rejected-valid`: a valid credential was refused, an interoperability gap;
 * - `different`: another mismatch (for example INVALID where EXPIRED was expected);
 * - `not-run`: the run stopped before the verifier answered, so nothing was learned.
 */
export type ComparisonKind = 'as-expected' | 'accepted-tampered' | 'rejected-valid' | 'different' | 'not-run';

export interface OutcomeComparison {
  expected: Outcome;
  actual: Outcome;
  verdict: Verdict;
  kind: ComparisonKind;
}

export function compareOutcome(report: InteropReport): OutcomeComparison {
  const expected = report.scenario.expected;
  const actual = report.outcome;
  const base = { expected, actual, verdict: report.verdict };
  if (actual === 'NOT_RUN' || report.verdict === 'error' || report.verdict === 'not-supported') {
    return { ...base, kind: 'not-run' };
  }
  if (actual === expected) return { ...base, kind: 'as-expected' };
  if (actual === 'VALID') return { ...base, kind: 'accepted-tampered' };
  if (expected === 'VALID') return { ...base, kind: 'rejected-valid' };
  return { ...base, kind: 'different' };
}
