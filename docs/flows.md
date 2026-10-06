# Flows

The issue → hold → present → verify flows the playground runs, message by message. Every message below is
recorded in the run and can be opened in the protocol inspector; the step names (`issuer.offer`, `token`,
...) are the ones the timeline and the reports use. Protocol detail per profile is in the
[oid4vci](../packages/oid4vci/README.md) and [oid4vp](../packages/oid4vp/README.md) guides.

## Issuance

### Credential offer with a pre-authorized code

Used by Inji Certify (`inji-certify`, pre-authorized profile), the reference issuer and phone wallets.

| Step              | Message                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer.offer`    | Inji Certify: `POST /v1/certify/pre-authorized-data` with the farmer claims; the issuer answers an `openid-credential-offer://` link     |
| `issuer.metadata` | Wallet: `GET /.well-known/openid-credential-issuer` (draft 13 and 1.0 both live under the issuer's base URL)                             |
| `as.metadata`     | Wallet: `GET /.well-known/oauth-authorization-server` of the authorization server the metadata names (RFC 8414)                          |
| `token`           | Wallet: `POST /token` with `grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code` (and `tx_code` when the offer asks for one) |
| `credential`      | Wallet: `POST /credential` with a `jwt` key proof bound to the holder key (`did:jwk`, ES256 for Inji Certify)                            |

Draft 13 returns the first `c_nonce` in the token response; OpenID4VCI 1.0 uses `POST /nonce`. The two
profiles are the two OpenID4VCI choices in the UI; Inji Certify 0.14.0 speaks draft 13.

### Wallet-initiated, authorization code

Used when the wallet cannot take an offer (Inji Web through Mimoto, gap G5): the orchestrator asks the
issuer for a wallet-initiated start instead, which names only the issuer URL and the configuration.

| Step              | Message                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `issuer.metadata` | Wallet reads the issuer metadata and finds the authorization server and the configuration's `scope`               |
| `as.metadata`     | Wallet reads the authorization server metadata                                                                    |
| `token`           | Authorization request with PKCE S256, approved by the test authorization server; then `POST /token` with the code |
| `credential`      | `POST /credential` with the access token and a key proof                                                          |

The playground's test authorization server (`/ref/as`) stands in for eSignet: it logs in a fixed test
identity without a login page ([test data](test-data.md#identities)) and signs JWT access tokens that the
reference issuer and certify-ac accept.

## Presentation

Two OpenID4VP profiles, chosen per run:

| Topic     | `inji-draft` (drafts 21-23, as Inji Verify 0.18 and Inji Wallet speak them)            | `final-1.0` (OpenID4VP 1.0)                             |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Query     | Presentation Exchange 2.0 `presentation_definition`                                    | DCQL `dcql_query`                                       |
| Client id | Pre-registered (Inji Verify), bare DID with a signed request object, or `redirect_uri` | `decentralized_identifier:` or `redirect_uri:` prefixes |
| Response  | `direct_post` with `vp_token`, `presentation_submission` and `state`                   | `direct_post` with `vp_token` keyed by query id         |

| Step                   | Message                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `verifier.request`     | Inji Verify: `POST /v1/verify/vp-request` (API) or `/vp-session-request` (web component); reference verifier: a request object |
| `wallet.fetch-request` | Wallet resolves the `openid4vp://authorize?...` request (by value, or fetches `request_uri`)                                   |
| `wallet.submit`        | Wallet: `POST <response_uri>` with the presentation (`ldp_vp` with a holder proof, or SD-JWT VC + KB-JWT)                      |
| `verifier.result`      | Inji Verify: status long poll, then `POST /v1/verify/v2/vp-results/{transactionId}`; reference verifier: its stored result     |

Inji Verify's results map to outcomes as follows: every check valid gives `VALID`; a genuine signature
with a failed expiry check gives `EXPIRED`; anything else gives `INVALID`, with the failing checks named
in the report.

### Scenarios

A scenario changes one thing on the way and states what a conformant verifier must answer: the happy path
(`VALID`), an expired or not-yet-valid credential, a flipped issuer signature, an altered or unreferenced
disclosure, a key binding JWT with the wrong nonce or audience, a replayed presentation, a presentation by
someone other than the holder, a credential of the wrong type, plus probes for DID methods, W3C VC 2.0 and
the `dc+sd-jwt` format name. The full catalogue with the specification clause behind each expected outcome:
[scenarios](../packages/scenarios/README.md).

## Inji Web through Mimoto

Inji Web is a browser wallet whose backend, Mimoto, holds the credentials. The `inji-web` role drives
Mimoto's HTTP API the way Inji Web's pages do, so no browser is needed:

1. Receive (guest mode): Mimoto's issuer list gives the issuer entry; the role builds Inji Web's
   authorization request (client `ps02-mimoto`, redirect `http://localhost:28004/redirect`, PKCE), lets the
   test authorization server approve it, and posts the code to `POST /v1/mimoto/credentials/download`.
   Mimoto exchanges the code at `/ref/as/token` (a `private_key_jwt` client) and requests the credential;
   both calls are recorded, and the credential is read from Mimoto's recorded credential response (Mimoto
   answers the browser with a PDF).
2. Sign in: Mimoto's Google provider points at the test authorization server, so the role signs in with
   `POST /v1/mimoto/auth/google/token-login` and a test ID token, then creates and unlocks a wallet.
3. Store: the credential is downloaded again into the wallet (`POST /wallets/{id}/credentials`).
4. Present: `POST /wallets/{id}/presentations` with the verifier's request, the list of matching
   credentials, and `PATCH` with the selection; Mimoto signs and posts the presentation.

Issuers for Inji Web: certify-ac (Inji Certify in authorization code mode, through
`https://ref.ps02.test/proxy/certify-ac`) and the reference issuer. The run needs the server on 28100 with
`PLAYGROUND_PUBLIC_URL=https://ref.ps02.test` ([set-up](setup.md#troubleshooting)).

Measured on 2026-10-05: downloads from certify-ac and the reference issuer complete with Mimoto's token
and credential requests recorded; presentations reach Inji Verify, which answers `INVALID` for `ldp_vc`
(gap G22); Mimoto offers nothing for an SD-JWT VC request (G25) and refuses requests whose filters lack a
`pattern` (G23). The live matrix: [docs/interop-report/live/matrix.md](interop-report/live/matrix.md).

## Phone wallets

The `mobile-wallet` role stands for a person with Inji Wallet (or another wallet app) on a phone. The run
shows the credential offer and then the presentation request as QR codes; the run continues when the
recorded traffic shows the phone acted, or when the person presses "Done". A phone must reach the server:
set `PLAYGROUND_PUBLIC_URL` to a LAN or tunnel address and `PLAYGROUND_HOST=0.0.0.0`.

Same-device flows: the phone modal has an "Open on this device" link with the same `openid4vp://` (or
`openid-credential-offer://`) URI, for a wallet app on the phone that shows the playground; the Inji Verify web
component's panel has a "Same device" switch (on by default on touch screens) that turns on the SDK's own deep
link to a wallet app.

## Digital Credentials API

The W3C Digital Credentials API lets a web page ask the browser for a credential:
`navigator.credentials.get({ digital: { requests: [{ protocol, data }] } })`. OpenID4VP 1.0 Appendix A defines
the protocol `openid4vp-v1-unsigned` for it, which the pair `ref-verifier-dc-api` and `browser-wallet` use
(OpenID4VP 1.0 profile only):

1. The verifier creates an unsigned request: DCQL, `response_mode` `dc_api`, a nonce, and no `client_id`,
   `state` or `response_uri` (`/ref/verifier/dc-api/requests/{handle}`).
2. The run page reads it and passes it to `navigator.credentials.get()`; the browser lets a wallet on the device
   answer. The wallet takes the verifier's identity from the browser: its client id is `origin:<page origin>`,
   which becomes the KB-JWT `aud` or the `ldp_vp` `domain`.
3. The page posts the answer (`{protocol, data: {vp_token}}`) to `/ref/verifier/dc-api/responses/{handle}`.
   The verifier accepts it only from one of its own pages (the `Origin` header: this server, the Vite dev and
   preview servers) and only when the presentation is bound to that origin.

A browser without the API (Chrome and Edge 141 or later have it, on `localhost` or `https`), or without a wallet
holding the run's credential, can let the playground's reference wallet answer the same request
(`POST /api/runs/{id}/dc-api/provider`); the page still posts the answer itself, so transport and origin
binding are unchanged. `ref-wallet` with `ref-verifier-dc-api` does all three steps in-process, which is how
the reference matrix runs the cell. Tests: `packages/oid4vp/test/dc-api.test.ts` (request, answer, origin
binding, replay), `packages/server/test/dc-api.test.ts` (both wallets, a page of another origin), and two browser
tests in `packages/web/e2e/playground.spec.ts`, one of them through `navigator.credentials.get()` with a
stand-in browser wallet.
