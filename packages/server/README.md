# @inji-playground/server

The playground server (Fastify): REST and WebSocket API, run orchestrator, recording HTTP client,
SQLite store (Node's built-in `node:sqlite`) and the registry of roles (issuers, wallets, verifiers).

Status (2026-10-04): the server foundation is in place and tested with stand-in roles. The real roles
(reference issuer, wallet and verifier; Inji adapters) are registered by later work and plug into the
interfaces described below without changes to the orchestrator.

## Run it

```bash
npm run build && npm start            # http://localhost:28100, UI + API + WebSocket
npm run dev -w @inji-playground/server # from source, reloads on change
npm test -w @inji-playground/server    # unit and API tests (in-memory database)
```

Measured 2026-10-04 on the development laptop: `npm run build && npm start`, then
`curl -s http://localhost:28100/api/openapi.json` listed `/api/runs`, `/api/roles`,
`/api/stack/status` and `/api/runs/{id}/verifier-callback`; with `PLAYGROUND_FAKE_ROLES=1` a
`POST /api/runs` (fake issuer, wallet and verifier, `vc+sd-jwt`) finished with verdict `pass` and was
returned by `GET /api/runs?format=vc%2Bsd-jwt&verdict=pass`.

## Configuration

Environment variables, parsed with zod at start-up (`src/config/index.ts`). An invalid value stops the
server with a message naming the variable.

| Variable                          | Default                      | Meaning                                                           |
| --------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `PLAYGROUND_PORT`                 | `28100`                      | Port of UI, API and WebSocket                                     |
| `PLAYGROUND_HOST`                 | `127.0.0.1`                  | Interface to listen on (`0.0.0.0` in the image)                   |
| `PLAYGROUND_RUN_DIR`              | `<repo>/run`                 | Database, generated keys and certificates                         |
| `PLAYGROUND_DB`                   | `<run dir>/playground.db`    | SQLite file; `:memory:` keeps nothing (tests)                     |
| `PLAYGROUND_GAPS_FILE`            | `<repo>/docs/gaps/gaps.json` | Gap register served by `/api/gaps`; a missing file means no gaps  |
| `PLAYGROUND_WEB_DIST`             | `<repo>/packages/web/dist`   | Built UI to serve                                                 |
| `PLAYGROUND_STACK`                | `off`                        | `off`, `host` or `bundle`: where the Inji stack runs              |
| `PLAYGROUND_PUBLIC_URL`           | (none)                       | URL phones and containers use to reach the server                 |
| `PLAYGROUND_LOG_LEVEL`            | `info`                       | Log level                                                         |
| `PLAYGROUND_TIMEOUT_REFERENCE_MS` | `15000`                      | Step timeout when only playground reference roles take part       |
| `PLAYGROUND_TIMEOUT_INJI_MS`      | `90000`                      | Step timeout when an Inji module or other outside role takes part |
| `PLAYGROUND_TIMEOUT_PERSON_MS`    | `600000`                     | Step timeout while a person must act (scan a QR code)             |
| `PLAYGROUND_FAKE_ROLES`           | `0`                          | `1` registers the development-only "Test role (fake)" roles       |

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
  the code `scenario.hook-failed`.
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

## Code map

| Path                 | Contents                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| `src/app.ts`         | `buildApp(options)`: wires store, bus, registry, orchestrator, routes, UI               |
| `src/main.ts`        | Listens on the configured port; closes runs cleanly on SIGINT / SIGTERM                 |
| `src/config/`        | Environment variables -> typed configuration                                            |
| `src/store/`         | Migrations and `RunStore` (all SQL lives here)                                          |
| `src/events/`        | `EventBus`: per-run and all-run subscribers; a failing listener never stops others      |
| `src/orchestrator/`  | `Orchestrator`, compatibility check, role registry, step timers, stack lock, fake roles |
| `src/recording/`     | `RecordingFetch`: records request, response, timing and errors of each call             |
| `src/api/`           | REST routes, WebSocket route, OpenAPI registration, error handler                       |
| `src/reports/`       | Report document and Markdown, redaction, export, credential size                        |
| `src/matrix/`        | Compatibility matrix and its Markdown rendering                                         |
| `src/metrics/`       | Success rates, percentiles, Prometheus text format                                      |
| `src/gaps/`          | Gap register reader and matrix cell patterns                                            |
| `src/adapters/inji/` | Inji Certify, Verify and Mimoto adapters (filled by the Inji adapter work)              |

The fake roles (`src/orchestrator/fake-roles.ts`) speak no protocol: the issuer hands the wallet an
in-memory credential and the verifier checks a digest. They exist for tests and for exercising the UI
before real roles exist; they ship in the build only so `PLAYGROUND_FAKE_ROLES=1` can register them,
and are off by default.

## Tests

`test/` runs with `npm test`; `test/live/` needs the Inji stack and runs with `npm run test:live`.
Test names carry the test-case ids of the test plan (`TC_PG_RUN_01` and so on).
