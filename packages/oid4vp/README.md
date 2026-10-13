# @inji-playground/oid4vp

Reference OpenID4VP verifier and the wallet side of presentation, written from the specifications and
independent of Inji. The playground uses them to run flows without a phone, to build cross-ecosystem
combinations (Inji Certify -> reference wallet -> Inji Verify, reference wallet -> reference verifier),
and to test Inji modules against something that is not Inji. Credential formats come from
`@inji-playground/formats`.

## Profiles

Inji's stable releases and OpenID4VP 1.0 differ on the wire, so both sides speak two profiles
(`VpProfile` in `@inji-playground/protocol`):

|                             | `inji-draft` (drafts 21-23, as Inji Verify 0.18 and Inji Wallet speak them)                                           | `final-1.0` (OpenID4VP 1.0)                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Query                       | Presentation Exchange 2.0 `presentation_definition`                                                                   | `dcql_query` (section 6)                                               |
| DID client id               | bare DID (`did:key:...`), signed request object (`typ` `oauth-authz-req+jwt`, EdDSA) at `request_uri` or as `request` | `decentralized_identifier:did:...`, same signing                       |
| Redirect URI client id      | `client_id` = response URI with `client_id_scheme=redirect_uri`, unsigned, by value                                   | `redirect_uri:<response URI>`, unsigned, by value                      |
| Response                    | `direct_post`: `vp_token` (one presentation or an array) + `presentation_submission` + `state`                        | `direct_post`: `vp_token` = `{ <query id>: [presentation] }` + `state` |
| KB-JWT `aud` / ldp `domain` | the client_id                                                                                                         | the full client_id, prefix included (Appendix B.3.6)                   |

