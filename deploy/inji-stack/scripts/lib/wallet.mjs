// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Smoke-test wallet for Inji Certify: redeems an OpenID4VCI pre-authorized code offer and receives one
 * credential. Deliberately small and self-contained (node:crypto and fetch only), so the stack check does not
 * depend on the playground packages it is meant to test against.
 *
 * Holder key: P-256, bound as did:jwk, proof JWT signed with ES256. That is the combination Inji Certify 0.14.0
 * accepted in the 2026-10-04 trial (its sample configuration lists RS256 and ES256 for FarmerCredential).
 * Spec: OpenID4VCI draft 13, sections 4.1 (credential offer), 6 (token request, pre-authorized code grant),
 * 7.2.1.1 (jwt proof type) and 7 (credential request).
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { request, toHostUrl } from './http.mjs';

export const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

const b64url = (input) => Buffer.from(input).toString('base64url');

/** Creates a P-256 holder key and its did:jwk (public JWK members only, canonical order crv, kty, x, y). */
export function createHolderKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const publicJwk = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
  const did = `did:jwk:${b64url(JSON.stringify(publicJwk))}`;
  return { privateKey, publicJwk, did, kid: `${did}#0` };
}

/** Builds the OpenID4VCI `jwt` proof of possession (header typ openid4vci-proof+jwt, ES256). */
export function createProofJwt(holder, { audience, nonce, now = Math.floor(Date.now() / 1000) }) {
  const header = { alg: 'ES256', typ: 'openid4vci-proof+jwt', kid: holder.kid };
  const payload = { aud: audience, iat: now, exp: now + 300, ...(nonce ? { nonce } : {}) };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(input), { key: holder.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${signature.toString('base64url')}`;
}

/**
 * Extracts the credential_offer_uri (by reference) or credential_offer (by value) from an offer link such as
 * openid-credential-offer://?credential_offer_uri=https%3A%2F%2F...
 * @returns {{ offerUri?: string, offer?: object }}
 */
export function parseOfferLink(link) {
  const query = link.includes('?') ? link.slice(link.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const offerUri = params.get('credential_offer_uri') ?? undefined;
  const offerJson = params.get('credential_offer');
  return { offerUri, offer: offerJson ? JSON.parse(offerJson) : undefined };
}

/** Request body for the credential endpoint, per format (draft 13 shape, which Certify 0.14.0 implements). */
export function credentialRequestBody(configuration, proofJwt) {
  const body = { format: configuration.format, proof: { proof_type: 'jwt', jwt: proofJwt } };
  if (configuration.format === 'ldp_vc') {
    body.credential_definition = {
      '@context': configuration.credential_definition?.['@context'] ?? [
        'https://www.w3.org/2018/credentials/v1',
      ],
      type: configuration.credential_definition?.type,
    };
  } else if (configuration.format === 'vc+sd-jwt' || configuration.format === 'dc+sd-jwt') {
    body.vct = configuration.vct;
  }
  return body;
}

/**
 * Keeps only the claims the credential configuration advertises: `credential_definition.credentialSubject`
 * for ldp_vc, `claims` for SD-JWT. Certify 0.14.0 rejects a /pre-authorized-data request that carries any other
 * claim (`unknown_claims`, measured 2026-10-04). A configuration that advertises nothing gets every claim.
 */
export function claimsForConfiguration(configuration, claims) {
  const advertised = Object.keys(
    configuration.credential_definition?.credentialSubject ?? configuration.claims ?? {},
  );
  if (advertised.length === 0) return { ...claims };
  return Object.fromEntries(Object.entries(claims).filter(([name]) => advertised.includes(name)));
}

/**
 * Certify's admin endpoints answer HTTP 200 with a MOSIP envelope whose `errors` array is non-empty when the
 * request was refused, so the status code alone is not enough.
 */
export function envelopeErrors(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.errors)) return [];
  return body.errors.map((e) => e?.errorCode ?? e?.errorMessage ?? JSON.stringify(e));
}

/**
 * Runs the pre-authorized code flow against Certify, from the playground's side (create the offer) and the
 * wallet's side (redeem it). Every exchange is appended to `exchanges`.
 *
 * @param {object} options
 * @param {string} options.certifyUrl host URL of certify-nginx, for example http://localhost:28091
 * @param {string} options.configurationId credential_configuration_id, for example FarmerCredential
 * @param {Record<string, unknown>} options.claims holder data; the advertised subset is posted to
 *   /pre-authorized-data (claimsForConfiguration)
 * @param {Array<{from: string, to: string}>} options.networkMap maps advertised URLs to host URLs
 * @param {import('./http.mjs').Exchange[]} options.exchanges
 * @returns {Promise<{ ok: boolean, step: string, detail?: string, credential?: unknown, format?: string,
 *   holderDid?: string }>}
 */
export async function issueWithPreAuthorizedCode({
  certifyUrl,
  configurationId,
  claims,
  networkMap,
  exchanges,
}) {
  const call = async (label, url, init) => {
    const exchange = await request(label, toHostUrl(url, networkMap).url, init);
    exchanges.push(exchange);
    return exchange;
  };
  const fail = (step, exchange) => ({
    ok: false,
    step,
    detail: exchange.error ?? `HTTP ${exchange.status}: ${JSON.stringify(exchange.body).slice(0, 400)}`,
  });

  const metadata = await call(
    'issuer metadata',
    `${certifyUrl}/v1/certify/issuance/.well-known/openid-credential-issuer`,
    {
      timeoutMs: 120_000,
    },
  );
  if (metadata.status !== 200) return fail('issuer metadata', metadata);
  const configuration = metadata.body.credential_configurations_supported?.[configurationId];
  if (!configuration) {
    return { ok: false, step: 'issuer metadata', detail: `no credential configuration ${configurationId}` };
  }

  const preAuth = await call('pre-authorized data', `${certifyUrl}/v1/certify/pre-authorized-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential_configuration_id: configurationId,
      claims: claimsForConfiguration(configuration, claims),
      expires_in: 600,
    }),
  });
  if (preAuth.status !== 200 && preAuth.status !== 201) return fail('pre-authorized data', preAuth);
  const refused = envelopeErrors(preAuth.body);
  if (refused.length > 0) {
    return { ok: false, step: 'pre-authorized data', detail: `refused: ${refused.join(', ')}` };
  }
  const link = preAuth.body.credential_offer_uri ?? preAuth.body.credential_offer ?? '';
  let { offerUri, offer } = parseOfferLink(String(link));
  if (!offer && offerUri) {
    const offerExchange = await call('credential offer', offerUri);
    if (offerExchange.status !== 200) return fail('credential offer', offerExchange);
    offer = offerExchange.body;
  }
  const preAuthorizedCode = offer?.grants?.[PRE_AUTH_GRANT]?.['pre-authorized_code'];
  if (!preAuthorizedCode)
    return { ok: false, step: 'credential offer', detail: 'offer has no pre-authorized_code' };

  // Token endpoint from the authorization server metadata (Certify is its own AS in the preauth profile).
  const asBase = metadata.body.authorization_servers?.[0] ?? metadata.body.credential_issuer;
  const asMetadata = await call(
    'authorization server metadata',
    `${asBase}/.well-known/oauth-authorization-server`,
  );
  if (asMetadata.status !== 200) return fail('authorization server metadata', asMetadata);
  const token = await call('token', asMetadata.body.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: PRE_AUTH_GRANT,
      'pre-authorized_code': preAuthorizedCode,
    }).toString(),
  });
  if (token.status !== 200) return fail('token', token);

  const holder = createHolderKey();
  const proofJwt = createProofJwt(holder, {
    audience: metadata.body.credential_issuer,
    nonce: token.body.c_nonce,
  });
  const credential = await call('credential', metadata.body.credential_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.body.access_token}` },
    body: JSON.stringify(credentialRequestBody(configuration, proofJwt)),
    timeoutMs: 90_000,
  });
  if (credential.status !== 200) return fail('credential', credential);
  return {
    ok: true,
    step: 'credential',
    credential: credential.body.credential,
    format: configuration.format,
    holderDid: holder.did,
  };
}
