// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Reference OpenID4VCI credential issuer, written from the specifications and independent of Inji.
 *
 * One issuer serves both protocol versions side by side, each under its own credential issuer
 * identifier, because metadata differs between them and a wallet finds metadata from the
 * identifier alone:
 * - `<base>/draft13`: OpenID4VCI draft 13 (what Inji stable speaks): `c_nonce` in token and credential
 *   responses, `format` + `credential_definition` / `vct` and a single `proof` in the request.
 * - `<base>/v1`: OpenID4VCI 1.0: Nonce Endpoint, `credential_configuration_id`, `proofs.jwt[]`, and a
 *   `credentials[]` array in the response.
 *
 * Routes, relative to the plugin prefix (the path of `baseUrl`, for example `/ref/issuer`):
 * `/{profile}/.well-known/openid-credential-issuer`, `/{profile}/.well-known/oauth-authorization-server`,
 * `/{profile}/.well-known/jwt-vc-issuer`, `/{profile}/offers/:id`, `POST /{profile}/token`,
 * `POST /{profile}/credential`, `POST /v1/nonce`, `/did.json` and `/.well-known/did.json` (did:web),
 * `/logo.svg`.
 *
 * Tokens: the issuer is its own authorization server for the pre-authorized code grant (opaque
 * access tokens). With `authorizationServer` set, it also accepts JWT access tokens from that server
 * (the test AS in `../as/`) for the authorization code flow, and lists it first in
 * `authorization_servers`, because Mimoto uses the first entry (`IssuersServiceImpl.java:101`).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createLocalJWKSet, jwtVerify, type JWK, type JWTPayload } from 'jose';
import type { VciProfile } from '@inji-playground/protocol';
import {
  CREDENTIAL_OFFER_SCHEME,
  PRE_AUTHORIZED_CODE_GRANT,
  WELL_KNOWN,
  trimTrailingSlash,
} from '../common/constants.js';
import { OAuthError } from '../common/errors.js';
import {
  ExpiringStore,
  ensureFormParser,
  epochSeconds,
  installOAuthErrorHandler,
  randomDigits,
  randomToken,
  stringParam,
  systemClock,
  type Clock,
} from '../common/util.js';
import type { WellKnownDocument } from '../common/well-known.js';
import {
  DEFAULT_CONFIGURATIONS,
  DEFAULT_FARMER_CLAIMS,
  ISSUER_LOGO_SVG,
  configurationMetadata,
  type CredentialConfiguration,
  type IssuerBranding,
} from './configurations.js';
import { validateProofJwt, type HolderBinding } from './proof.js';
import {
  IssuerSigner,
  generateIssuerKeys,
  type IssuanceOptions,
  type IssuedCredential,
  type IssuerDidMethod,
  type IssuerKeys,
} from './signing.js';

export const VCI_PROFILES: readonly VciProfile[] = ['draft13', 'v1'];

export interface IssuanceHookContext {
  configuration: CredentialConfiguration;
  profile: VciProfile;
  claims: Record<string, unknown>;
  holder: HolderBinding;
  /** Set for credentials requested with an access token from the external authorization server. */
  subject?: string;
}

/** Called before every credential is signed; scenarios use it to change validity, type or key naming. */
export type IssuanceOptionsHook = (
  context: IssuanceHookContext,
) => IssuanceOptions | undefined | Promise<IssuanceOptions | undefined>;

