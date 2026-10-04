/**
 * Size of an issued credential and of its PixelPass QR text, recorded in every report that received
 * a credential, so the matrix and the metrics can show which issuers produce credentials that no
 * longer fit a QR code (one of the interoperability gaps the problem statement names).
 */
// The size module alone: the package root also loads the JSON-LD and SD-JWT libraries (seconds at start-up).
import { credentialSize } from '@inji-playground/formats/size';
import type { CredentialSize } from '@inji-playground/protocol';

/**
 * Measures `raw` (the credential exactly as the issuer returned it). Returns undefined instead of
 * throwing when PixelPass cannot encode it, because a size figure must never fail a run.
 */
export function measureCredential(raw: string): CredentialSize | undefined {
  try {
    return credentialSize(raw);
  } catch {
    return undefined;
  }
}
