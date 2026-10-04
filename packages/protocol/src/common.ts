import { z } from 'zod';

/** ISO 8601 timestamp with a time zone offset, as produced by `new Date().toISOString()`. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/**
 * Identifier of a role implementation, for example `inji-certify` or `ref-wallet`. Lower-case words
 * joined by hyphens, so ids are safe in URLs, file names and matrix cell keys.
 */
export const RoleIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'role ids are lower-case words joined by hyphens');
export type RoleId = z.infer<typeof RoleIdSchema>;

/** Run identifiers are opaque, URL-safe strings chosen by the server. */
export const RunIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'run ids are URL-safe');
export type RunId = z.infer<typeof RunIdSchema>;

/** Scenario identifiers, for example `happy` or `tamper.expired`. */
export const ScenarioIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'scenario ids are lower-case words joined by dots or hyphens');
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

/** Role ids of the implementations planned for the three columns (section "Role catalogue" of the docs). */
export const KNOWN_ROLE_IDS = {
  issuer: ['inji-certify', 'inji-certify-ac', 'ref-issuer'],
  wallet: ['ref-wallet', 'inji-web', 'mobile-wallet'],
  verifier: ['inji-verify', 'inji-verify-sdk', 'ref-verifier'],
} as const;
