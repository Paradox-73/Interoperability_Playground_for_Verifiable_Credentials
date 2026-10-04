/**
 * Adapters for the Inji modules (Certify, Verify, Mimoto and Inji Web).
 *
 * Empty until the Inji adapter work packages fill it: the server already calls both functions, so
 * adding an adapter means adding it here and nowhere else.
 */
import type { AnyRole, StackMode, StackStatus } from '@inji-playground/protocol';

/** Role implementations backed by Inji containers. */
export function injiRoles(): AnyRole[] {
  return [];
}

/** Health and image tags of the local Inji stack containers. */
export function stackStatus(mode: StackMode): Promise<StackStatus> {
  return Promise.resolve({ mode, checkedAt: new Date().toISOString(), services: [] });
}
