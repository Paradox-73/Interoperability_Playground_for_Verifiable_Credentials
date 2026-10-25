// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';
import { IsoDateTimeSchema, RoleIdSchema } from './common.js';
import {
  CredentialFormatSchema,
  EcosystemSchema,
  HealthStatusSchema,
  InteractionSchema,
  IssuanceModeSchema,
  ResponseModeSchema,
  RoleKindSchema,
  VciProfileSchema,
  VpProfileSchema,
} from './enums.js';

/** Result of a role's or a service's health probe. */
export const HealthSchema = z.object({
  status: HealthStatusSchema,
  checkedAt: IsoDateTimeSchema,
  /** Round-trip time of the probe, when one was made. */
  latencyMs: z.number().nonnegative().optional(),
  /** Human-readable reason, shown next to a red or amber status. */
  detail: z.string().optional(),
});
export type Health = z.infer<typeof HealthSchema>;

/** What a role implementation can do; the compatibility check compares these between the three roles. */
export const RoleCapabilitiesSchema = z.object({
  formats: z.array(CredentialFormatSchema),
  /** Credential or presentation proof types, for example `Ed25519Signature2020`, `EdDSA`, `ES256`. */
  proofTypes: z.array(z.string().min(1)),
  /** DID methods the role can issue with or resolve, for example `did:web`, `did:key`, `did:jwk`. */
  didMethods: z.array(z.string().regex(/^did:[a-z0-9]+$/)),
  vciProfiles: z.array(VciProfileSchema).optional(),
  vpProfiles: z.array(VpProfileSchema).optional(),
  issuance: z.array(IssuanceModeSchema).optional(),
  responseModes: z.array(ResponseModeSchema).optional(),
});
export type RoleCapabilities = z.infer<typeof RoleCapabilitiesSchema>;

/** Static description of one implementation that can play a role (one card in a selector column). */
export const RoleDescriptorSchema = z.object({
  id: RoleIdSchema,
  kind: RoleKindSchema,
  name: z.string().min(1),
  ecosystem: EcosystemSchema,
  /** Image tag or package version; copied into every report so results can be tied to a release. */
  version: z.string().min(1),
  interaction: InteractionSchema,
  capabilities: RoleCapabilitiesSchema,
  /** Short plain-language description for the role card. */
  description: z.string().optional(),
  /** Known limitations, shown on the card and in compatibility reasons. */
  notes: z.array(z.string()).optional(),
});
export type RoleDescriptor = z.infer<typeof RoleDescriptorSchema>;

/** The part of a descriptor copied into reports. */
export const RoleRefSchema = RoleDescriptorSchema.pick({
  id: true,
  name: true,
  version: true,
  ecosystem: true,
});
export type RoleRef = z.infer<typeof RoleRefSchema>;

/** One entry of `GET /api/roles`. */
export const RoleStatusSchema = z.object({
  descriptor: RoleDescriptorSchema,
  health: HealthSchema,
});
export type RoleStatus = z.infer<typeof RoleStatusSchema>;

/** Whether the Inji containers are expected: not at all, on the host (development) or in the bundle. */
export const StackModeSchema = z.enum(['off', 'host', 'bundle']);
export type StackMode = z.infer<typeof StackModeSchema>;

/** Health of one container of the local Inji stack. */
export const StackServiceStatusSchema = z.object({
  name: z.string().min(1),
  image: z.string().optional(),
  url: z.string().optional(),
  health: HealthSchema,
});
export type StackServiceStatus = z.infer<typeof StackServiceStatusSchema>;

/** Body of `GET /api/stack/status`. */
export const StackStatusSchema = z.object({
  mode: StackModeSchema,
  checkedAt: IsoDateTimeSchema,
  services: z.array(StackServiceStatusSchema),
});
export type StackStatus = z.infer<typeof StackStatusSchema>;
