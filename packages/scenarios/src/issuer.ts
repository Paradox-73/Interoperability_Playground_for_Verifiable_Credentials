/**
 * What a scenario asks of the reference issuer, in the shapes `@inji-playground/oid4vci` takes
 * (`IssuanceOptions` for one offer, the DID method and credential configuration for the issuer).
 * Times are turned from offsets into dates at the moment of issuance, so a catalogue entry stays
 * valid however long the server runs.
 */
import type { CredentialFormat } from '@inji-playground/protocol';
import type { IssuerVariant, ScenarioDefinition } from './catalogue.js';

/** Per-offer issuance changes; structurally the `IssuanceOptions` of `@inji-playground/oid4vci`. */
export interface ScenarioIssuanceOptions {
  validFrom?: Date;
  validUntil?: Date;
  types?: string[];
  vct?: string;
  useX5c?: boolean;
}

/** Issuance options for one offer, or `undefined` when the scenario changes nothing at issuance. */
export function issuanceOptionsFor(
  scenario: Pick<ScenarioDefinition, 'issuer'>,
  now: Date = new Date(),
): ScenarioIssuanceOptions | undefined {
  const variant: IssuerVariant | undefined = scenario.issuer;
  if (!variant) return undefined;
  const at = (offsetSeconds: number) => new Date(now.getTime() + offsetSeconds * 1000);
  const options: ScenarioIssuanceOptions = {
    ...(variant.validFromOffsetSeconds === undefined ? {} : { validFrom: at(variant.validFromOffsetSeconds) }),
    ...(variant.validUntilOffsetSeconds === undefined
      ? {}
      : { validUntil: at(variant.validUntilOffsetSeconds) }),
    ...(variant.types ? { types: [...variant.types] } : {}),
    ...(variant.vct === undefined ? {} : { vct: variant.vct }),
    ...(variant.useX5c === undefined ? {} : { useX5c: variant.useX5c }),
  };
  return Object.keys(options).length > 0 ? options : undefined;
}

/** The credential configuration the scenario wants for `format`, if it names one. */
export function configurationIdFor(
  scenario: Pick<ScenarioDefinition, 'issuer'>,
  format: CredentialFormat,
): string | undefined {
  return scenario.issuer?.configurationIds?.[format];
}

/** The issuer DID method the scenario needs, if it names one. */
export function issuerDidMethodFor(
  scenario: Pick<ScenarioDefinition, 'issuer'>,
): IssuerVariant['didMethod'] | undefined {
  return scenario.issuer?.didMethod;
}
