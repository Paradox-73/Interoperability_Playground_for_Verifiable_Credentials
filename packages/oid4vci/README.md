# @inji-playground/oid4vci

OpenID for Verifiable Credential Issuance (OpenID4VCI) for the playground, written from the
specifications and independent of Inji's code:

- a **reference issuer** that speaks draft 13 (what Inji stable speaks) and the final 1.0;
- a **test authorization server** that stands in for eSignet, so Inji Certify in
  authorization-code mode and Mimoto can run locally without eSignet;
- the **wallet issuance client** used by the reference wallet, by the Inji adapters and by tests.

Every HTTP request of the client goes through a `fetch` the caller passes in, and both servers are
Fastify plugins, so the playground's recording layer sees every exchange in both directions.

`npm test -w @inji-playground/oid4vci` runs this package's tests; the counts are in the
[test report](../../docs/test-report/README.md#unit-and-integration-tests-per-package). The live matrices run these clients against Inji Certify and Mimoto
([live matrix](../../docs/interop-report/live/matrix.md)).

## Layout

| Path                           | What it holds                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `src/issuer/server.ts`         | `createReferenceIssuer()`: Fastify plugin, offers, token, nonce, credential      |
| `src/issuer/configurations.ts` | The credential configurations and how each profile writes them in metadata       |
| `src/issuer/proof.ts`          | Key proof JWT validation                                                         |
| `src/issuer/signing.ts`        | Issuer keys, issuer DID, mdoc test certificates, credential signing              |
| `src/as/server.ts`             | `createTestAuthorizationServer()`: authorize, token, JWKS, userinfo, metadata    |
| `src/as/identity.ts`           | The default test identity (farmer `2154189532` from the upstream Certify sample) |
| `src/client/wallet-client.ts`  | `acceptOffer()`, `fetchViaAuthorizationCode()`                                   |
| `src/client/holder.ts`         | Holder keys and proof JWTs                                                       |
| `src/client/messages.ts`       | Runtime checks (zod) for offers and metadata                                     |
| `src/common/`                  | Constants, errors, root well-known routes, single-use stores, PKCE               |
| `src/testing/inject-fetch.ts`  | A `fetch` answered by `app.inject()`: in-process runs without a port             |

## Hosting the issuer and the authorization server

The playground server mounts both under its own port (28100). Each plugin is registered with a
prefix equal to the path of its base URL; the RFC 8615 "insert" well-known URLs live at the host
root, so the host registers them once with `registerRootWellKnown`.

```ts
import Fastify from 'fastify';
import {
  createReferenceIssuer,
  createTestAuthorizationServer,
  generateAsSigningKey,
  registerRootWellKnown,
} from '@inji-playground/oid4vci';

const as = await createTestAuthorizationServer({
  issuer: 'http://playground:28100/ref/as', // back channel: token, JWKS, metadata; the issuer identifier
  frontChannelUrl: 'http://localhost:28100/ref/as', // what a browser reaches for /authorize
  signingKey: await generateAsSigningKey('RS256'), // load it from $PLAYGROUND_RUN_DIR/keys in practice
  clients: [
    {
      clientId: 'mimoto',
      redirectUris: ['http://localhost:28004/redirect'],
      authMethod: 'private_key_jwt',
      jwks: { keys: [mimotoPublicJwk] },
    },
    {
      clientId: 'reference-wallet',
      redirectUris: ['http://localhost:28100/ref/wallet/cb'],
      authMethod: 'none',
    },
  ],
  scopesSupported: ['openid', 'profile', 'email', 'farmer_ldp_vc', 'farmer_vc_sd_jwt'],
  audience: 'http://playground:28100/ref/issuer', // aud of access tokens: the resource server
});
const issuer = createReferenceIssuer({
  baseUrl: 'http://localhost:28100/ref/issuer',
  didMethod: 'did:web',
  authorizationServer: { issuer: as.issuer, jwks: as.jwks() },
});

const app = Fastify();
await app.register(issuer.plugin, { prefix: '/ref/issuer' });
await app.register(as.plugin, { prefix: '/ref/as' });
registerRootWellKnown(app, [...issuer.wellKnownDocuments, ...as.wellKnownDocuments]);
```

## Reference issuer

One issuer serves both protocol versions, each under its own credential issuer identifier, because
metadata differs between them and a wallet finds metadata from the identifier alone:
`<base>/draft13` and `<base>/v1`.

| Route (under the prefix)                                          | Draft 13 | 1.0 | Spec                                |
| ----------------------------------------------------------------- | -------- | --- | ----------------------------------- |
| `GET /{profile}/.well-known/openid-credential-issuer`             | yes      | yes | d13 11.2, 1.0 12.2                  |
| `GET /{profile}/.well-known/oauth-authorization-server`           | yes      | yes | RFC 8414 (pre-authorized code only) |
| `GET /{profile}/.well-known/jwt-vc-issuer`                        | yes      | yes | SD-JWT VC section 5                 |
| `GET /{profile}/offers/:id` (offer by reference)                  | yes      | yes | d13 4.1.3, 1.0 4.1.3                |
| `POST /{profile}/token` (pre-authorized code, optional `tx_code`) | yes      | yes | d13 6, 1.0 6                        |
| `POST /v1/nonce`                                                  | -        | yes | 1.0 section 7                       |
| `POST /{profile}/credential`                                      | yes      | yes | d13 7, 1.0 8                        |
| `GET /did.json`, `GET /.well-known/did.json` (did:web issuer DID) | yes      | yes | did:web method                      |
| `GET /logo.svg` (the logo metadata points to)                     | yes      | yes | -                                   |

What differs between the profiles:

| Topic                | `draft13`                                                                | `v1`                                                           |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| First nonce          | `c_nonce` in the token response                                          | `POST /v1/nonce`                                               |
| Credential request   | `format` + `credential_definition.type`, `vct` or `doctype`, one `proof` | `credential_configuration_id` + `proofs.jwt[]`                 |
| Credential response  | `credential` plus a fresh `c_nonce`                                      | `credentials: [{ credential }]`                                |
| Bad or missing nonce | `invalid_proof` with a fresh `c_nonce`                                   | `invalid_nonce` (fetch a new one from the Nonce Endpoint)      |
| Display in metadata  | `display` on the configuration                                           | `credential_metadata.display` and `credential_metadata.claims` |

Credential configurations (each one in both profiles):

| Id                                    | Format      | Proof                                                 | Scope                       |
| ------------------------------------- | ----------- | ----------------------------------------------------- | --------------------------- |
| `FarmerCredential_ldp_vc`             | `ldp_vc`    | VC 1.1, `Ed25519Signature2020`                        | `farmer_ldp_vc`             |
| `FarmerCredential_ldp_vc_v2`          | `ldp_vc`    | VC 2.0, `DataIntegrityProof` / `eddsa-rdfc-2022`      | `farmer_ldp_vc_v2`          |
| `FarmerCredential_ldp_vc_es256_proof` | `ldp_vc`    | VC 1.1; key proofs ES256 only (probe of G22)          | `farmer_ldp_vc_es256_proof` |
| `FarmerCredential_vc_sd_jwt`          | `vc+sd-jwt` | EdDSA                                                 | `farmer_vc_sd_jwt`          |
| `FarmerCredential_dc_sd_jwt`          | `dc+sd-jwt` | ES256                                                 | `farmer_dc_sd_jwt`          |
| `FarmerCredential_mso_mdoc`           | `mso_mdoc`  | MSO in COSE_Sign1, ES256, `x5chain`; key proofs ES256 | `farmer_mso_mdoc`           |

`FarmerCredential_mso_mdoc` (OpenID4VCI draft 13 Appendix A.2, 1.0 Appendix A.2) has doctype
`test.ps02.playground.farmer.1` and the farmer claims as elements of the namespace of the same name
(draft 13: `claims.{namespace}.{element}`; 1.0: `credential_metadata.claims[].path` =
`[namespace, element]`). `cryptographic_binding_methods_supported` is `["cose_key"]`: the holder's
P-256 key from the proof JWT (`jwk` header or a did:jwk / did:key `kid`) becomes the MSO's
`deviceKeyInfo.deviceKey`. `credential_signing_alg_values_supported` is `["ES256"]` in draft 13 and the
COSE identifier `[-7]` in 1.0. The credential is base64url CBOR of `IssuerSigned` (1.0 Appendix
A.2.4). The MSO is signed by the issuer's P-256 key as a document signer whose test certificate is
issued by a test IACA root made in memory on the first mdoc; `issuer.mdocTrustAnchors()` returns that
root (PEM) for a verifier to trust. The playground server adds it to the reference verifier at start.

Every configuration has display name, logo, `background_color` and `text_color`. OpenID4VCI makes
them optional, but Mimoto refuses the whole issuer when one configuration lacks them (gap G4).

Offers come from code, not from an HTTP route: the playground server decides what to offer.

```ts
const offer = issuer.createOffer({
  profile: 'draft13',
  configurationId: 'FarmerCredential_vc_sd_jwt',
  claims: { farmerId: '2154189532', givenName: 'Gorge' }, // default: the farmer sample
  txCode: true, // 6 random digits, returned as offer.txCode; or a fixed string
  byReference: true, // credential_offer_uri instead of credential_offer
  issuance: { validUntil: new Date('2025-01-01') }, // scenario changes, see below
});
offer.offerUri; // openid-credential-offer://?credential_offer_uri=...
```

Key proof JWT checks, in this order (d13 7.2.1.1, 1.0 Appendix F): `typ` is
`openid4vci-proof+jwt`; `alg` is ES256 or EdDSA; exactly one of `kid` (did:jwk or did:key URL) or
`jwk`; the signature; `aud` is the credential issuer identifier; `iat` is at most 300 s old and at
most 60 s ahead; the nonce is unused, unexpired and (draft 13) belongs to this access token. The
nonce is checked last, so a nonce error means everything else was right.

Access tokens: opaque, single profile, for the pre-authorized code; or JWTs from the configured
authorization server (`authorizationServer`), checked against its JWKS, `iss`, `exp` and `aud`
(the issuer base URL, the profile identifier or the credential endpoint). For those, the scope picks
the configurations, `claimsForSubject(sub)` gives the claims, and the `c_nonce` inside the token is
accepted once, as Inji Certify does.

Scenario hook: `issuanceOptions(context)` (on the issuer) and `issuance` (per offer) can set
`validFrom` / `validUntil`, replace `types` (ldp_vc) or `vct` (SD-JWT), name the issuer key by a
test certificate in `x5c` instead of a DID `kid`, and add claims.

## Test authorization server

| Route (under the prefix)                                                           | What it does                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /authorize`                                                                   | Authorization code, PKCE S256 required, approves at once for a test identity    |
| `POST /token`                                                                      | `authorization_code`; client auth `none` or `private_key_jwt`                   |
| `GET /jwks.json`                                                                   | The signing key (public part)                                                   |
| `GET /userinfo`                                                                    | Claims of the identity behind an access token                                   |
| `GET /.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` | Metadata (also at the RFC 8414 insert location through `registerRootWellKnown`) |

- Test identity: `sub` `2154189532`, the first row of the upstream farmer sample that Certify's CSV
  data provider reads (`deploy/inji-stack/config/farmer_identity_data.csv`). `login_hint` picks
  another configured identity.
- Access tokens are JWTs with `iss`, `sub`, `aud`, `scope`, `client_id`, `iat`, `exp`, `jti`,
  `c_nonce`, `c_nonce_expires_in`; the token response repeats `c_nonce`. That is the shape Inji
  Certify reads from eSignet tokens (`VCIssuanceUtil.java:150-170`, `JwtProofValidator.java:74-97`)
  and checks in `AccessTokenValidationFilter.java:68-83` (algorithms ES256, RS256, PS256; issuer;
  audience list; `sub`; `client_id`; `iat`; `exp`).
- ID tokens (`openid` scope, or `as.issueIdToken({audience})` directly) carry the identity's claims
  including `email`, which Mimoto's token login requires (`GoogleTokenService.java:64-67`).
- `private_key_jwt`: RFC 7523 assertion with `iss` = `sub` = client id, `aud` = issuer or token
  endpoint (Mimoto sends the token endpoint, `IdpServiceImpl.java:62,96`), `exp`, single-use `jti`.
  Client keys may be RSA (Mimoto's PKCS#12), EC or OKP.

Inji Certify in authorization-code mode (certify-ac, WP-14) is pointed at it with
`mosip.certify.authn.issuer-uri` = the AS `issuer`, `mosip.certify.authn.jwk-set-uri` =
`<issuer>/jwks.json` and `mosip.certify.authn.allowed-audiences` = the `audience` option.

## Wallet client

```ts
import { acceptOffer, createHolderKey, fetchViaAuthorizationCode } from '@inji-playground/oid4vci';

const result = await acceptOffer(offerUri, {
  fetch: ctx.http.fetch, // the run's recording fetch
  txCode: '123456', // when the offer has tx_code
  holderKey: createHolderKey(), // default: ES256 with a did:jwk kid
  onStep: (step) => ctx.enterStep(step), // issuer.offer, issuer.metadata, as.metadata, token, nonce, credential
});
result.credentials[0].credential; // ldp_vc object, SD-JWT string or base64url mso_mdoc

await fetchViaAuthorizationCode('http://localhost:28100/ref/issuer/draft13', {
  configurationId: 'FarmerCredential_ldp_vc',
  clientId: 'mimoto',
  redirectUri: 'http://localhost:28004/redirect',
  clientAuth: { method: 'private_key_jwt', privateJwk, alg: 'RS256' },
});
```

- Profile: `nonce_endpoint` in issuer metadata means 1.0, otherwise draft 13 (`profile` forces one).
- Metadata: the RFC 8615 insert URL first, then the draft 13 append URL on 404; `credential_issuer`
  must equal the identifier from the offer (`ISSUER_MISMATCH` otherwise), and authorization server
  metadata must name the URL it was fetched for (`AS_ISSUER_MISMATCH`).
- Authorization server choice follows Inji's VCI client (`AuthorizationServerResolver.kt`): the only
  listed server, else the grant's `authorization_server`, else the first listed server that supports
  the grant, else the credential issuer.
- One retry with a fresh nonce after `invalid_proof` with `c_nonce` (draft 13) or `invalid_nonce` (1.0).
- `mso_mdoc`: a draft 13 request is `{format: "mso_mdoc", doctype, proof}`; the response's `credential`
  is kept as the text the issuer sent (`raw`), whether it is the OpenID4VCI 1.0 `IssuerSigned` or Inji
  Certify 0.14.0's `{docType, issuerSigned}` (both are read by `decodeMdocCredential` of
  `@inji-playground/formats`).
- Errors are `Oid4vciClientError` with a `code`, the failed `step`, the HTTP `status` and the
  server's `oauthError`, ready for the run report.

## Design decisions

- Two credential issuer identifiers (`/draft13`, `/v1`) instead of one with mixed metadata: a
  document with both `display` placements and a `nonce_endpoint` would make draft 13 wallets and
  1.0 wallets each read something the other version defines.
- The reference issuer lists the external authorization server first in `authorization_servers`
  (Mimoto uses the first entry, `IssuersServiceImpl.java:101`) and names itself in the pre-authorized
  grant's `authorization_server`, which the offer must do when several servers are listed.
- The authorization server signs with RS256 by default: Mimoto's ID token decoder is a default
  Spring `NimbusJwtDecoder` (`JwtConfig.java`), which accepts RS256 only.
- Access token `typ` is `JWT` by default rather than RFC 9068's `at+jwt`. GUESS: Certify's Spring
  Security JWT decoder may refuse `at+jwt`; not measured yet. `accessTokenTyp: 'at+jwt'` switches.
- State (codes, tokens, nonces, offers) is in memory: the reference roles live as long as the
  playground process, and a restart invalidates outstanding offers, which is the safe failure.

## Not covered

Deferred issuance, batch issuance (more than one proof), credential request and response
encryption, DPoP, PAR, wallet attestation, `authorization_details`, refresh tokens, `x5c` holder
proofs, ISO certificate profiles for the mdoc document signer and IACA (the test certificates have no
mdoc extended key usage), and revoking tokens when a code is reused.
