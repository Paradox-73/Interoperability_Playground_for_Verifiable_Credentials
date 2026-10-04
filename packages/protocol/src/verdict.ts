import type { Outcome, Verdict } from './enums.js';

/**
 * Verdict of a run that reached the verifier: `pass` when the verifier's outcome equals the outcome the
 * scenario expects, otherwise `fail`. A tamper scenario therefore passes when the verifier rejects the
 * corrupted credential, and fails when it accepts it.
 *
 * Runs that stopped before the verifier answered (`NOT_RUN`) get `error`, because nothing about the
 * verifier was learned. `not-supported` is never computed here: the orchestrator assigns it when the
 * compatibility check rejects a combination before the run starts.
 */
export function verdictFor(expected: Outcome, outcome: Outcome): Verdict {
  if (outcome === 'NOT_RUN') return 'error';
  return outcome === expected ? 'pass' : 'fail';
}
