/**
 * Capability check between the three selected roles, done in the browser from the role descriptors
 * alone. It answers at once (no request) and explains the obvious mismatches: no shared format, a
 * different protocol version, or issuance started in a way the wallet does not support. The server's
 * `/api/compatibility` answer adds what descriptors cannot know, such as known gaps.
 */
import {
  CREDENTIAL_FORMATS,
  IssuanceModeSchema,
  VciProfileSchema,
  VpProfileSchema,
  type CredentialFormat,
  type IssuanceMode,
  type RoleDescriptor,
  type RoleKind,
  type VciProfile,
  type VpProfile,
} from '@inji-playground/protocol';

/** The roles of one combination; a column with no selection yet is left out. */
export interface RoleTriple {
  issuer?: RoleDescriptor;
  wallet?: RoleDescriptor;
  verifier?: RoleDescriptor;
}

export type Incompatibility =
  | { code: 'issuance-format'; issuer: RoleDescriptor; wallet: RoleDescriptor }
  | { code: 'presentation-format'; wallet: RoleDescriptor; verifier: RoleDescriptor }
  | { code: 'common-format'; issuer: RoleDescriptor; wallet: RoleDescriptor; verifier: RoleDescriptor }
  | { code: 'vci-profile'; issuer: RoleDescriptor; wallet: RoleDescriptor }
  | { code: 'vp-profile'; wallet: RoleDescriptor; verifier: RoleDescriptor }
  | { code: 'issuance-mode'; issuer: RoleDescriptor; wallet: RoleDescriptor };

/** Choices of the run bar that every selected role supports. */
export interface RunOptions {
  formats: CredentialFormat[];
  vciProfiles: VciProfile[];
  vpProfiles: VpProfile[];
}

export interface RunChoice {
  format: CredentialFormat;
  vciProfile: VciProfile;
  vpProfile: VpProfile;
}

/**
 * Values supported by every role that declares the capability, in the order of `all`. A role that does
 * not declare an optional capability (undefined) is taken to accept every value.
 */
function shared<T extends string>(all: readonly T[], ...lists: Array<readonly T[] | undefined>): T[] {
  return all.filter((value) => lists.every((list) => list === undefined || list.includes(value)));
}

const VCI_PROFILES = VciProfileSchema.options;
const VP_PROFILES = VpProfileSchema.options;
const ISSUANCE_MODES = IssuanceModeSchema.options;

export function runOptions({ issuer, wallet, verifier }: RoleTriple): RunOptions {
  return {
    formats: shared(
      CREDENTIAL_FORMATS,
      issuer?.capabilities.formats,
      wallet?.capabilities.formats,
      verifier?.capabilities.formats,
    ),
    vciProfiles: shared(VCI_PROFILES, issuer?.capabilities.vciProfiles, wallet?.capabilities.vciProfiles),
    vpProfiles: shared(VP_PROFILES, wallet?.capabilities.vpProfiles, verifier?.capabilities.vpProfiles),
  };
}

/** Every reason the selected roles cannot run together; empty when the local check finds none. */
export function findIncompatibilities({ issuer, wallet, verifier }: RoleTriple): Incompatibility[] {
  const found: Incompatibility[] = [];

  if (issuer && wallet) {
    const caps = [issuer.capabilities, wallet.capabilities] as const;
    if (shared(CREDENTIAL_FORMATS, caps[0].formats, caps[1].formats).length === 0) {
      found.push({ code: 'issuance-format', issuer, wallet });
    }
    if (shared(VCI_PROFILES, caps[0].vciProfiles, caps[1].vciProfiles).length === 0) {
      found.push({ code: 'vci-profile', issuer, wallet });
    }
    if (shared<IssuanceMode>(ISSUANCE_MODES, caps[0].issuance, caps[1].issuance).length === 0) {
      found.push({ code: 'issuance-mode', issuer, wallet });
    }
  }

  if (wallet && verifier) {
    const caps = [wallet.capabilities, verifier.capabilities] as const;
    if (shared(CREDENTIAL_FORMATS, caps[0].formats, caps[1].formats).length === 0) {
      found.push({ code: 'presentation-format', wallet, verifier });
    }
    if (shared(VP_PROFILES, caps[0].vpProfiles, caps[1].vpProfiles).length === 0) {
      found.push({ code: 'vp-profile', wallet, verifier });
    }
  }

  // Each pair may share a format while the three together share none (A∩B and B∩C, but not A∩B∩C).
  const pairFormatProblem = found.some(
    (f) => f.code === 'issuance-format' || f.code === 'presentation-format',
  );
  if (
    issuer &&
    wallet &&
    verifier &&
    !pairFormatProblem &&
    runOptions({ issuer, wallet, verifier }).formats.length === 0
  ) {
    found.push({ code: 'common-format', issuer, wallet, verifier });
  }

  return found;
}

/** The columns an incompatibility is about, so a card shows only the reasons that concern it. */
export function involvedKinds(problem: Incompatibility): RoleKind[] {
  switch (problem.code) {
    case 'issuance-format':
    case 'vci-profile':
    case 'issuance-mode':
      return ['issuer', 'wallet'];
    case 'presentation-format':
    case 'vp-profile':
      return ['wallet', 'verifier'];
    case 'common-format':
      return ['issuer', 'wallet', 'verifier'];
  }
}

/**
 * The run settings to use for a combination: the preferred value when every role supports it, else the
 * first supported one (Inji's stable protocol versions come first). Undefined when any list is empty.
 */
export function resolveChoice(
  options: RunOptions,
  preferred: Partial<RunChoice> = {},
): RunChoice | undefined {
  const pick = <T>(values: readonly T[], wanted: T | undefined): T | undefined =>
    wanted !== undefined && values.includes(wanted) ? wanted : values[0];
  const format = pick(options.formats, preferred.format);
  const vciProfile = pick(options.vciProfiles, preferred.vciProfile);
  const vpProfile = pick(options.vpProfiles, preferred.vpProfile);
  if (!format || !vciProfile || !vpProfile) return undefined;
  return { format, vciProfile, vpProfile };
}