export interface ReferenceIssuerOptions {
  /** Public base URL, for example `http://localhost:28100/ref/issuer`. */
  baseUrl: string;
  keys?: IssuerKeys;
  /** Default `did:key`; hosted runs use `did:web` so Inji Verify can resolve the issuer. */
  didMethod?: IssuerDidMethod;
  configurations?: readonly CredentialConfiguration[];
  branding?: Partial<IssuerBranding>;
  /** External authorization server for the authorization code flow (the test AS). */
  authorizationServer?: {
    issuer: string;
    /** The server's JWKS, or a function that fetches it. */
    jwks: { keys: JWK[] } | (() => Promise<{ keys: JWK[] }>);
  };
  /** Subject claims for a credential requested with an external access token. Default: farmer sample with `farmerId` = `sub`. */
  claimsForSubject?: (sub: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
  issuanceOptions?: IssuanceOptionsHook;
  preAuthorizedCodeTtlSeconds?: number;
  accessTokenTtlSeconds?: number;
  cNonceTtlSeconds?: number;
  /** Maximum age of a proof JWT's `iat`. Default 300 s. */
  proofMaxAgeSeconds?: number;
  clock?: Clock;
}

export interface CreateOfferInput {
  profile?: VciProfile;
  /** One configuration id, or several. */
  configurationId?: string;
  configurationIds?: string[];
  /** Subject claims; default the farmer sample. */
  claims?: Record<string, unknown>;
  /** A transaction code the wallet must send: a fixed value, or `true` for 6 random digits. */
  txCode?: string | true;
  /** Offer by reference (`credential_offer_uri`) instead of by value. */
  byReference?: boolean;
  /** Per-offer issuance changes (scenarios); merged over the `issuanceOptions` hook. */
  issuance?: IssuanceOptions;
}

export interface CreatedOffer {
  offerId: string;
  profile: VciProfile;
  credentialIssuer: string;
  credentialConfigurationIds: string[];
  /** The offer object (OpenID4VCI section 4.1.1). */
  offer: Record<string, unknown>;
  /** `openid-credential-offer://?credential_offer=...` or `?credential_offer_uri=...`. */
  offerUri: string;
  /** Present when the offer is passed by reference. */
  offerUrl?: string;
  preAuthorizedCode: string;
  txCode?: string;
}

interface PreAuthorizedGrant {
  profile: VciProfile;
  configurationIds: string[];
  claims: Record<string, unknown>;
  txCode?: string;
  /** Wrong `tx_code` values sent so far; the code is revoked at MAX_TX_CODE_ATTEMPTS. */
  txCodeFailures?: number;
  issuance?: IssuanceOptions;
}

/** OpenID4VCI 1.0 section 13.6: a 6-digit tx_code must not be guessable within the code's lifetime. */
const MAX_TX_CODE_ATTEMPTS = 5;

/** Compares without leaking, through timing, how much of the guess was right. */
function sameSecret(a: string, b: string): boolean {
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(a), digest(b));
}

interface AccessGrant {
  profile: VciProfile;
  configurationIds: string[];
  claims: Record<string, unknown>;
  issuance?: IssuanceOptions;
  subject?: string;
}

/** Nonce record: draft 13 nonces belong to one access token; 1.0 nonces to none. */
interface NonceRecord {
  accessToken?: string;
}

export interface ReferenceIssuer {
  /** Fastify plugin; register it with `{ prefix: new URL(baseUrl).pathname }`. */
  readonly plugin: FastifyPluginAsync;
  readonly baseUrl: string;
  /** Documents for `registerRootWellKnown` (RFC 8615 insert locations). */
  readonly wellKnownDocuments: WellKnownDocument[];
  readonly configurations: readonly CredentialConfiguration[];
  /** Credential issuer identifier of a profile. */
  issuerUrl(profile: VciProfile): string;
  metadata(profile: VciProfile): Record<string, unknown>;
  authorizationServerMetadata(profile: VciProfile): Record<string, unknown>;
  createOffer(input: CreateOfferInput): CreatedOffer;
  /** DIDs of the issuer keys (one DID for did:web). */
  dids(): { ed25519: string; p256: string };
  /** PEM certificates a verifier must trust for this issuer's mso_mdoc (the test IACA root). */
  mdocTrustAnchors(): Promise<string[]>;
  didDocument(): Record<string, unknown> | undefined;
}

