// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Matrix spec files (`specs/*.yaml`): the cells a matrix run starts, each with the verdict and outcome
 * it must give. Case ids follow Inji Verify's api-test style, `TC_PG_<AREA>_<NN>`, in a
 * `uniqueIdentifier` field, so a failing cell can be named in an issue.
 *
 * ```yaml
 * name: reference
 * mode: reference                 # reference | live (live specs are held to the 20-minute budget)
 * defaults: { issuer: ref-issuer, wallet: ref-wallet, verifier: ref-verifier }
 * cases:
 *   - uniqueIdentifier: TC_PG_HAPPY_01
 *     description: Reference trio, SD-JWT VC, OpenID4VP draft profile
 *     format: vc+sd-jwt
 *     vpProfile: inji-draft       # vciProfile defaults to the pair: draft13 here, v1 for final-1.0
 *     scenario: happy             # default happy
 *     expected: VALID             # default: the scenario's expected outcome
 *     verdict: pass               # default pass
 * ```
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  CredentialFormatSchema,
  OutcomeSchema,
  RoleIdSchema,
  ScenarioIdSchema,
  VciProfileSchema,
  VerdictSchema,
  VpProfileSchema,
  type CredentialFormat,
  type Outcome,
  type RunMode,
  type Verdict,
  type VciProfile,
  type VpProfile,
} from '@inji-playground/protocol';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export type SpecMode = Extract<RunMode, 'reference' | 'live'>;

export const CASE_ID = /^TC_PG_[A-Z0-9]+_\d{2,}$/;

const RolesSchema = z.object({
  issuer: RoleIdSchema.optional(),
  wallet: RoleIdSchema.optional(),
  verifier: RoleIdSchema.optional(),
});

const CaseSchema = RolesSchema.extend({
  uniqueIdentifier: z.string().regex(CASE_ID, 'must look like TC_PG_<AREA>_<NN>'),
  description: z.string().min(1).optional(),
  format: CredentialFormatSchema,
  vciProfile: VciProfileSchema.optional(),
  vpProfile: VpProfileSchema.default('inji-draft'),
  scenario: ScenarioIdSchema.default('happy'),
  expected: OutcomeSchema.optional(),
  verdict: VerdictSchema.default('pass'),
}).strict();

export const MatrixSpecSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    /** `live` specs use the Inji stack and are held to the 20-minute budget. */
    mode: z.enum(['reference', 'live']).default('reference'),
    /** Seconds one cell takes, used for the duration estimate until a run has measured it. */
    cellSeconds: z.number().positive().optional(),
    defaults: RolesSchema.default({}),
    cases: z.array(CaseSchema).min(1),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const seen = new Set<string>();
    spec.cases.forEach((entry, index) => {
      if (seen.has(entry.uniqueIdentifier)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cases', index, 'uniqueIdentifier'],
          message: `duplicate case id ${entry.uniqueIdentifier}`,
        });
      }
      seen.add(entry.uniqueIdentifier);
      for (const kind of ['issuer', 'wallet', 'verifier'] as const) {
        if (!entry[kind] && !spec.defaults[kind]) {
          ctx.addIssue({
            code: 'custom',
            path: ['cases', index, kind],
            message: `no ${kind}: set it on the case or in defaults`,
          });
        }
      }
    });
  });
export type MatrixSpec = z.infer<typeof MatrixSpecSchema>;

/** One cell to run, with every default applied. */
export interface MatrixCase {
  id: string;
  description?: string;
  issuer: string;
  wallet: string;
  verifier: string;
  format: CredentialFormat;
  vciProfile: VciProfile;
  vpProfile: VpProfile;
  scenario: string;
  /** Outcome the verifier must report; filled from the scenario catalogue when the spec leaves it out. */
  expected?: Outcome;
  verdict: Verdict;
}

export interface LoadedSpec {
  name: string;
  description?: string;
  mode: SpecMode;
  cellSeconds?: number;
  /** Where the spec was read from, for the report. */
  source: string;
  cases: MatrixCase[];
}

/** Parses spec text (YAML). Throws an error that names every problem with its path. */
export function parseSpec(text: string, source = 'spec'): LoadedSpec {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    throw new Error(`${source}: not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = MatrixSpecSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`${source}: invalid matrix spec\n${problems.join('\n')}`);
  }
  const spec = parsed.data;
  return {
    name: spec.name,
    ...(spec.description ? { description: spec.description } : {}),
    mode: spec.mode,
    ...(spec.cellSeconds ? { cellSeconds: spec.cellSeconds } : {}),
    source,
    cases: spec.cases.map((entry) => ({
      id: entry.uniqueIdentifier,
      ...(entry.description ? { description: entry.description } : {}),
      issuer: (entry.issuer ?? spec.defaults.issuer)!,
      wallet: (entry.wallet ?? spec.defaults.wallet)!,
      verifier: (entry.verifier ?? spec.defaults.verifier)!,
      format: entry.format,
      vpProfile: entry.vpProfile,
      // OpenID4VP 1.0 pairs with OpenID4VCI 1.0, the draft profile with draft 13, unless the case says.
      vciProfile: entry.vciProfile ?? (entry.vpProfile === 'final-1.0' ? 'v1' : 'draft13'),
      scenario: entry.scenario,
      ...(entry.expected ? { expected: entry.expected } : {}),
      verdict: entry.verdict,
    })),
  };
}

export function loadSpec(path: string): LoadedSpec {
  return parseSpec(readFileSync(path, 'utf8'), basename(path));
}

/**
 * The spec file for a name or path: `reference` and `live-core` mean `specs/<name>.yaml` of this
 * package; anything with a slash or a `.yaml` / `.yml` ending is a path.
 */
export function resolveSpecPath(nameOrPath: string, specsDir: string): string {
  if (/[\\/]/.test(nameOrPath) || /\.ya?ml$/.test(nameOrPath)) return nameOrPath;
  return `${specsDir.replace(/[\\/]+$/, '')}/${nameOrPath}.yaml`;
}
