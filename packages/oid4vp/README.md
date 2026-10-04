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
and `dc+sd-jwt` (with a KB-JWT). `mso_mdoc` is not supported (stretch goal).

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

## Errors

Protocol failures throw `Oid4vpError` with a stable `code` (`OID4VP_ERROR_CODES`), an OAuth `error`
value for HTTP responses (`oauthError`), `spec` and `details`. Credential failures inside a response
are not thrown: they become the report's `checks` and `errors` (with the format library's codes, such
as `KB_JWT_NONCE_MISMATCH` or `LDP_EXPIRED`).

## Tests

`npm test -w @inji-playground/oid4vp` runs 77 tests in 5 files (measured 2026-10-04: all pass, about
24 s wall time including Vitest start-up, Node 24.19.0). Global `fetch` is replaced by a function that
fails the test if called: every exchange goes through the verifier's Fetch API handler in-process.

| File                       | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/inji-draft.test.ts`  | For `ldp_vc` and `vc+sd-jwt`: DID client id with an EdDSA request object by reference -> VALID; `redirect_uri` by value -> VALID; expired -> EXPIRED; flipped issuer signature -> INVALID; replayed response -> HTTP 400 and the first result kept. Missing `presentation_submission`, unknown state, KB-JWT with wrong nonce or aud, missing KB-JWT, ldp_vp with another request's challenge, limit_disclosure, a credential of the wrong type |
| `test/final-1.0.test.ts`   | For `ldp_vc` and `vc+sd-jwt` with `decentralized_identifier:` and `redirect_uri:` client ids: DCQL -> VALID with `vp_token` keyed by query id and the prefixed client id as KB `aud` / ldp `domain`; expired, flipped signature, replay. KB `aud` without the prefix, wrong nonce, unknown query id, unsatisfiable query, selective disclosure, same-device `redirect_uri`                                                                      |
| `test/wallet.test.ts`      | The wallet refuses a request object with a bad signature, a changed payload, a key of another DID, a wrong `typ`; a DID client id sent unsigned; a `redirect_uri` client id with another `response_uri`. Signed request by value, the `haip-vp` and `eudi-openid4vp` schemes, expired requests. Padded did:jwk presented as bound -> VALID, canonical -> INVALID, a credential bound to someone else is refused                                 |
| `test/query.test.ts`       | Client id formatting and parsing for both profiles, PE filter keywords, `presentation_submission` rules, SD-JWT claim reconstruction, the routes on a Fastify-shaped host                                                                                                                                                                                                                                                                       |
| `test/request-uri.test.ts` | `openid4vp://` parsing; `dcql` and `jsonpath-plus` load as ESM                                                                                                                                                                                                                                                                                                                                                                                  |

Not covered yet: `direct_post.jwt` (encrypted responses), `x509_san_dns` / `x509_hash` client ids,
`request_uri_method=post`, `presentation_definition_uri` against a live verifier, and runs against
Inji Verify and Inji Wallet (the Inji adapters exercise this package against the live stack).

## Specifications

OpenID4VP 1.0 (Final, 2025-07-09) and drafts 21 and 23; RFC 9101 (JAR); DIF Presentation Exchange 2.0;
RFC 9901 (SD-JWT) and SD-JWT VC draft 19; W3C VC Data Model 1.1 and 2.0, VC Data Integrity 1.0;
did:key, did:jwk and did:web method specifications.
