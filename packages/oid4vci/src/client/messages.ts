// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Runtime checks for what the wallet client reads from an issuer: credential offer, issuer metadata
 * and authorization server metadata. Only the members the client uses are checked; unknown members
 * are kept, because the inspector shows the document as it was received.
 */
import { z } from 'zod';
import { Oid4vciClientError } from '../common/errors.js';
import type { StepId } from '@inji-playground/protocol';

const PreAuthorizedGrantSchema = z.looseObject({
  'pre-authorized_code': z.string().min(1),
  tx_code: z
    .looseObject({
      length: z.number().int().positive().optional(),
      input_mode: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  authorization_server: z.string().optional(),
});

const AuthorizationCodeGrantSchema = z.looseObject({
  issuer_state: z.string().optional(),
  authorization_server: z.string().optional(),
});

/** OpenID4VCI section 4.1.1 (same in draft 13 and 1.0). */
export const CredentialOfferSchema = z.looseObject({
  credential_issuer: z.url(),
  credential_configuration_ids: z.array(z.string().min(1)).min(1),
  grants: z
    .looseObject({
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': PreAuthorizedGrantSchema.optional(),
      authorization_code: AuthorizationCodeGrantSchema.optional(),
    })
    .optional(),
});
export type CredentialOffer = z.infer<typeof CredentialOfferSchema>;

const CredentialConfigurationSchema = z.looseObject({
  format: z.string().min(1),
  scope: z.string().optional(),
  vct: z.string().optional(),
  doctype: z.string().optional(),
  credential_definition: z.looseObject({}).optional(),
});

/** Draft 13 section 11.2.3, 1.0 section 12.2.4. */
export const IssuerMetadataSchema = z.looseObject({
  credential_issuer: z.url(),
  authorization_servers: z.array(z.url()).optional(),
  credential_endpoint: z.url(),
  nonce_endpoint: z.url().optional(),
  credential_configurations_supported: z.record(z.string(), CredentialConfigurationSchema),
});
export type IssuerMetadata = z.infer<typeof IssuerMetadataSchema>;

/** RFC 8414 section 2 (only the members the client uses). */
export const AuthorizationServerMetadataSchema = z.looseObject({
  issuer: z.url(),
  token_endpoint: z.url(),
  authorization_endpoint: z.url().optional(),
  grant_types_supported: z.array(z.string()).optional(),
});
export type AuthorizationServerMetadata = z.infer<typeof AuthorizationServerMetadataSchema>;

function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code: 'OFFER_INVALID' | 'METADATA_INVALID' | 'AS_METADATA_INVALID',
  step: StepId,
  what: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Oid4vciClientError(code, `${what} is invalid: ${issues.join('; ')}`, {
      step,
      details: { issues },
    });
  }
  return result.data;
}

export const parseCredentialOffer = (value: unknown): CredentialOffer =>
  parse(CredentialOfferSchema, value, 'OFFER_INVALID', 'issuer.offer', 'credential offer');

export const parseIssuerMetadata = (value: unknown): IssuerMetadata =>
  parse(IssuerMetadataSchema, value, 'METADATA_INVALID', 'issuer.metadata', 'issuer metadata');

export const parseAuthorizationServerMetadata = (value: unknown): AuthorizationServerMetadata =>
  parse(
    AuthorizationServerMetadataSchema,
    value,
    'AS_METADATA_INVALID',
    'as.metadata',
    'authorization server metadata',
  );
