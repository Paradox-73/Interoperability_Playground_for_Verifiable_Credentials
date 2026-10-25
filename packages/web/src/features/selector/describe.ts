// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Plain-language text for local incompatibilities, built from translation strings so every word the
 * person reads comes from `locales/en.json`.
 */
import type { CredentialFormat, IssuanceMode, VciProfile, VpProfile } from '@inji-playground/protocol';
import type { TFunction } from 'i18next';
import type { Incompatibility } from './compatibility';

export function describeIncompatibility(problem: Incompatibility, t: TFunction): string {
  const formats = (list: readonly CredentialFormat[]) => list.map((f) => t(`format.${f}`)).join(', ');
  const vci = (list: readonly VciProfile[] = []) => list.map((p) => t(`vciProfile.${p}`)).join(', ');
  const vp = (list: readonly VpProfile[] = []) => list.map((p) => t(`vpProfile.${p}`)).join(', ');
  const modes = (list: readonly IssuanceMode[] = []) =>
    list.map((m) => t(`issuanceMode.${m}`)).join(t('compat.or'));

  switch (problem.code) {
    case 'issuance-format':
      return t('compat.noIssuableFormat', {
        issuer: problem.issuer.name,
        wallet: problem.wallet.name,
        formats: formats(problem.issuer.capabilities.formats),
      });
    case 'presentation-format':
      return t('compat.noPresentableFormat', {
        wallet: problem.wallet.name,
        verifier: problem.verifier.name,
        formats: formats(problem.wallet.capabilities.formats),
      });
    case 'common-format':
      return t('compat.noCommonFormat', {
        issuer: problem.issuer.name,
        wallet: problem.wallet.name,
        verifier: problem.verifier.name,
      });
    case 'vci-profile':
      return t('compat.vciProfile', {
        issuer: problem.issuer.name,
        wallet: problem.wallet.name,
        issuerProfiles: vci(problem.issuer.capabilities.vciProfiles),
        walletProfiles: vci(problem.wallet.capabilities.vciProfiles),
      });
    case 'vp-profile':
      return t('compat.vpProfile', {
        wallet: problem.wallet.name,
        verifier: problem.verifier.name,
        walletProfiles: vp(problem.wallet.capabilities.vpProfiles),
        verifierProfiles: vp(problem.verifier.capabilities.vpProfiles),
      });
    case 'issuance-mode':
      return t('compat.issuance', {
        issuer: problem.issuer.name,
        wallet: problem.wallet.name,
        issuerModes: modes(problem.issuer.capabilities.issuance),
        walletModes: modes(problem.wallet.capabilities.issuance),
      });
  }
}