Formats: `ldp_vc` (presented as `ldp_vp`, Ed25519Signature2020 or `eddsa-rdfc-2022`), `vc+sd-jwt`
and `dc+sd-jwt` (with a KB-JWT), and `mso_mdoc` (a DeviceResponse with DeviceSignature, see
[mso_mdoc](#mso_mdoc)).

Requests are emitted as `openid4vp://authorize?...`, the form Inji Wallet mobile recognises
(`inji-wallet/machines/bleShare/scan/scanGuards.ts:28`). The wallet also accepts `haip-vp://` and
`eudi-openid4vp://`.

## Verifier

```ts
import { ReferenceVerifier, registerVerifierRoutes, toVerificationResult } from '@inji-playground/oid4vp';

const verifier = new ReferenceVerifier({
  baseUrl: 'http://localhost:28100/ref/verifier', // what the wallet reaches
  documentLoader, // from createDocumentLoader() of @inji-playground/formats
  didResolver,
});
registerVerifierRoutes(fastify, verifier); // GET /ref/verifier/requests/:handle, POST /ref/verifier/response

const created = verifier.createRequest({
  profile: 'inji-draft',
  format: 'vc+sd-jwt',
  query: { type: 'https://playground.ps02.test/vct/farmer/v1', claims: ['given_name'] },
  clientIdScheme: 'did', // or 'redirect_uri'
  byReference: true,
});
// created.uri -> QR code; created.ref -> PresentationRequestRef for the orchestrator
const report = await verifier.awaitResult(created.handle);
// report.outcome: VALID | INVALID | EXPIRED | ERROR; report.checks, report.claims, report.errors
const result = toVerificationResult(report); // protocol package shape
```

- The signing key is an Ed25519 key; by default a fresh one with a did:key. Pass `signingKey`, `did`
  and `kid` for a stable identity (for example a did:web served by the playground).
- `verifierFetchHandler(verifier)` gives the same routes as a Fetch API handler (`Request` in,
  `Response` out). The tests use it as the wallet's `fetch`, so no port is opened.
- `registerVerifierRoutes` types the Fastify instance structurally (only `get` and `post`), so this
  package has no Fastify dependency. The host registers a form-body parser (`@fastify/formbody`).
- Same-device flow: `createRequest({ ..., redirectUri })` returns that `redirect_uri` in the
  `direct_post` response (OpenID4VP 1.0 section 8.2).

### What the verifier checks

| Check id                                 | `ldp_vp`                                                                                                                          | SD-JWT VC                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `state`                                  | known, not expired, and **single use**: consumed before verification starts, so a replay gets HTTP 400 and the first result stays | same                                                    |
| `presentation_submission` (`inji-draft`) | present (Inji Verify requires it too, `VPSubmissionController.java:47-52`), names the definition, answers every input descriptor  | same                                                    |
| `nonce`                                  | proof `challenge` = request nonce                                                                                                 | KB-JWT `nonce`                                          |
| `audience`                               | proof `domain` = client_id                                                                                                        | KB-JWT `aud` = client_id                                |
| `holder-binding`                         | proof made by the `holder`; each credential's `credentialSubject.id` = `holder`, compared literally                               | KB-JWT signed by the `cnf` key, `sd_hash`, `iat` window |
| `validity`                               | `expirationDate` / `validUntil` -> outcome `EXPIRED`                                                                              | `exp` -> `EXPIRED`, `nbf`                               |
| `signature`                              | every credential proof and the presentation proof                                                                                 | issuer signature, disclosures                           |
| `query`                                  | the credential satisfies the input descriptor (`inji-draft`) or the DCQL query (`final-1.0`)                                      | same                                                    |

For `mso_mdoc` the same check ids carry: `signature` (the `x5chain` ends at a trust anchor, the
issuerAuth signature, every element's MSO digest), `validity` (`validityInfo`, `EXPIRED` after
`validUntil`), `holder-binding` (DeviceSignature by the MSO deviceKey over the SessionTranscript the
verifier rebuilds), and `query` (the docType is the requested one: the input descriptor id in
`inji-draft`, `meta.doctype_value` in `final-1.0`). Nonce and client_id are inputs of the
SessionTranscript, so a presentation made for another request fails `holder-binding`: the device
signature cannot tell which input differed. `nonce` and `audience` pass only together with it.

**Issuer.** The `signature` check also covers who the issuer is. An SD-JWT whose key is a DID URL in
`kid` must name that DID in `iss` (or no `iss`); an `iss` that is another DID or an issuer URL is
`SDJWT_ISSUER_MISMATCH`, because anyone can make a did:key (RFC 9901 section 7.1 step 2c). For `ldp_vc` the
proof purpose already ties `issuer` to the controller of the signing key. For a DID key the issuer in the
report is that DID. For an `x5c` or configured key it is `iss` as written: a DID there is
`SDJWT_ISSUER_MISMATCH`, but an issuer URL is not checked against the certificate, so any key that chains to a
trust anchor can name any issuer URL. A verifier with a trust list (`trustedIssuers` option or
`addTrustedIssuers()`) also refuses a DID issuer outside it as `ISSUER_UNTRUSTED`, so a holder cannot present a
credential it signed itself. That check runs before the issuer's DID is resolved (the SD-JWT `kid`; an
`ldp_vc`'s `issuer` and proof verification methods), so an untrusted did:web causes no fetch. Issuers named
by `x5c` are trusted through the x5c trust anchors instead. Without a list every DID issuer is accepted. The playground server always sets one (see `PLAYGROUND_TRUSTED_ISSUERS`).

The format library stops at the first failure. The report marks that check `fail` and the checks it
never reached `skipped`, so a report never claims a check passed that did not run.

## Wallet presentation client

```ts
import { PresentationClient } from '@inji-playground/oid4vp';

const wallet = new PresentationClient({
  fetch: ctx.http.fetch, // the run's recording client
  holder: { keyPair, did, verificationMethod },
  documentLoader,
});
const { status, request, response } = await wallet.respond(qrText, heldCredentials, {
  beforeSubmit: (vpToken, { format }) => ctx.hooks.tamperPresentation?.(vpToken, format) ?? vpToken,
});
```

Step by step: `resolveRequest(uri)` -> `selectCredentials(request, credentials)` ->
`buildResponse(request, matches)` -> `submit(request, response, { beforeSubmit })`; `decline()` sends
an `error` response instead.

- **Request object signature.** For a DID client id the request must be signed; the `kid` must be a DID
  URL of that DID, and the signature must verify with the key its DID document lists. The `client_id`
  inside the request object must equal the one in the URI. A `redirect_uri` client id must be unsigned
  and its `response_uri` must equal the client id.
- **Matching.** Presentation Exchange through this package's own subset (`input_descriptors[].format`,
  `constraints.fields[].path` with a JSON Schema `filter`: `type`, `const`, `enum`, `pattern`,
  `minimum`, `maximum`, `contains`; `limit_disclosure`). `submission_requirements` are refused. DCQL
  through the `dcql` library.
- **Selective disclosure.** SD-JWT VC discloses only the claims the query names when the query names
  any (and `limit_disclosure` is `required` in PE); otherwise all disclosures.
- **Holder DID as bound.** An `ldp_vp` uses the DID in `credentialSubject.id` exactly as written, after
  checking that it resolves to the wallet's key. Inji Certify writes did:jwk with base64 padding
  (inji/inji-certify#1054); presenting the canonical form instead (`holderDidForm: 'canonical'`) is
  the scenario that probes that gap, and the reference verifier reports it as `holder-binding` fail.
- **No judgement of credentials.** The wallet presents expired or corrupted credentials as they are
  (it calls `createLdpVp` with `checkCredentials: false`), because the verifier under test is the
  one that has to reject them.
- **`beforeSubmit`** receives the `vp_token` form field as it would be posted (JSON-encoded) and
  returns what is posted instead. Tamper scenarios plug in here.

### Pre-registered verifiers and Inji Certify's holder binding

- `preRegisteredClients: [{ clientId, responseUris }]` lets the wallet answer a verifier whose client id
  has no scheme prefix (OpenID4VP 1.0 section 5.9.1), as Inji Verify 0.18 sends it, unsigned and by
  value; only to the registered response URIs. Unknown pre-registered clients are refused.
- A holder key of P-256 (ES256) signs the `ldp_vp` with `DataIntegrityProof` / `ecdsa-rdfc-2019`: Inji
  Certify accepts only ES256 and RS256 holder proofs, so its credentials are bound to such a key.
- When `credentialSubject.id` is a key id (`did:jwk:...#0`, as Inji Certify writes it, gap G13), the
  wallet presents the DID as `holder` and that key id as the proof's `verificationMethod`.

## mso_mdoc

|                   | `inji-draft` (ISO/IEC TS 18013-7 Annex B)                                                                                                                                                        | `final-1.0` (OpenID4VP 1.0 Appendix B.2)                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query             | input descriptor `id` = docType, `format: {mso_mdoc: {alg: [ES256]}}`, `limit_disclosure: required`, one field per element: `path: ["$['<namespace>']['<element>']"]`, `intent_to_retain: false` | `format: mso_mdoc`, `meta.doctype_value`, `claims: [{path: [namespace, element], intent_to_retain: false}]`                                                   |
| Client metadata   | `vp_formats.mso_mdoc.alg: [ES256]`                                                                                                                                                               | `vp_formats_supported.mso_mdoc: {issuerauth_alg_values: [-7], deviceauth_alg_values: [-7]}`                                                                   |
| SessionTranscript | `[null, null, [SHA-256(cbor([client_id, mdocGeneratedNonce])), SHA-256(cbor([response_uri, mdocGeneratedNonce])), nonce]]` (Annex B.4.4)                                                         | `[null, null, ["OpenID4VPHandover", SHA-256(cbor([client_id, nonce, null, response_uri]))]]` (Appendix B.2.6.1; `null` because the response is not encrypted) |
| Response          | `vp_token` = base64url DeviceResponse (JSON string), descriptor map `{format: mso_mdoc, path: $}`, plus `mdoc_generated_nonce`                                                                   | `vp_token` = `{<query id>: [base64url DeviceResponse]}`                                                                                                       |

- **`mdoc_generated_nonce`.** Annex B.4.3 carries the wallet's mdoc generated nonce in the JWE `apu`
  header of an encrypted `direct_post.jwt` response. The reference roles post unencrypted
  `direct_post`, so the wallet sends a fresh random nonce (16 bytes, base64url) in the form parameter
  `mdoc_generated_nonce` (`MDOC_GENERATED_NONCE_PARAMETER`) next to `vp_token`, and the verifier reads
  it from there. A response without it fails the `format` check. This parameter is the playground's
  choice, not a standard one; a verifier that expects Annex B over `direct_post.jwt` will not find it.
- `client_id` in both transcripts is the value the request carried, prefix included in `final-1.0`.
- **Claims** in `QuerySpec.claims` are written `<namespace>/<element>` for `mso_mdoc` (namespaces contain
  dots); the verifier needs `query.type` (the docType) to build a Presentation Exchange request.
- **Selective disclosure.** The wallet presents only the requested elements; without any requested, all.
- **Trust.** The verifier verifies the document signer chain against `x5cTrustAnchors` (and those added
  with `addX5cTrustAnchors()`), the same list it uses for SD-JWT `x5c`; an untrusted chain is
  `X5C_UNTRUSTED`. The holder key must be P-256 (ES256): the wallet refuses another key.

## Errors

Protocol failures throw `Oid4vpError` with a stable `code` (`OID4VP_ERROR_CODES`), an OAuth `error`
value for HTTP responses (`oauthError`), `spec` and `details`. Credential failures inside a response
are not thrown: they become the report's `checks` and `errors` (with the format library's codes, such
as `KB_JWT_NONCE_MISMATCH` or `LDP_EXPIRED`).

## Tests

`npm test -w @inji-playground/oid4vp` runs 105 tests in 6 files (measured 2026-10-06: all pass, Node
24.19.0). Global `fetch` is replaced by a function that
fails the test if called: every exchange goes through the verifier's Fetch API handler in-process.

| File                       | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/inji-draft.test.ts`  | For `ldp_vc` and `vc+sd-jwt`: DID client id with an EdDSA request object by reference -> VALID; `redirect_uri` by value -> VALID; expired -> EXPIRED; flipped issuer signature -> INVALID; replayed response -> HTTP 400 and the first result kept. Missing `presentation_submission`, unknown state, KB-JWT with wrong nonce or aud, missing KB-JWT, ldp_vp with another request's challenge, limit_disclosure, a credential of the wrong type |
| `test/final-1.0.test.ts`   | For `ldp_vc` and `vc+sd-jwt` with `decentralized_identifier:` and `redirect_uri:` client ids: DCQL -> VALID with `vp_token` keyed by query id and the prefixed client id as KB `aud` / ldp `domain`; expired, flipped signature, replay. KB `aud` without the prefix, wrong nonce, unknown query id, unsatisfiable query, selective disclosure, same-device `redirect_uri`                                                                      |
| `test/wallet.test.ts`      | The wallet refuses a request object with a bad signature, a changed payload, a key of another DID, a wrong `typ`; a DID client id sent unsigned; a `redirect_uri` client id with another `response_uri`. Signed request by value, the `haip-vp` and `eudi-openid4vp` schemes, expired requests. Padded did:jwk presented as bound -> VALID, canonical -> INVALID, a credential bound to someone else is refused                                 |
| `test/query.test.ts`       | Client id formatting and parsing for both profiles, PE filter keywords, `presentation_submission` rules, SD-JWT claim reconstruction, the routes on a Fastify-shaped host                                                                                                                                                                                                                                                                       |
| `test/mdoc.test.ts`        | `mso_mdoc` in both profiles and both client id schemes -> VALID with only the requested elements; the PE and DCQL request shapes; `mdoc_generated_nonce` missing or changed; expired -> EXPIRED; flipped issuer signature, untrusted issuer, altered and added elements, another docType -> INVALID with the failing check; Inji Certify's credential encoding                                                                                  |
| `test/request-uri.test.ts` | `openid4vp://` parsing; `dcql` and `jsonpath-plus` load as ESM                                                                                                                                                                                                                                                                                                                                                                                  |

Not covered yet: `direct_post.jwt` (encrypted responses), `x509_san_dns` / `x509_hash` client ids,
`request_uri_method=post`, `presentation_definition_uri` against a live verifier, and runs against
Inji Verify and Inji Wallet (the Inji adapters exercise this package against the live stack).

## Specifications

OpenID4VP 1.0 (Final, 2025-07-09) and drafts 21 and 23; RFC 9101 (JAR); DIF Presentation Exchange 2.0;
RFC 9901 (SD-JWT) and SD-JWT VC draft 19; W3C VC Data Model 1.1 and 2.0, VC Data Integrity 1.0;
did:key, did:jwk and did:web method specifications; ISO/IEC 18013-5:2021 and ISO/IEC TS 18013-7 Annex B
(mdoc).
