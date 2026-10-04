/**
 * The compatibility check: decides from the three role descriptors alone whether a combination can run,
 * and says why not in words a reader of the matrix understands. Runs that fail it are stored with the
 * verdict `not-supported` instead of being attempted.
 */
import type {
  CompatibilityReason,
  CompatibilityResult,
  CredentialFormat,
  RoleDescriptor,
  RunMode,
  ScenarioSpec,
  VciProfile,
  VpProfile,
} from '@inji-playground/protocol';

export interface CompatibilityInput {
  issuer: RoleDescriptor;
  wallet: RoleDescriptor;
  verifier: RoleDescriptor;
  format: CredentialFormat;
  vciProfile: VciProfile;
  vpProfile: VpProfile;
  scenario: ScenarioSpec;
}

/** `live` when any Inji module takes part: such runs share the one local Inji stack. */
export function runModeOf(roles: readonly RoleDescriptor[]): RunMode {
  return roles.some((role) => role.ecosystem === 'inji') ? 'live' : 'reference';
}

/** Elements of `a` also in `b`. */
function intersect<T>(a: readonly T[], b: readonly T[]): T[] {
  return a.filter((value) => b.includes(value));
}

export function checkCompatibility(input: CompatibilityInput): CompatibilityResult {
  const { issuer, wallet, verifier, format, vciProfile, vpProfile, scenario } = input;
  const reasons: CompatibilityReason[] = [];
  const block = (code: string, message: string, roles: RoleDescriptor[]): void => {
    reasons.push({ code, severity: 'blocking', message, roles: roles.map((role) => role.id) });
  };
  const warn = (code: string, message: string, roles: RoleDescriptor[]): void => {
    reasons.push({ code, severity: 'warning', message, roles: roles.map((role) => role.id) });
  };

  for (const role of [issuer, wallet, verifier]) {
    if (!role.capabilities.formats.includes(format)) {
      block(
        `${role.kind}.format-unsupported`,
        `${role.name} does not support the format ${format} (it supports ${listOrNone(role.capabilities.formats)}).`,
        [role],
      );
    }
  }

  // A missing profile list means the role does not say, so only a declared list can rule a profile out.
  for (const role of [issuer, wallet]) {
    const profiles = role.capabilities.vciProfiles;
    if (profiles && !profiles.includes(vciProfile)) {
      block(
        `${role.kind}.vci-profile-unsupported`,
        `${role.name} does not speak OpenID4VCI ${vciProfile} (it speaks ${listOrNone(profiles)}).`,
        [role],
      );
    }
  }
  for (const role of [wallet, verifier]) {
    const profiles = role.capabilities.vpProfiles;
    if (profiles && !profiles.includes(vpProfile)) {
      block(
        `${role.kind}.vp-profile-unsupported`,
        `${role.name} does not speak OpenID4VP ${vpProfile} (it speaks ${listOrNone(profiles)}).`,
        [role],
      );
    }
  }

  const issuerModes = issuer.capabilities.issuance;
  const walletModes = wallet.capabilities.issuance;
  if (issuerModes && walletModes && intersect(issuerModes, walletModes).length === 0) {
    block(
      'issuance.mode-mismatch',
      `${issuer.name} starts issuance by ${listOrNone(issuerModes)}, but ${wallet.name} only supports ${listOrNone(walletModes)}.`,
      [issuer, wallet],
    );
  }

  const walletResponse = wallet.capabilities.responseModes;
  const verifierResponse = verifier.capabilities.responseModes;
  if (walletResponse && verifierResponse && intersect(walletResponse, verifierResponse).length === 0) {
    block(
      'presentation.response-mode-mismatch',
      `${verifier.name} accepts responses by ${listOrNone(verifierResponse)}, but ${wallet.name} sends ${listOrNone(walletResponse)}.`,
      [wallet, verifier],
    );
  }

  if (scenario.formats && !scenario.formats.includes(format)) {
    reasons.push({
      code: 'scenario.format-unsupported',
      severity: 'blocking',
      message: `The scenario "${scenario.title}" applies only to ${listOrNone(scenario.formats)}.`,
      roles: [],
    });
  }

  // DID methods and proof types are declared coarsely (one list for issuing and resolving, credential
  // and holder proofs together), so a mismatch is only a warning: the run is still attempted.
  const issuerDids = issuer.capabilities.didMethods;
  const verifierDids = verifier.capabilities.didMethods;
  if (issuerDids.length > 0 && verifierDids.length > 0 && intersect(issuerDids, verifierDids).length === 0) {
    warn(
      'did.method-mismatch',
      `${issuer.name} signs with ${listOrNone(issuerDids)}, which ${verifier.name} does not list among the DID methods it resolves (${listOrNone(verifierDids)}).`,
      [issuer, verifier],
    );
  }
  const issuerProofs = issuer.capabilities.proofTypes;
  const verifierProofs = verifier.capabilities.proofTypes;
  if (
    issuerProofs.length > 0 &&
    verifierProofs.length > 0 &&
    intersect(issuerProofs, verifierProofs).length === 0
  ) {
    warn(
      'proof.type-mismatch',
      `${issuer.name} signs with ${listOrNone(issuerProofs)}, which ${verifier.name} does not list among the proof types it verifies (${listOrNone(verifierProofs)}).`,
      [issuer, verifier],
    );
  }

  return {
    runnable: !reasons.some((reason) => reason.severity === 'blocking'),
    mode: runModeOf([issuer, wallet, verifier]),
    reasons,
  };
}

function listOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'nothing';
}
