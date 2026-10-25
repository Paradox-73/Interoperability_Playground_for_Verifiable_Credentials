// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Scenario hooks for the orchestrator (`ScenarioHooks` of `@inji-playground/protocol`) and the check
 * whether a scenario applies to a combination of roles, format and profile.
 *
 * `tamperPresentation` is never set here: every presentation tamper needs the request's nonce and the
 * holder key, which only the wallet has, so the reference wallet applies it through
 * `respondWithScenario` instead. Issuer variants (validity window, type, DID method) are read by the
 * reference issuer role from the scenario definition (`issuanceOptionsFor`, `issuerDidMethodFor`).
 */
import type {
  CredentialFormat,
  RoleKind,
  ScenarioHooks,
  ScenarioSpec,
  VpProfile,
} from '@inji-playground/protocol';
import { REFERENCE_FORMATS, type ScenarioDefinition } from './catalogue.js';
import { configurationIdFor } from './issuer.js';
import { tamperCredential } from './tamper.js';

/** Credential types the reference verifier asks for by default, per format. */
export const FARMER_TYPE = 'FarmerCredential';
export const FARMER_VCT = 'https://playground.ps02.test/vct/farmer/v1';
export const FARMER_DOCTYPE = 'test.ps02.playground.farmer.1';

/**
 * The type (ldp_vc), `vct` (SD-JWT VC) or docType (mso_mdoc) a verifier asks for to get the playground's
 * farmer credential.
 */
export function requestedCredentialType(format: CredentialFormat): string {
  if (format === 'mso_mdoc') return FARMER_DOCTYPE;
  return format === 'ldp_vc' ? FARMER_TYPE : FARMER_VCT;
}

/** The orchestrator's hooks for one scenario. The happy path and the probes get none or only `beforeIssuance`. */
export function scenarioHooks(scenario: ScenarioDefinition): ScenarioHooks {
  const hooks: ScenarioHooks = {};
  if (scenario.issuer?.configurationIds) {
    hooks.beforeIssuance = (request) => {
      const configurationId = configurationIdFor(scenario, request.format);
      return configurationId === undefined
        ? request
        : { ...request, credentialConfigurationId: configurationId };
    };
  }
  const tamper = scenario.credentialTamper;
  if (tamper) {
    hooks.afterCredential = async (credential) => ({
      ...credential,
      raw: await tamperCredential(tamper, credential),
    });
  }
  if (scenario.wallet?.presentUnmatched) {
    // The verifier asks for the farmer credential explicitly, so the type the issuer used is wrong.
    hooks.beforeRequest = (spec) =>
      spec.credentialType === undefined
        ? { ...spec, credentialType: requestedCredentialType(spec.format) }
        : spec;
  }
  return hooks;
}

/** One combination a scenario could be run on; missing members are not checked. */
export interface ScenarioCell {
  issuer?: string;
  wallet?: string;
  verifier?: string;
  format?: CredentialFormat;
  vpProfile?: VpProfile;
}

export interface Applicability {
  applies: boolean;
  /** Plain-language reasons when it does not apply. */
  reasons: string[];
}

/** Whether `scenario` can run on `cell`, from its formats, profiles and role requirements. */
export function scenarioApplies(scenario: ScenarioSpec, cell: ScenarioCell): Applicability {
  const reasons: string[] = [];
  if (cell.format && scenario.formats && !scenario.formats.includes(cell.format)) {
    reasons.push(`${scenario.id} applies to ${scenario.formats.join(', ')}, not ${cell.format}`);
  }
  if (cell.vpProfile && scenario.vpProfiles && !scenario.vpProfiles.includes(cell.vpProfile)) {
    reasons.push(`${scenario.id} applies to the ${scenario.vpProfiles.join(', ')} profile only`);
  }
  for (const kind of ['issuer', 'wallet', 'verifier'] as const satisfies readonly RoleKind[]) {
    const required = scenario.requires?.[kind];
    const chosen = cell[kind];
    if (required && chosen !== undefined && !required.includes(chosen)) {
      reasons.push(`${scenario.id} needs the ${kind} ${required.join(' or ')}, not ${chosen}`);
    }
  }
  return { applies: reasons.length === 0, reasons };
}

/** The roles the playground implements itself. */
export const REFERENCE_ROLES = {
  issuer: 'ref-issuer',
  wallet: 'ref-wallet',
  verifier: 'ref-verifier',
} as const;

export interface ReferenceCell {
  scenario: ScenarioDefinition;
  format: CredentialFormat;
  vpProfile: VpProfile;
}

/** Every (scenario, format, profile) the reference roles can run, in catalogue order. */
export function referenceCells(catalogue: readonly ScenarioDefinition[]): ReferenceCell[] {
  const cells: ReferenceCell[] = [];
  for (const scenario of catalogue) {
    for (const format of REFERENCE_FORMATS) {
      for (const vpProfile of ['inji-draft', 'final-1.0'] as const) {
        if (scenarioApplies(scenario, { ...REFERENCE_ROLES, format, vpProfile }).applies) {
          cells.push({ scenario, format, vpProfile });
        }
      }
    }
  }
  return cells;
}