export function createReferenceIssuer(options: ReferenceIssuerOptions): ReferenceIssuer {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const clock = options.clock ?? systemClock;
  const configurations = options.configurations ?? DEFAULT_CONFIGURATIONS;
  const byId = new Map(configurations.map((config) => [config.id, config]));
  const signer = new IssuerSigner(
    options.keys ?? generateIssuerKeys(),
    options.didMethod ?? 'did:key',
    baseUrl,
  );
  const branding: IssuerBranding = {
    name: 'Playground reference issuer',
    logoUri: `${baseUrl}/logo.svg`,
    backgroundColor: '#0b5d4b',
    textColor: '#f4f1e8',
    locale: 'en',
    ...options.branding,
  };
  const ttl = {
    preAuthorizedCode: options.preAuthorizedCodeTtlSeconds ?? 300,
    accessToken: options.accessTokenTtlSeconds ?? 600,
    cNonce: options.cNonceTtlSeconds ?? 300,
  };
  const proofMaxAge = options.proofMaxAgeSeconds ?? 300;
  const externalAs = options.authorizationServer
    ? { ...options.authorizationServer, issuer: trimTrailingSlash(options.authorizationServer.issuer) }
    : undefined;

  const offers = new ExpiringStore<Record<string, unknown>>(clock);
  const preAuthorizedCodes = new ExpiringStore<PreAuthorizedGrant>(clock);
  const accessTokens = new ExpiringStore<AccessGrant>(clock);
  const nonces = new ExpiringStore<NonceRecord>(clock);
  // c_nonce values carried inside external access tokens that were already used in a proof.
  const usedTokenNonces = new ExpiringStore<true>(clock);

  const issuerUrl = (profile: VciProfile): string => `${baseUrl}/${profile}`;
  const endpoint = (profile: VciProfile, name: string): string => `${issuerUrl(profile)}/${name}`;

  function metadata(profile: VciProfile): Record<string, unknown> {
    const identifier = issuerUrl(profile);
    return {
      credential_issuer: identifier,
      ...(externalAs ? { authorization_servers: [externalAs.issuer, identifier] } : {}),
      credential_endpoint: endpoint(profile, 'credential'),
      ...(profile === 'v1' ? { nonce_endpoint: endpoint(profile, 'nonce') } : {}),
      display: [
        {
          name: branding.name,
          locale: branding.locale,
          logo: { uri: branding.logoUri, alt_text: `${branding.name} logo` },
        },
      ],
      credential_configurations_supported: Object.fromEntries(
        configurations.map((config) => [config.id, configurationMetadata(config, profile, branding)]),
      ),
    };
  }

  function authorizationServerMetadata(profile: VciProfile): Record<string, unknown> {
    return {
      issuer: issuerUrl(profile),
      token_endpoint: endpoint(profile, 'token'),
      grant_types_supported: [PRE_AUTHORIZED_CODE_GRANT],
      response_types_supported: [],
      token_endpoint_auth_methods_supported: ['none'],
      // OpenID4VCI 1.0 section 12.3: the issuer accepts a token request without client_id.
      'pre-authorized_grant_anonymous_access_supported': true,
    };
  }

  function jwtVcIssuerMetadata(profile: VciProfile): Record<string, unknown> {
    return { issuer: issuerUrl(profile), jwks: { keys: signer.publicJwks() } };
  }

  function createOffer(input: CreateOfferInput): CreatedOffer {
    const profile = input.profile ?? 'draft13';
    const ids = input.configurationIds ?? (input.configurationId ? [input.configurationId] : []);
    if (ids.length === 0) throw new Error('createOffer needs at least one configuration id');
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`unknown credential configuration ${id}`);
    }
    const code = randomToken();
    const txCode = input.txCode === true ? randomDigits(6) : input.txCode;
    const identifier = issuerUrl(profile);
    const grant: Record<string, unknown> = {
      'pre-authorized_code': code,
      ...(txCode === undefined
        ? {}
        : {
            tx_code: {
              length: txCode.length,
              input_mode: /^\d+$/.test(txCode) ? 'numeric' : 'text',
              description: 'Enter the transaction code shown by the playground',
            },
          }),
      // Required when authorization_servers lists several servers (section 4.1.1).
      ...(externalAs ? { authorization_server: identifier } : {}),
    };
    const offer = {
      credential_issuer: identifier,
      credential_configuration_ids: ids,
      grants: { [PRE_AUTHORIZED_CODE_GRANT]: grant },
    };
    preAuthorizedCodes.set(
      code,
      {
        profile,
        configurationIds: ids,
        claims: input.claims ?? { ...DEFAULT_FARMER_CLAIMS },
        ...(txCode === undefined ? {} : { txCode }),
        ...(input.issuance ? { issuance: input.issuance } : {}),
      },
      ttl.preAuthorizedCode,
    );
    const offerId = randomToken(12);
    let offerUri: string;
    let offerUrl: string | undefined;
    if (input.byReference) {
      offerUrl = `${identifier}/offers/${offerId}`;
      offers.set(offerId, offer, ttl.preAuthorizedCode);
      offerUri = `${CREDENTIAL_OFFER_SCHEME}?credential_offer_uri=${encodeURIComponent(offerUrl)}`;
    } else {
      offerUri = `${CREDENTIAL_OFFER_SCHEME}?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;
    }
    return {
      offerId,
      profile,
      credentialIssuer: identifier,
      credentialConfigurationIds: ids,
      offer,
      offerUri,
      ...(offerUrl === undefined ? {} : { offerUrl }),
      preAuthorizedCode: code,
      ...(txCode === undefined ? {} : { txCode }),
    };
  }

  /** A fresh nonce; in draft 13 it belongs to the access token that will use it. */
  function newNonce(accessToken?: string): { c_nonce: string; c_nonce_expires_in: number } {
    const value = randomToken(16);
    nonces.set(value, accessToken === undefined ? {} : { accessToken }, ttl.cNonce);
    return { c_nonce: value, c_nonce_expires_in: ttl.cNonce };
  }

  async function externalJwks(): Promise<{ keys: JWK[] }> {
    const source = externalAs!.jwks;
    return typeof source === 'function' ? source() : source;
  }

  interface ResolvedToken {
    token: string;
    grant: AccessGrant;
    /** For an external token: the c_nonce it carries, when still valid. */
    tokenNonce?: string;
  }

  async function resolveAccessToken(request: FastifyRequest, profile: VciProfile): Promise<ResolvedToken> {
    const header = request.headers.authorization ?? '';
    const match = /^(?:Bearer|DPoP) (.+)$/.exec(header);
    if (!match) throw new OAuthError('invalid_token', 'Authorization: Bearer <access token> is missing', 401);
    const token = match[1]!;
    const local = accessTokens.peek(token);
    if (local.status === 'valid' && local.value) {
      if (local.value.profile !== profile) {
        throw new OAuthError(
          'invalid_token',
          `access token was issued by the ${local.value.profile} endpoint`,
          401,
        );
      }
      return { token, grant: local.value };
    }
    if (local.status === 'expired') throw new OAuthError('invalid_token', 'access token has expired', 401);
    if (!externalAs || token.split('.').length !== 3) {
      throw new OAuthError('invalid_token', 'access token is unknown', 401);
    }
    let claims: JWTPayload;
    try {
      ({ payload: claims } = await jwtVerify(token, createLocalJWKSet(await externalJwks()), {
        issuer: externalAs.issuer,
        currentDate: new Date(clock()),
      }));
    } catch (cause) {
      throw new OAuthError(
        'invalid_token',
        `access token rejected: ${cause instanceof Error ? cause.message : ''}`,
        401,
      );
    }
    const accepted = new Set([baseUrl, issuerUrl(profile), endpoint(profile, 'credential')]);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((value) => typeof value === 'string' && accepted.has(trimTrailingSlash(value)))) {
      throw new OAuthError(
        'invalid_token',
        `access token aud ${JSON.stringify(claims.aud)} is not this issuer`,
        401,
      );
    }
    if (typeof claims.sub !== 'string') throw new OAuthError('invalid_token', 'access token has no sub', 401);
    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
    const configurationIds = configurations
      .filter((config) => scopes.includes(config.scope))
      .map((c) => c.id);
    const subjectClaims = options.claimsForSubject
      ? await options.claimsForSubject(claims.sub)
      : { ...DEFAULT_FARMER_CLAIMS, farmerId: claims.sub };
    const nonceIssuedAt = typeof claims.iat === 'number' ? claims.iat : 0;
    const nonceLifetime = typeof claims.c_nonce_expires_in === 'number' ? claims.c_nonce_expires_in : 0;
    const tokenNonce =
      typeof claims.c_nonce === 'string' && nonceIssuedAt + nonceLifetime > epochSeconds(clock())
        ? claims.c_nonce
        : undefined;
    return {
      token,
      grant: { profile, configurationIds, claims: subjectClaims, subject: claims.sub },
      ...(tokenNonce === undefined ? {} : { tokenNonce }),
    };
  }

  /** Finds the configuration a draft 13 request names by `format` and `credential_definition` / `vct`. */
  function configurationForDraft13(
    body: Record<string, unknown>,
    granted: readonly string[],
  ): CredentialConfiguration {
    const format = body.format;
    if (typeof format !== 'string') {
      throw new OAuthError('invalid_credential_request', 'format is required (draft 13 section 7.2)');
    }
    const candidates = configurations.filter((config) => config.format === format);
    if (candidates.length === 0) {
      throw new OAuthError('unsupported_credential_format', `format ${format} is not supported`);
    }
    if (format === 'ldp_vc') {
      const definition = (body.credential_definition ?? {}) as { type?: unknown; '@context'?: unknown };
      const types = Array.isArray(definition.type)
        ? definition.type.filter((t) => typeof t === 'string')
        : [];
      const matches = candidates.filter(
        (config) =>
          types.length === config.ldp!.types.length &&
          config.ldp!.types.every((type) => types.includes(type)),
      );
      // VC 1.1 and VC 2.0 configurations share the type list; the first @context tells them apart, and
      // of two with the same context the one the access token covers is meant.
      const contexts = Array.isArray(definition['@context']) ? definition['@context'] : [];
      const sameContext = matches.filter((config) => config.ldp!.contexts[0] === contexts[0]);
      const chosen =
        sameContext.find((config) => granted.includes(config.id)) ??
        sameContext[0] ??
        matches.find((config) => granted.includes(config.id)) ??
        matches[0];
      if (!chosen) {
        throw new OAuthError(
          'unsupported_credential_type',
          `credential_definition.type ${JSON.stringify(types)} is not offered`,
        );
      }
      return chosen;
    }
    if (format === 'mso_mdoc') {
      // Draft 13 Appendix A.2.4: an mso_mdoc request names the doctype.
      const match = candidates.find((config) => config.mdoc?.doctype === body.doctype);
      if (!match) {
        throw new OAuthError('unsupported_credential_type', `doctype ${String(body.doctype)} is not offered`);
      }
      return match;
    }
    const match = candidates.find((config) => config.vct === body.vct);
    if (!match) throw new OAuthError('unsupported_credential_type', `vct ${String(body.vct)} is not offered`);
    return match;
  }

  async function handleCredential(
    request: FastifyRequest,
    profile: VciProfile,
  ): Promise<Record<string, unknown>> {
    const resolved = await resolveAccessToken(request, profile);
    const body = (typeof request.body === 'object' && request.body !== null ? request.body : {}) as Record<
      string,
      unknown
    >;
    const identifier = issuerUrl(profile);

    // Errors that a fresh nonce repairs carry one (draft 13 section 7.3.1.2).
    const proofError = (description: string): OAuthError =>
      profile === 'draft13'
        ? new OAuthError('invalid_proof', description, 400, newNonce(resolved.token))
        : new OAuthError('invalid_proof', description);
    const nonceError = (description: string): OAuthError =>
      profile === 'draft13' ? proofError(description) : new OAuthError('invalid_nonce', description);

    let configuration: CredentialConfiguration;
    let proofJwts: unknown[];
    if (profile === 'draft13') {
      configuration = configurationForDraft13(body, resolved.grant.configurationIds);
      const proof = body.proof as { proof_type?: unknown; jwt?: unknown } | undefined;
      if (!proof) throw proofError('proof is missing');
      if (proof.proof_type !== 'jwt')
        throw proofError(`proof_type ${String(proof.proof_type)} is not supported`);
      proofJwts = [proof.jwt];
    } else {
      const id = body.credential_configuration_id;
      if (typeof id !== 'string') {
        throw new OAuthError(
          'invalid_credential_request',
          'credential_configuration_id is required (OpenID4VCI 1.0 section 8.2)',
        );
      }
      const found = byId.get(id);
      if (!found)
        throw new OAuthError('unknown_credential_configuration', `credential configuration ${id} is unknown`);
      configuration = found;
      if (body.proof !== undefined) {
        throw new OAuthError(
          'invalid_credential_request',
          'OpenID4VCI 1.0 uses proofs, not proof (section 8.2)',
        );
      }
      const proofs = body.proofs as { jwt?: unknown } | undefined;
      if (!proofs || !Array.isArray(proofs.jwt) || proofs.jwt.length === 0) {
        throw new OAuthError('invalid_proof', 'proofs.jwt must be a non-empty array');
      }
      if (proofs.jwt.length > 1) {
        throw new OAuthError(
          'invalid_credential_request',
          'batch issuance is not offered (no batch_credential_issuance)',
        );
      }
      proofJwts = proofs.jwt;
    }

    if (!resolved.grant.configurationIds.includes(configuration.id)) {
      throw new OAuthError(
        'credential_request_denied',
        `the access token does not cover ${configuration.id} (granted: ${resolved.grant.configurationIds.join(', ') || 'none'})`,
        403,
      );
    }

    const nowSeconds = epochSeconds(clock());
    const validated = [];
    for (const jwt of proofJwts) {
      try {
        validated.push(
          await validateProofJwt(jwt, {
            audience: identifier,
            nowSeconds,
            maxAgeSeconds: proofMaxAge,
            skewSeconds: 60,
            ...(configuration.proofSigningAlgs ? { algorithms: configuration.proofSigningAlgs } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof OAuthError) throw proofError(error.message);
        throw error;
      }
    }

    // Nonce check (draft 13 section 7.2.1.1 / 1.0 section 7 and F.4).
    const nonce = validated[0]!.nonce;
    if (validated.some((proof) => proof.nonce !== nonce))
      throw nonceError('all proofs must carry the same nonce');
    if (nonce === undefined) throw nonceError('proof nonce is missing');
    const stored = nonces.peek(nonce);
    const matchesStored =
      stored.status === 'valid' &&
      (profile === 'v1' ||
        stored.value?.accessToken === undefined ||
        stored.value.accessToken === resolved.token);
    const matchesToken =
      resolved.tokenNonce === nonce &&
      usedTokenNonces.peek(`${resolved.token}:${nonce}`).status === 'unknown';
    if (!matchesStored && !matchesToken) {
      const reason = stored.status === 'valid' ? 'belongs to another access token' : `is ${stored.status}`;
      throw nonceError(`proof nonce ${reason}`);
    }
    if (matchesStored) nonces.consume(nonce);
    else usedTokenNonces.set(`${resolved.token}:${nonce}`, true, ttl.accessToken);

    const issued: IssuedCredential[] = [];
    for (const proof of validated) {
      const hookOptions = await options.issuanceOptions?.({
        configuration,
        profile,
        claims: resolved.grant.claims,
        holder: proof.holder,
        ...(resolved.grant.subject === undefined ? {} : { subject: resolved.grant.subject }),
      });
      issued.push(
        await signer.issue({
          configuration,
          claims: resolved.grant.claims,
          holder: proof.holder,
          credentialIssuer: identifier,
          now: new Date(clock()),
          options: { ...hookOptions, ...resolved.grant.issuance },
        }),
      );
    }

    if (profile === 'draft13') {
      return { credential: issued[0]!.credential, ...newNonce(resolved.token) };
    }
    return { credentials: issued.map((entry) => ({ credential: entry.credential })) };
  }

  function handleToken(body: unknown, profile: VciProfile): Record<string, unknown> {
    const grantType = stringParam(body, 'grant_type');
    if (grantType !== PRE_AUTHORIZED_CODE_GRANT) {
      throw new OAuthError(
        'unsupported_grant_type',
        `grant_type ${String(grantType)} is not supported here; use ${PRE_AUTHORIZED_CODE_GRANT}`,
      );
    }
    const code = stringParam(body, 'pre-authorized_code');
    if (code === undefined) throw new OAuthError('invalid_request', 'pre-authorized_code is missing');
    const found = preAuthorizedCodes.peek(code);
    if (found.status !== 'valid' || !found.value) {
      const reason = { unknown: 'is unknown', expired: 'has expired', used: 'was already used', valid: '' };
      throw new OAuthError('invalid_grant', `pre-authorized code ${reason[found.status]}`);
    }
    const grant = found.value;
    if (grant.profile !== profile) {
      throw new OAuthError('invalid_grant', `pre-authorized code belongs to the ${grant.profile} issuer`);
    }
    if (grant.txCode !== undefined) {
      // `user_pin` is the draft 11/12 name of the same parameter, still sent by older Inji clients.
      const sent = stringParam(body, 'tx_code') ?? stringParam(body, 'user_pin');
      if (sent === undefined) throw new OAuthError('invalid_request', 'tx_code is required for this offer');
      if (!sameSecret(sent, grant.txCode)) {
        grant.txCodeFailures = (grant.txCodeFailures ?? 0) + 1;
        if (grant.txCodeFailures < MAX_TX_CODE_ATTEMPTS)
          throw new OAuthError('invalid_grant', 'tx_code is wrong');
        preAuthorizedCodes.consume(code);
        throw new OAuthError(
          'invalid_grant',
          'tx_code is wrong; too many wrong tx_code values, so the pre-authorized code is revoked',
        );
      }
    }
    preAuthorizedCodes.consume(code);
    const accessToken = randomToken();
    accessTokens.set(
      accessToken,
      {
        profile,
        configurationIds: grant.configurationIds,
        claims: grant.claims,
        ...(grant.issuance ? { issuance: grant.issuance } : {}),
      },
      ttl.accessToken,
    );
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ttl.accessToken,
      // Draft 13 section 6.2 returns the first c_nonce here; 1.0 moved it to the Nonce Endpoint.
      ...(profile === 'draft13' ? newNonce(accessToken) : {}),
    };
  }

  // Registration is synchronous; the plugin type stays async because Fastify awaits it either way.
  const plugin: FastifyPluginAsync = (app: FastifyInstance) => {
    ensureFormParser(app);
    installOAuthErrorHandler(app);

    app.get('/logo.svg', (_request, reply) =>
      reply.type('image/svg+xml').header('cache-control', 'public, max-age=3600').send(ISSUER_LOGO_SVG),
    );
    const didDocument = (_request: FastifyRequest, reply: FastifyReply) => {
      const document = signer.didDocument();
      if (!document)
        return reply.code(404).send({ error: 'not_found', error_description: 'issuer DID is not did:web' });
      return reply.type('application/did+json').send(document);
    };
    app.get('/did.json', didDocument);
    app.get('/.well-known/did.json', didDocument);
    // Status lists for credentials issued with `revoked` (Token Status List, Bitstring Status List).
    app.get<{ Params: { alg: string } }>('/status/token/:alg', (request, reply) => {
      const token = signer.statusListToken(request.params.alg, new Date(clock()));
      if (!token)
        return reply.code(404).send({ error: 'not_found', error_description: 'no such status list' });
      return reply.type('application/statuslist+jwt').header('cache-control', 'no-store').send(token);
    });
    app.get('/status/bitstring', async (_request, reply) =>
      reply
        .type('application/vc+ld+json')
        .header('cache-control', 'no-store')
        .send(await signer.bitstringStatusList(new Date(clock()))),
    );

    for (const profile of VCI_PROFILES) {
      app.get(`/${profile}${WELL_KNOWN.credentialIssuer}`, (_request, reply) =>
        reply.send(metadata(profile)),
      );
      app.get(`/${profile}${WELL_KNOWN.oauthAuthorizationServer}`, (_request, reply) =>
        reply.send(authorizationServerMetadata(profile)),
      );
      app.get(`/${profile}${WELL_KNOWN.jwtVcIssuer}`, (_request, reply) =>
        reply.send(jwtVcIssuerMetadata(profile)),
      );
      app.get<{ Params: { id: string } }>(`/${profile}/offers/:id`, (request, reply) => {
        const found = offers.peek(request.params.id);
        if (found.status !== 'valid' && found.status !== 'used') {
          return reply
            .code(404)
            .send({ error: 'not_found', error_description: `credential offer ${found.status}` });
        }
        return reply.header('cache-control', 'no-store').send(found.value);
      });
      app.post(`/${profile}/token`, (request, reply) =>
        reply.header('cache-control', 'no-store').send(handleToken(request.body, profile)),
      );
      app.post(`/${profile}/credential`, async (request, reply) =>
        reply.header('cache-control', 'no-store').send(await handleCredential(request, profile)),
      );
    }
    // OpenID4VCI 1.0 section 7: the Nonce Endpoint needs no authentication.
    app.post('/v1/nonce', (_request, reply) =>
      reply.header('cache-control', 'no-store').send({ c_nonce: newNonce().c_nonce }),
    );
    return Promise.resolve();
  };

  const wellKnownDocuments: WellKnownDocument[] = VCI_PROFILES.flatMap((profile) => [
    {
      identifier: issuerUrl(profile),
      wellKnownPath: WELL_KNOWN.credentialIssuer,
      document: () => metadata(profile),
    },
    {
      identifier: issuerUrl(profile),
      wellKnownPath: WELL_KNOWN.oauthAuthorizationServer,
      document: () => authorizationServerMetadata(profile),
    },
    {
      identifier: issuerUrl(profile),
      wellKnownPath: WELL_KNOWN.jwtVcIssuer,
      document: () => jwtVcIssuerMetadata(profile),
    },
  ]);

  return {
    plugin,
    baseUrl,
    wellKnownDocuments,
    configurations,
    issuerUrl,
    metadata,
    authorizationServerMetadata,
    createOffer,
    dids: () => ({ ed25519: signer.ed25519.did, p256: signer.p256.did }),
    mdocTrustAnchors: async () => [(await signer.mdocCertificates()).iaca.pem],
    didDocument: () => signer.didDocument() as Record<string, unknown> | undefined,
  };
}
