// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Translation key of the "what is this step" text of each protocol step. Step ids contain dots, which
 * i18next reads as nesting, so each step gets a dot-free key under `inspector.stepHelp`.
 */
import type { StepId } from '@inji-playground/protocol';

const KEYS = {
  'issuer.offer': 'issuerOffer',
  'issuer.metadata': 'issuerMetadata',
  'as.metadata': 'asMetadata',
  token: 'token',
  nonce: 'nonce',
  credential: 'credential',
  'verifier.request': 'verifierRequest',
  'wallet.fetch-request': 'walletFetchRequest',
  'wallet.submit': 'walletSubmit',
  'verifier.result': 'verifierResult',
  'person.action': 'personAction',
  'playground.admin': 'playgroundAdmin',
} as const satisfies Record<StepId, string>;

export type StepHelpKey = (typeof KEYS)[StepId];

export function stepHelpKey(step: StepId): StepHelpKey {
  return KEYS[step];
}
