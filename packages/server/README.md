# @inji-playground/server

The playground server (Fastify): REST and WebSocket API, run orchestrator, recording HTTP client,
SQLite store (Node's built-in `node:sqlite`) and the registry of roles (issuers, wallets, verifiers).

Status (2026-10-04): the reference issuer, wallet and verifier are hosted on the server's own port and
registered as roles, with the phone wallet (`mobile-wallet`); every HTTP exchange of a run is recorded
once, at one of three capture points. Reference runs pass end to end for `ldp_vc`, `vc+sd-jwt` and
`dc+sd-jwt` in both OpenID4VP profiles, and every tamper and probe scenario of
`@inji-playground/scenarios` that the reference roles can produce gives its expected outcome through
the server (`test/reference-scenarios.test.ts`). Since 2026-10-05 the Inji adapters
(`src/adapters/inji/`) put Inji Certify and Inji Verify into runs when the stack is up: see
[Inji roles](#inji-roles).

## Run it

```bash
npm run build && npm start            # http://localhost:28100, UI + API + WebSocket
npm run dev -w @inji-playground/server # from source, reloads on change
npm test -w @inji-playground/server    # unit and API tests (in-memory database)
npm run smoke                          # one reference run end to end, from the repository root
```

`npm run smoke` (`scripts/smoke-run.ts`) builds the server for the first free port in 28600-28699,
listens, runs one cell and prints the recorded exchanges and `verdict=<verdict>`; it exits 0 only for
`pass`. Flags: `--issuer`, `--wallet`, `--verifier` (default the reference roles), `--format` (default
`vc+sd-jwt`), `--vci-profile`, `--vp-profile` (draft13 pairs with inji-draft, v1 with final-1.0),
`--scenario` (default `happy`; `vp-replay` runs a happy run first so there is something to replay),
`--export <file>` (the run's redacted export), `--json`. Its database is in memory unless `PLAYGROUND_DB`
is set.

Measured 2026-10-04 on a Windows 11 laptop with Node 24.11:
`npm run smoke -- --issuer ref-issuer --wallet ref-wallet --verifier ref-verifier --format vc+sd-jwt`
printed 7 recorded exchanges (`issuer.offer`, `issuer.metadata`, `as.metadata`, `token`, `credential`,
`wallet.fetch-request`, `wallet.submit`, all captured inbound) and `verdict=pass`, exit code 0.

Measured 2026-10-04 on the development laptop: `npm run build && npm start`, then
`curl -s http://localhost:28100/api/openapi.json` listed `/api/runs`, `/api/roles`,
`/api/stack/status` and `/api/runs/{id}/verifier-callback`; with `PLAYGROUND_FAKE_ROLES=1` a
`POST /api/runs` (fake issuer, wallet and verifier, `vc+sd-jwt`) finished with verdict `pass` and was
returned by `GET /api/runs?format=vc%2Bsd-jwt&verdict=pass`.

## Configuration

Environment variables, parsed with zod at start-up (`src/config/index.ts`). An invalid value stops the
server with a message naming the variable.

| Variable                                                                        | Default                                    | Meaning                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `PLAYGROUND_PORT`                                                               | `28100`                                    | Port of UI, API and WebSocket                                                                         |
| `PLAYGROUND_HOST`                                                               | `127.0.0.1`                                | Interface to listen on (`0.0.0.0` in the image)                                                       |
| `PLAYGROUND_RUN_DIR`                                                            | `<repo>/run`                               | Database, generated keys and certificates                                                             |
| `PLAYGROUND_DB`                                                                 | `<run dir>/playground.db`                  | SQLite file; `:memory:` keeps nothing (tests)                                                         |
| `PLAYGROUND_GAPS_FILE`                                                          | `<repo>/docs/gaps/gaps.json`               | Gap register served by `/api/gaps`; a missing file means no gaps                                      |
| `PLAYGROUND_WEB_DIST`                                                           | `<repo>/packages/web/dist`                 | Built UI to serve                                                                                     |
| `PLAYGROUND_STACK`                                                              | `off`                                      | `off`, `host` or `bundle`: where the Inji stack runs                                                  |
| `PLAYGROUND_PUBLIC_URL`                                                         | (none)                                     | URL phones and containers use to reach the server                                                     |
| `PLAYGROUND_LOG_LEVEL`                                                          | `info`                                     | Log level                                                                                             |
| `PLAYGROUND_TIMEOUT_REFERENCE_MS`                                               | `15000`                                    | Step timeout when only playground reference roles take part                                           |
| `PLAYGROUND_TIMEOUT_INJI_MS`                                                    | `90000`                                    | Step timeout when an Inji module or other outside role takes part                                     |
| `PLAYGROUND_TIMEOUT_PERSON_MS`                                                  | `600000`                                   | Step timeout while a person must act (scan a QR code)                                                 |
| `PLAYGROUND_FAKE_ROLES`                                                         | `0`                                        | `1` registers the development-only "Test role (fake)" roles                                           |
| `PLAYGROUND_REF_ISSUER_DID`                                                     | `did:key`                                  | DID method of the reference issuer at `/ref/issuer`: `did:key`, `did:jwk`, `did:web`                  |
| `PLAYGROUND_PROXY_TIMEOUT_MS`                                                   | `110000`                                   | How long the reverse proxy waits for an Inji service                                                  |
| `INJI_VERIFY_SUBMISSION_BASE_URL`                                               | `https://verify.ps02.test/v1/verify`       | `response_uri` base Inji Verify gives wallets; the reference wallet accepts responses there           |
| `INJI_CERTIFY_URL`, `INJI_CERTIFY_AC_URL`, `INJI_VERIFY_URL`, `INJI_MIMOTO_URL` | host ports, or service names in the bundle | Upstreams of `/proxy/:target/*` and `/v1/verify/*` (`src/recording/targets.ts`)                       |
| `INJI_CERTIFY_AC_ISSUER`                                                        | `https://ref.ps02.test/proxy/certify-ac`   | certify-ac's credential issuer id; the test authorization server gives its scopes this audience       |
| `INJI_WEB_URL`                                                                  | `http://localhost:28004`                   | Inji Web's address; `<url>/redirect` is Mimoto's redirect URI at the test authorization server        |
| `PLAYGROUND_NETWORK_MAP`                                                        | (none)                                     | Host mode: maps the stack's container names to host ports (`deploy/inji-stack/network-map.host.json`) |
| `PLAYGROUND_EXTRA_CA`                                                           | (none)                                     | PEM file trusted for outbound HTTPS, for example `$PLAYGROUND_RUN_DIR/stack/ca/ps02-test-ca.crt`      |

Why 110 s for the proxy: the Inji Verify SDK's status poll holds a request open for up to 55 s, and the
server's own request timeout is 120 s.

Why 90 s for Inji: Certify's first issuer-metadata call took 52 s and one Inji Verify ldp_vc
verification took up to 13 s in the local trial (2026-10-04).

## How a run works

```
POST /api/runs ──► Orchestrator.create ──► store: runs row (queued)
                        │
                        ├─ compatibility check ── blocked? ──► report verdict "not-supported", done
                        ├─ live run (an Inji module takes part)? wait for the stack lock (one at a time)
                        ▼
   issue    IssuerRole.startIssuance      step issuer.offer
   hold     WalletRole.receiveCredential  step issuer.metadata → token → credential (role moves on)
   present  VerifierRole.createRequest    step verifier.request
            WalletRole.present            step wallet.fetch-request → wallet.submit
   verify   VerifierRole.awaitResult      step verifier.result
                        │
                        ▼
   outcome + expected outcome of the scenario ──► verdict ──► report stored, run.finished emitted
```

- Every event (`run.started`, `step.started`, `exchange`, `artifact`, `person.action-needed`,
  `step.finished`, `run.finished`) is first written to `run_events`, then published on the event bus
  that feeds `/ws`. A page opened mid-run therefore reads the stored events and misses nothing.
- Each role call gets a `RunContext` (`packages/protocol/src/roles-api.ts`): a recording `fetch`, an
  `AbortSignal`, `enterStep`, `waitForPerson`, `waitForCallback`, the scenario and its hooks.
- Step timeout: the longest timeout of the roles involved in the call (a wallet receiving from Inji
  Certify waits as long as Certify needs). It starts again whenever the role enters its next step and
  is paused while the run waits for a person. On timeout the role's signal is aborted and the run
  stops.
- Scenario hooks (`ScenarioHooks`): `beforeIssuance`, `afterCredential`, `beforeRequest` run between
  phases; wallets call `tamperPresentation` just before sending. A hook that throws stops the run with
  the code `scenario.hook-failed`. `buildApp` uses the hooks of `@inji-playground/scenarios`
  (`scenarioHooks`) unless it is given another catalogue or its own `hooksFor`.
- Scenario variants the hooks cannot express are carried out by the reference roles, which look the
  scenario up by id (`findScenarioDefinition`). `ref-issuer` signs with the scenario's validity window,
  type, `vct` or DID method. `ref-wallet` presents with the scenario's holder DID form, presents a
  credential the request did not ask for (`wrong-type`), and applies the presentation tamper just before
  the post. For `vp-replay` the wallet sends again the untampered `vp_token` it last posted to the same
  verifier in the same format and profile. If there is none, the run stops before posting with
  `wallet.no-earlier-presentation` (verdict `error`); run the happy path first.
- The compatibility check also reads the scenario. A format, OpenID4VP profile or role that it does not
  list in `formats`, `vpProfiles` or `requires` (issuer variants need `ref-issuer`, wallet tampering
  needs `ref-wallet`) makes the cell `not-supported` with the code `scenario.<kind>-unsupported`.
- Live runs (any Inji module) run one at a time per Inji stack; runs made only of reference roles run
  in parallel.

### Verdict rules

| What happened                                                                            | Outcome    | Verdict                                                          |
| ---------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Verifier answered                                                                        | its answer | `pass` if it equals the scenario's expected outcome, else `fail` |
| A role rejected a protocol message (`RoleError`, category `interop`, or any other error) | `ERROR`    | `fail`, unless the scenario expects `ERROR`                      |
| Step timeout, cancel, unreachable service, person never acted                            | `NOT_RUN`  | `error`                                                          |
| Compatibility check blocked the combination                                              | `NOT_RUN`  | `not-supported`                                                  |

The report's `error` names the step, a code (for example `timeout`, `run.cancelled`,
`role.invalid-output`, `outcome.unexpected`, or the role's own code) and a message.

## API

The OpenAPI 3.1 document is generated from the zod route schemas: `GET /api/openapi.json`, and a
browsable version at `/api/docs`; `npm run openapi` writes it to `docs/api/openapi.json`. Request and
response schemas live in `packages/protocol/src/api.ts` and `insights.ts`. Reports, the matrix, metrics
and gaps are described in [docs/api/README.md](../../docs/api/README.md).

| Route                                                      | Purpose                                                                                                                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                          | Liveness                                                                                                                                                                                       |
| `GET /api/stack/status`                                    | Inji stack containers (`stackStatus()` in `src/adapters/inji/index.ts`) plus every role's health                                                                                               |
| `GET /api/roles?kind=`                                     | Registered roles with descriptor and health                                                                                                                                                    |
| `GET /api/compatibility?issuer&wallet&verifier&format&...` | Can this combination run, and why not                                                                                                                                                          |
| `GET /api/scenarios`                                       | Happy path and tamper variants                                                                                                                                                                 |
| `POST /api/runs`                                           | Start a run; `{"replayOf": "<run id>"}` repeats a stored configuration (other fields override it)                                                                                              |
| `GET /api/runs`                                            | History; filters `issuer`, `wallet`, `verifier`, `version`, `format`, `scenario`, `outcome`, `verdict`, `status`, `mode`, `from`, `to`; `order` (`newest`, `oldest`); paging `limit`, `offset` |
| `GET /api/runs/{id}`                                       | Configuration, status, report, and the pending person action if any                                                                                                                            |
| `GET /api/runs/{id}/events?after=`                         | Stored events in order                                                                                                                                                                         |
| `GET /api/runs/{id}/exchanges`                             | Recorded HTTP requests and responses, with headers and bodies                                                                                                                                  |
| `POST /api/runs/{id}/cancel`                               | Stop a run; verdict `error`, code `run.cancelled`                                                                                                                                              |
| `POST /api/runs/{id}/person-done`                          | The person finished the shown action (manual fallback)                                                                                                                                         |
| `POST /api/runs/{id}/verifier-callback`                    | Signal from a verifier running in the browser (Inji Verify SDK `onVPReceived`, `onVPProcessed`, `onError`)                                                                                     |
| `GET /api/runs/{id}/report.json`, `/report.md`             | Interoperability report of a finished run (task 7 fields, versions, step timings, failing exchange)                                                                                            |
| `GET /api/runs/{id}/export`                                | Run, events, exchanges and artefacts with tokens and codes redacted                                                                                                                            |
| `GET /api/matrix?format=json\|md`                          | Newest run per cell, plus combinations that are untested or not supported (with reasons)                                                                                                       |
| `GET /api/metrics`, `GET /metrics`                         | Success rate and p50/p95 per step, role pair and flow; credential sizes; Prometheus text format                                                                                                |
| `GET /api/gaps`                                            | Interoperability gap register (`docs/gaps/gaps.json`)                                                                                                                                          |
| `GET /ws`                                                  | WebSocket stream of run events                                                                                                                                                                 |

Errors use one body: `{"error": "<code>", "message": "<text>"}` with status 400, 404 or 409.

WebSocket: connect to `/ws?runId=<id>` (or `*` for every run), or send
`{"type":"subscribe","runId":"<id>"}` after connecting. A subscription to one run first replays the
stored events, then streams new ones; the server acknowledges with `{"type":"subscribed",...}`.

## Roles registered by the server

| Id              | Kind     | What it is                                                                                     |
| --------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `ref-issuer`    | issuer   | OpenID4VCI reference issuer at `/ref/issuer` (`@inji-playground/oid4vci`), offers by reference |
| `ref-wallet`    | wallet   | Headless wallet: the OpenID4VCI and OpenID4VP clients of `oid4vci` and `oid4vp`                |
| `ref-verifier`  | verifier | OpenID4VP reference verifier at `/ref/verifier` (`@inji-playground/oid4vp`)                    |
| `mobile-wallet` | wallet   | A wallet app on a phone, driven by a person through QR codes (`src/adapters/manual/`)          |

`buildApp({ builtInRoles: false })` leaves them out, for tests that check exactly the roles they pass;
the reference roles are still hosted. `mobile-wallet` shows the offer and then the presentation request
as `person.action-needed`. It completes when recorded traffic shows the phone acted (a successful
credential response after the offer, a posted presentation), or when the person presses "done"
(`POST /api/runs/{id}/person-done`) for traffic that does not pass through the playground. A phone must
reach the server: set `PLAYGROUND_PUBLIC_URL` to a LAN or tunnel address and `PLAYGROUND_HOST=0.0.0.0`.

## Inji roles

Registered only when `PLAYGROUND_STACK` is `host` or `bundle` (`src/adapters/inji/`):

| Id                | Kind     | What it does                                                                                                                                                            |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inji-certify`    | issuer   | Inji Certify 0.14.0: `POST /v1/certify/pre-authorized-data` with the farmer claims the configuration advertises, returns the offer (`FarmerCredential`, `FarmerSdJwt`)  |
| `inji-verify`     | verifier | Inji Verify 0.18.2 API: `POST /vp-request`, the wallet request built as Inji's front ends build it, status long poll, `POST /v2/vp-results/{transactionId}`             |
| `inji-verify-sdk` | verifier | The official web component in the page creates the request through `/v1/verify`; the role rebuilds it from the recorded answer and fetches the result on `onVPReceived` |
| `inji-certify-ac` | issuer   | certify-ac, Inji Certify 0.14.0 in authorization code mode: wallet-initiated issuance (no offer); the wallet starts at its issuer metadata through `/proxy/certify-ac`  |
| `inji-web`        | wallet   | Inji Web through Mimoto 0.22.0: guest download, then sign-in with a test ID token, a wallet (create, unlock), store, and the presentation through Mimoto's API          |

- Results: every check valid -> `VALID`; a genuine signature with a failed expiry check -> `EXPIRED`;
  anything else, including an HTTP 5xx from verify-service, -> `INVALID` with the failing checks named.
- Inji Verify sends an unprefixed client id, which makes it a pre-registered client (OpenID4VP 1.0
  section 5.9.1). The reference wallet knows the playground's client ids (`ps02-playground`,
  `ps02-playground-sdk`) with the response URIs of `INJI_VERIFY_SUBMISSION_BASE_URL`.
- Certify's SD-JWT VC names its key by an `x5c` leaf; the Certify role fetches Certify's certificates
  once (set-up traffic, not recorded) and adds them to the reference verifier's trust anchors.
- Host mode: the server reaches `certify-nginx` and `verify-service:8080` through
  `deploy/inji-stack/network-map.host.json` (the default when `PLAYGROUND_STACK=host`) and trusts the
  stack's test CA (`$PLAYGROUND_RUN_DIR/stack/ca/ps02-test-ca.crt`) when it exists. The server must run on
  28100, where the stack's TLS front sends `ref.ps02.test` and `playground.ps02.test` (the JSON-LD context
  of the reference credentials, served at `/contexts/v1.jsonld`).
- Live mode lets the JSON-LD loader fetch contexts that are not pinned (cached in
  `$PLAYGROUND_RUN_DIR/contexts`): Certify's farmer credential uses a context on a personal GitHub Pages
  site (gap G18).
- Outbound calls to the stack are drawn as `inji-certify` and `inji-verify` on the sequence diagram
  (`serviceLabels` in `src/recording/targets.ts`).

### Inji Web and certify-ac

`inji-web` drives Mimoto's HTTP API the way Inji Web's pages do, without a browser:

1. Receive: Mimoto's issuer list names the run's issuer by `credential_issuer_host`; the role builds Inji
   Web's authorization request (PKCE S256, client `ps02-mimoto`, redirect `<INJI_WEB_URL>/redirect`), lets
   the test authorization server approve it, and posts the code to `POST /v1/mimoto/credentials/download`
   (guest mode, which answers a PDF). Mimoto's token and credential requests pass `/ref/*` and
   `/proxy/certify-ac`, where the role claims them for the run; the credential is read from that recording.
2. Present: `POST /auth/google/token-login` with an ID token from the test authorization server (Mimoto's
   Google provider points there), a wallet created and unlocked with a test PIN, the credential stored again
   with a new code (`POST /wallets/{id}/credentials`), then `POST /wallets/{id}/presentations` with the
   verifier's request, the matching-credentials list, and `PATCH` with the selection.

Both need the server on 28100 with `PLAYGROUND_PUBLIC_URL=https://ref.ps02.test`: certify-ac accepts only
tokens issued by `https://ref.ps02.test/ref/as`. With a stack, the test authorization server registers
certify-ac's scopes (`mock_identity_vc_ldp`, `farmer_sd_jwt`) with certify-ac's credential endpoint as
audience, and Mimoto as a `private_key_jwt` client with the certificate in
`$PLAYGROUND_RUN_DIR/stack/mimoto/oidc-client.crt`. The reference issuer answers Inji Web through the
wallet-initiated mode of `ref-issuer` (the orchestrator asks for it when the wallet cannot take an offer).
Presentation definitions sent to Inji Verify carry a `pattern` in every field filter, because Mimoto refuses
filters without one (G23); JSON Schema ignores `pattern` for arrays, so other wallets match as before.

Measured on 2026-10-05 (`npm run stack:up && npm run test:live`, 15 tests pass): Inji Certify -> reference
wallet -> Inji Verify is `VALID` for `vc+sd-jwt`; for `ldp_vc` it is `INVALID` because Inji Verify rejects
the `ecdsa-rdfc-2019` holder proof a P-256 holder makes (G15) and Certify accepts only ES256 and RS256
holder keys (G9). Certify -> reference verifier is `VALID` for `vc+sd-jwt` and `INVALID` for `ldp_vc`
(G14: Certify's DID document does not authorise its key for `assertionMethod`). Reference issuer ->
Inji Verify: `ldp_vc` `VALID`, expired `EXPIRED`; an SD-JWT VC with a DID-named key `INVALID` (G16).
With certify-ac and Inji Web (`test/live/inji-web.test.ts`, 5 more tests): certify-ac -> reference wallet
-> Inji Verify is `VALID` for `vc+sd-jwt`; Inji Web downloads from certify-ac and from the reference issuer,
signs in and presents, and Inji Verify answers `INVALID` for its `ldp_vc` presentations (G22: the ldp_vp is
signed with an Ed25519 key, the credential is bound to a P-256 key); Inji Web offers nothing for an SD-JWT
VC request (G25) and refuses the reference verifier's requests (G23).
The gaps are in [docs/gaps/gaps.json](../../docs/gaps/gaps.json). Contract tests replay the recorded
Inji answers without containers (`test/contract/inji/`, fixtures from
`scripts/capture-inji-fixtures.ts`).

## Hosted reference roles

`src/hosting/reference-hosting.ts` serves, on the playground's own port:

| Path                                             | What                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `/ref/issuer/draft13/*`, `/ref/issuer/v1/*`      | Reference issuer, OpenID4VCI draft 13 and 1.0                              |
| `/ref/issuer/did-key/*`, `/ref/issuer/did-jwk/*` | The same issuer keys under the other DID method, for the DID-method probes |
| `/ref/as/*`                                      | Test authorization server (authorization code flow, stands in for eSignet) |
| `/ref/verifier/*`                                | Reference verifier: request objects and `direct_post` responses            |
| `/.well-known/*/ref/...`                         | RFC 8615 well-known documents of the above, at the host root               |

Keys are created on first start in `$PLAYGROUND_RUN_DIR/keys/`, so DIDs stay the same across restarts;
with `PLAYGROUND_DB=:memory:` they live only in memory.

## Recording

Every HTTP exchange of a run is recorded exactly once, at the capture point that sees it:

| Capture point | Where                                           | Sees                                                                                |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `outbound`    | the `RecordingFetch` each role gets             | calls the playground's roles make to anything other than this server                |
| `inbound`     | Fastify hooks on `/ref/*` (`inbound.ts`)        | requests to the hosted reference roles, from the playground's roles or from outside |
| `proxy`       | `/proxy/:target/*`, `/v1/verify/*` (`proxy.ts`) | traffic to an Inji service routed through the playground                            |

- Calls a role makes to the server itself are dispatched in-process (`self-transport.ts`) and recorded
  by the inbound recorder or the proxy, not by the outbound client.
- Each exchange is tagged with its protocol step from what the wire shows (`step-tagging.ts`): method,
  path, content types and form fields.
- Requests from outside (a phone, Mimoto, the browser SDK) carry no run id. They belong to the run that
  most recently claimed the target (`capture-hub.ts`): the issuer role claims `/ref/issuer` and `/ref/as`
  when it makes an offer, and the verifier role claims `/ref/verifier` when it makes a request. The
  playground's own roles send `x-playground-run`, `-step` and `-from` headers, which are never recorded
  or forwarded. Exchanges that no run claims are counted, not stored.
- `/v1/verify/*` keeps its path because verify-service scopes its `transaction_id` cookie to it; it is
  needed because verify-service sends no CORS headers, so the Inji Verify SDK must use the page's origin.
- In host mode, `PLAYGROUND_NETWORK_MAP` lets the server reach the stack's container names (for example
  the `response_uri` Inji Verify hands the wallet) through the host ports.

Exports (`GET /api/runs/{id}/export`, reports, fixtures) redact access tokens, pre-authorized and
authorization codes (in forms, URLs and JSON bodies next to an `authorization_code` grant type), PKCE
code verifiers, client assertions, cookies and private keys, and keep the payload's shape.

## Recorded fixtures

`packages/protocol/fixtures/*.recorded.json` are redacted exports of real reference runs, for UI tests
and playback. Prettier leaves that name alone, so the bytes stay as recorded. Regenerate them with:

```bash
npm run smoke -- --format ldp_vc --export packages/protocol/fixtures/reference-ldp-vc.recorded.json
npm run smoke -- --format vc+sd-jwt --vp-profile final-1.0 --export packages/protocol/fixtures/reference-sd-jwt-final.recorded.json
```

## Storage

`src/store/migrations.ts` holds the schema as numbered migrations, applied once at start-up inside a
transaction (a failing migration leaves the version unchanged). File databases use write-ahead logging.

| Table        | One row per                                                                           |
| ------------ | ------------------------------------------------------------------------------------- |
| `runs`       | Run: configuration and report as JSON, plus indexed copies of the columns filters use |
| `run_events` | Event, with a per-run sequence number                                                 |
| `exchanges`  | Recorded HTTP request and response                                                    |
| `artifacts`  | Offer, credential, request object, `vp_token`, verification result                    |

Runs left `queued` or `running` by a previous process are closed with verdict `error` at start-up.

## Adding a role

1. Implement `IssuerRole`, `WalletRole` or `VerifierRole` from `@inji-playground/protocol`.
2. Make every protocol HTTP call through `ctx.http.fetch` (never the global `fetch`) and pass
   `ctx.signal`, so the call is recorded and stops on timeout or cancel.
3. Call `ctx.enterStep('token')` and so on as the role moves through the protocol.
4. Throw `RoleError` with category `interop` when the other side sent something wrong, `environment`
   when a service could not be reached.
5. Register it: Inji adapters in `src/adapters/inji/index.ts`; other roles through
   `buildApp({ roles: [{ role, stepTimeoutMs? }] })`.
6. A role that hands a URL to an outside party (a QR code for a phone) claims the capture target with
   `services.capture.claim(runId, target)`, so the requests that come back are recorded in its run.

## Code map

| Path                      | Contents                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app.ts`              | `buildApp(options)`: wires store, bus, registry, orchestrator, routes, UI                    |
| `src/main.ts`             | Listens on the configured port; closes runs cleanly on SIGINT / SIGTERM                      |
| `src/config/`             | Environment variables -> typed configuration                                                 |
| `src/store/`              | Migrations and `RunStore` (all SQL lives here)                                               |
| `src/events/`             | `EventBus`: per-run and all-run subscribers; a failing listener never stops others           |
| `src/orchestrator/`       | `Orchestrator`, compatibility check, role registry, step timers, stack lock, fake roles      |
| `src/recording/`          | Capture points (outbound client, inbound recorder, reverse proxy), step tagging, attribution |
| `src/hosting/`            | Hosts the reference issuer, test authorization server and verifier under `/ref/*`            |
| `src/adapters/reference/` | The `ref-issuer`, `ref-wallet` and `ref-verifier` roles                                      |
| `src/adapters/manual/`    | `mobile-wallet`: a person with a phone wallet                                                |
| `src/api/`                | REST routes, WebSocket route, OpenAPI registration, error handler                            |
| `src/reports/`            | Report document and Markdown, redaction, export, credential size                             |
| `src/matrix/`             | Compatibility matrix and its Markdown rendering                                              |
| `src/metrics/`            | Success rates, percentiles, Prometheus text format                                           |
| `src/gaps/`               | Gap register reader and matrix cell patterns                                                 |
| `src/adapters/inji/`      | Inji Certify and Inji Verify (API and web component) roles, stack status                     |

The fake roles (`src/orchestrator/fake-roles.ts`) speak no protocol: the issuer hands the wallet an
in-memory credential and the verifier checks a digest. They exist for tests and for exercising the UI
before real roles exist; they ship in the build only so `PLAYGROUND_FAKE_ROLES=1` can register them,
and are off by default.

## Tests

`test/` runs with `npm test`; `test/live/` needs the Inji stack and runs with `npm run test:live`.

- `reference-flow.test.ts`: the reference trio for `ldp_vc` and `vc+sd-jwt`, both profiles, with the
  exchanges, steps and artefacts each run records.
- `reference-scenarios.test.ts`: every applicable (scenario, format, profile) cell of the catalogue
  through `POST /api/runs`, plus the `not-supported` and `vp-replay` cases.
- `capture-points.test.ts`: the reverse proxy records request and response bodies; the inbound recorder
  records outside requests at `/ref/issuer`; a `mobile-wallet` run completes when a scripted wallet
  consumes the QR payloads.
- `recorded-fixtures.test.ts`: the recorded fixtures are valid, passing and redacted.
- `holder-web.test.ts`: the test authorization server gives certify-ac's scopes certify-ac's audience, only
  when a stack is configured.
- `test/live/inji-core.test.ts`, `test/live/inji-web.test.ts`: the live cells against the stack, with the
  gap each blocked cell depends on.
  Test names carry the test-case ids of the test plan (`TC_PG_RUN_01` and so on).
