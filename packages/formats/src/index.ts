/**
 * @inji-playground/formats: keys, DIDs and credential formats for the reference roles.
 *
 * Skeleton: the signing, presentation and verification code for W3C VC Data Integrity and SD-JWT VC
 * is added by the formats work package. Only format classification lives here so far.
 */
import type { CredentialFormat } from '@inji-playground/protocol';

/** True for both names of the SD-JWT VC format (`vc+sd-jwt` is the old one, `dc+sd-jwt` the new one). */
export function isSdJwtFormat(format: CredentialFormat): format is 'vc+sd-jwt' | 'dc+sd-jwt' {
  return format === 'vc+sd-jwt' || format === 'dc+sd-jwt';
}
