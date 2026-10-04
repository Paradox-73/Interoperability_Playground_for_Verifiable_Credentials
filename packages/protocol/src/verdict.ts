import type { Outcome, Verdict } from './enums.js';

/**
 * Verdict of a run that reached the verifier: `pass` when the verifier's outcome equals the outcome the
 * scenario expects, otherwise `fail`. A tamper scenario therefore passes when the verifier rejects the
 * corrupted credential, and fails when it accepts it.
 *
 * Runs that stopped for a reason unrelated to interoperability (`NOT_RUN`: timeout, cancel, a service
 * that could not be reached) get `error`, because nothing about the roles was learned. A role that
 * rejected a protocol message gives the outcome `ERROR`, which is judged like any other outcome. `not-supported` is never computed here: the orchestrator assigns it when the
 * compatibility check rejects a combination before the run starts.
 */
export function verdictFor(expected: Outcome, outcome: Outcome): Verdict {
  if (outcome === 'NOT_RUN') return 'error';
  return outcome === expected ? 'pass' : 'fail';
}
