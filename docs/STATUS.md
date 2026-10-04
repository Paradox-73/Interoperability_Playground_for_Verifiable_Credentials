# Project status and remaining work

Where the work stands, what is left, and how to pick it up. Read [CONTRIBUTING.md](../CONTRIBUTING.md) first
for set-up and the rules every change follows.

- Project: Inji Interoperability Playground for Verifiable Credentials, MOSIP Decode 2026, problem statement
  02, team Badmosip.
- Submission deadline: 2026-10-26 23:59 IST.
- Work stopped: 2026-10-04 20:45 IST.
- `main` at that time: commit `447f05d` (2026-10-04 17:04 IST), pushed to
  <https://github.com/Paradox-73/Interoperability_Playground_for_Verifiable_Credentials>.
- Unfinished work: branch `wip/2026-10-04-stop`, commit `6778946`, one commit on top of `main` holding 65 files
  (about 6,600 added lines) from three tasks (WP-08, WP-11, WP-13). The branch is on GitHub (pushed
  2026-10-04): run `git fetch origin wip/2026-10-04-stop` before you start a PARTIAL task.

## Contents

- [Task table](#task-table)
- [State of the unfinished branch](#state-of-the-unfinished-branch)
- [Task cards](#task-cards)
- [How to split the remaining work between people](#how-to-split-the-remaining-work-between-people)
- [Definition of done](#definition-of-done)
- [Gap ids used in commits and docs](#gap-ids-used-in-commits-and-docs)
- [Optional extras](#optional-extras)

## Task table

Status meanings: DONE = merged to `main` with its acceptance check run; PARTIAL = code exists on
`wip/2026-10-04-stop` but is not finished or not merged; TODO = not started.

| Id    | Lane        | Title                                                                                    | Depends on                 | Status  | Commits on `main`                                                                                                                                                              |
| ----- | ----------- | ---------------------------------------------------------------------------------------- | -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WP-01 | B-server    | Repository scaffold, shared contracts and build tooling                                  | -                          | DONE    | `6d15729`, `356727b`                                                                                                                                                           |
| WP-02 | A-reference | Credential formats, keys and DID resolution library                                      | WP-01                      | DONE    | `d7925bc`                                                                                                                                                                      |
| WP-03 | B-server    | Server foundation: store, events, orchestrator, REST and WebSocket API                   | WP-01                      | DONE    | `a4e5636`, `326f9db`                                                                                                                                                           |
| WP-04 | C-web       | UI foundation: app shell, three-column role selector, run bar, live timeline             | WP-01                      | DONE    | `81f971e`                                                                                                                                                                      |
| WP-05 | D-stack     | Import upstream Inji configuration unchanged; local Inji stack and one-command bundle    | WP-01                      | DONE    | `e491c2d`, `ab5da50`, `dcb0cce`, `2a809f5`, `ba25dc6`, `33cbae5`, `af9e36d`, `67d01b3`, `60a699f`, `d4b9a35`, `e19cb30`, `76f2b67`, `5546f31`, `46b042b`, `981256e`, `0454a87` |
| WP-06 | A-reference | OpenID4VCI reference issuer, test authorization server and wallet issuance client        | WP-02                      | DONE    | `79b2612`, `6276a87`, `1294ea0`                                                                                                                                                |
| WP-07 | D-stack     | OpenID4VP reference verifier and wallet presentation client                              | WP-02                      | DONE    | `dba2418`                                                                                                                                                                      |
| WP-08 | B-server    | Recording proxy, reference and manual roles, first reference run end to end              | WP-03, WP-06, WP-07        | PARTIAL | -                                                                                                                                                                              |
| WP-09 | C-web       | Protocol inspector, animated sequence diagram and run playback                           | WP-04                      | DONE    | `447f05d`                                                                                                                                                                      |
| WP-10 | D-stack     | Inji Certify and Inji Verify adapters with live runs in both formats                     | WP-05, WP-08               | TODO    | -                                                                                                                                                                              |
| WP-11 | A-reference | Tamper and negative-path scenario catalogue                                              | WP-06, WP-07               | PARTIAL | -                                                                                                                                                                              |
| WP-12 | B-server    | Reports, history, compatibility matrix and metrics API                                   | WP-03                      | DONE    | `b010184`                                                                                                                                                                      |
| WP-13 | C-web       | Matrix view, history dashboard, run report page and tamper controls                      | WP-09, WP-12               | PARTIAL | -                                                                                                                                                                              |
| WP-14 | D-stack     | Inji Web wallet through Mimoto, fed by certify-ac and the reference issuer               | WP-10                      | TODO    | -                                                                                                                                                                              |
| WP-15 | A-reference | Headless matrix CLI and nightly interoperability workflow                                | WP-08, WP-11, WP-12        | TODO    | -                                                                                                                                                                              |
| WP-16 | C-web       | Manual-wallet QR step, Inji Verify SDK panel, browser end-to-end and accessibility tests | WP-08, WP-09, WP-13        | TODO    | -                                                                                                                                                                              |
| WP-17 | D-stack     | End-to-end demo script, bundle check and test report                                     | WP-10, WP-14, WP-15, WP-16 | TODO    | -                                                                                                                                                                              |
| WP-18 | D-stack     | Documentation set and interoperability gap write-up with issue drafts                    | WP-13, WP-17               | TODO    | -                                                                                                                                                                              |

Longest chain of remaining work: WP-08 -> WP-10 -> WP-14 -> WP-17 -> WP-18. Start WP-08 first; everything
on that chain waits for it.

### What the DONE tasks give you

- Every root `npm run` command exists. Six still call a placeholder that prints `not implemented yet (WP-xx)`
  and exits 1: `smoke` (WP-08), `matrix:reference` / `matrix:live` (WP-15), `e2e` / `e2e:live` (WP-16),
  `demo` and `test:report` (WP-17), `docs:check` (WP-18). Implementing a command means replacing the file
  the script calls, never editing `package.json`.
- Measured on `main` on 2026-10-04 (before work stopped): `npm ci`, lint, typecheck, `npm test` and
  `npm run build` exit 0; `npm run stack:smoke` printed `SMOKE PASS` in 166 s, including Inji Verify
  `SUCCESS` for a Certify `ldp_vc` under `did:web:certify.ps02.test` and for a `vc+sd-jwt`; `npm run up`
  answered `/api/health` after 194 s.
- Per-package guides: [protocol](../packages/protocol/README.md), [formats](../packages/formats/README.md),
  [oid4vci](../packages/oid4vci/README.md), [oid4vp](../packages/oid4vp/README.md),
  [server](../packages/server/README.md), [web](../packages/web/README.md),
  [inspector](../packages/web/src/inspector/README.md), [Inji stack](../deploy/inji-stack/README.md),
  [set-up](setup.md), [API](api/README.md).

## State of the unfinished branch

Checked on 2026-10-04 at about 21:20 IST on a working tree identical to `wip/2026-10-04-stop` (all 65 files
compared byte for byte):

| Check                                                                                                 | Result                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run --project formats --project scenarios`                                                | 246 pass, 0 fail                                                                                                       |
| `npx vitest run --project oid4vp --project oid4vci --project protocol --project cli --project deploy` | 206 pass, 0 fail                                                                                                       |
| `npm test -w @inji-playground/server`                                                                 | 111 pass, 4 fail (listed under WP-08)                                                                                  |
| `npm test -w @inji-playground/web`                                                                    | 216 pass, 1 fail (`app-shell.test.tsx`, "routing /runs shows the page Runs", listed under WP-13)                       |
| `npm run typecheck`                                                                                   | exit 2: 2 errors in `packages/scenarios/test/catalogue.test.ts` (WP-11), 5 errors in `packages/web/src/pages/` (WP-13) |
| `npm run lint`, `npm run format:check`, `npm run build`                                               | not run on the branch                                                                                                  |

The branch mixes three lanes in one commit. Do not merge it as it is. Bring it to `main` as three pull
requests, one per task, in this order, by copying paths out of the branch:

```bash
git fetch origin
git switch -c wp-11-scenarios origin/main
git restore --source=origin/wip/2026-10-04-stop -- packages/scenarios packages/formats packages/protocol/src/scenario.ts \
  packages/oid4vp/src/verifier/verify-presentation.ts package-lock.json docs/README.md
```

| Order | Pull request | Paths taken from the branch                                                                                                                                                                                                          |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | WP-11        | `packages/scenarios/`, `packages/formats/` (`src/tamper/`, `test/tamper.test.ts`, `package.json`), `packages/protocol/src/scenario.ts`, `packages/oid4vp/src/verifier/verify-presentation.ts`, `package-lock.json`, `docs/README.md` |
| 2     | WP-08        | `packages/server/` (everything changed or new under it)                                                                                                                                                                              |
| 3     | WP-13        | `packages/web/` (`src/features/{gaps,history,matrix,report,tamper}/`, `src/locales/en.json`)                                                                                                                                         |

`docs/README.md` on the branch only adds a link to the formats guide; it can go with any of the three.

## Task cards

Every command below runs from the repository root in Git Bash (Windows) or a normal shell (Linux, macOS).
Workspace names are `@inji-playground/<folder>`. Commands that start Docker end by stopping it, so a failed
check never leaves containers running.

### WP-08 Recording proxy, reference and manual roles, first reference run end to end (PARTIAL)

- **Goal:** a run started from the UI or the API goes reference issuer -> reference wallet -> reference
  verifier; every HTTP exchange is recorded once, streamed over the WebSocket, and the report is stored.
- **Depends on:** WP-03, WP-06, WP-07 (all DONE). To run tamper scenarios through the server it also needs
  WP-11 merged first.
- **Owns:** `packages/server/src/recording/`, `packages/server/src/hosting/`,
  `packages/server/src/adapters/reference/`, `packages/server/src/adapters/manual/`,
  `packages/server/scripts/smoke-run.ts`, `packages/server/test/` (not `test/live/` or `test/contract/inji/`),
  `packages/protocol/fixtures/`.
- **Acceptance check:**
  - `npm test -w @inji-playground/server` passes, with tests for: reference happy path for `ldp_vc` and for
    `vc+sd-jwt` with verdict `pass`; the `/proxy/:target/*` route records request and response bodies; the
    inbound recorder captures exchanges at `/ref/issuer`; a `mobile-wallet` run completes when a scripted
    wallet consumes the QR payload.
  - `npm run smoke -- --issuer ref-issuer --wallet ref-wallet --verifier ref-verifier --format vc+sd-jwt`
    prints `verdict=pass` and lists at least 6 recorded exchanges (offer, issuer metadata, token,
    credential, presentation request, presentation submission).
- **On the branch already:**
  - Recording layer in `src/recording/`: step tagging (`step-tagging.ts`), connection-level host mapping
    (`network-map.ts`, reads `deploy/inji-stack/network-map.host.json`), reverse proxy for `/proxy/:target/*`
    and `/v1/verify/*` (`proxy.ts`, `targets.ts`), inbound recorder for `/ref/*` (`inbound.ts`), run
    attribution (`capture-hub.ts`), in-process dispatch of calls to the server itself so nothing is recorded
    twice (`self-transport.ts`).
  - Hosting of the reference issuer at `/ref/issuer`, the verifier at `/ref/verifier` and the test
    authorization server at `/ref/as` (`src/hosting/reference-hosting.ts`); keys kept in
    `$PLAYGROUND_RUN_DIR/keys/`.
  - Roles `ref-issuer`, `ref-wallet`, `ref-verifier` (`src/adapters/reference/`) and `mobile-wallet`
    (`src/adapters/manual/mobile-wallet.ts`), registered in `src/app.ts`.
  - New settings in `src/config/index.ts`: `PLAYGROUND_PROXY_TIMEOUT_MS` (default 110000),
    `PLAYGROUND_NETWORK_MAP`, `PLAYGROUND_EXTRA_CA`, `PLAYGROUND_REF_ISSUER_DID` (`did:key` default,
    `did:jwk`, `did:web`), `INJI_CERTIFY_URL`, `INJI_CERTIFY_AC_URL`, `INJI_VERIFY_URL`, `INJI_MIMOTO_URL`.
  - `test/reference-flow.test.ts`: happy path for both formats, `final-1.0` + OpenID4VCI 1.0 for
    `vc+sd-jwt`, and step and artefact events. These pass.
- **What remains:**
  - Fix the 4 failing server tests. They assert the state before reference roles and the full scenario list
    existed: `api.test.ts` "lists roles with health, filtered by kind", "lists scenarios", "development-only
    fake roles are registered only when PLAYGROUND_FAKE_ROLES is on" (expects `[]` from `/api/roles`), and
    `matrix.test.ts` "answers JSON and Markdown ... linked to the gap register" (expects 4 matrix cells,
    gets 48). Change the expectations, or build those test apps without the reference roles; do not weaken
    what they check.
  - Add the missing tests from the acceptance check: proxy body recording, inbound recorder at `/ref/issuer`,
    manual wallet completed by a scripted wallet.
  - Pass the scenario hooks into the server: `buildApp` accepts `hooksFor`, but nothing passes the
    `scenarioHooks()` export of `@inji-playground/scenarios` yet (`src/main.ts` and the test helper).
    Without it, every scenario other than `happy` runs as the happy path.
  - Replace the placeholder `packages/server/scripts/smoke-run.ts`: start the server in-process on a port in
    28600-28699, run one cell from the command-line flags, print `verdict=<verdict>` and the exchanges.
  - Export two recorded runs, redacted, to `packages/protocol/fixtures/` named `*.recorded.json` (Prettier
    leaves that name alone so the bytes stay as recorded), for the UI tests and playback.
  - Update `packages/server/README.md` (recording, hosting, roles, the new variables).
- **Pitfalls and decisions already made:**
  - An exchange is recorded at exactly one capture point: outbound client, reverse proxy or inbound hook.
    If a call to the server's own proxy also passes the outbound client, only the proxy records it.
  - The Inji Verify SDK's status poll holds a request open up to 55 s, so the proxy timeout (110 s) sits
    between that and the server's 120 s request timeout.
  - Exports (reports, fixtures, matrix files) redact access tokens, pre-authorized codes, authorization
    codes, client assertions, cookies and private keys, and keep the payload shape.

### WP-10 Inji Certify and Inji Verify adapters with live runs in both formats (TODO)

- **Goal:** real Inji modules in the loop: Inji Certify issues, Inji Verify verifies, in `ldp_vc` and
  `vc+sd-jwt`, with every exchange recorded.
- **Depends on:** WP-05 (DONE), WP-08.
- **Owns:** `packages/server/src/adapters/inji/` (today only `index.ts`, exporting an empty role list and an
  empty `stackStatus()`), `packages/server/test/live/`, `packages/server/test/contract/inji/`,
  `deploy/inji-stack/`, `docs/gaps/gaps.json`.
- **Acceptance check:**
  - `npm test -w @inji-playground/server -- adapters/inji` passes on redacted fixtures captured from the
    stack.
  - `npm run stack:up && npm run test:live; rc=$?; npm run stack:down; exit $rc` exits 0 and stores at
    least 8 live runs.
  - Certify -> reference wallet -> Inji Verify reports `VALID` for `vc+sd-jwt` and for `ldp_vc`. If an
    upstream gap blocks one format (G2, or inji/inji-certify#1054), that run stores the failing step and
    exchange, `docs/gaps/gaps.json` gets an entry, and the other format is `VALID`. At least one all-Inji
    cell must be `VALID`.
  - Certify -> reference wallet -> reference verifier reports `VALID` in both formats.
  - Every other live cell (including reference issuer -> Inji Verify with the probe scenarios of WP-11)
    stores a report with its outcome, error detail and the image versions.
- **Notes:**
  - `adapters/inji/certify.ts`: issuer role `inji-certify`. Capabilities from live issuer metadata plus the
    image tag; `startIssuance` calls `POST /v1/certify/pre-authorized-data` and returns the offer URI (also
    the QR text for phones). Certify cannot serve wallet-initiated issuance in pre-authorized mode.
  - `adapters/inji/verify.ts`: verifier role `inji-verify`. `POST /v1/verify/vp-request` with a
    `presentation_definition` per format; long-poll `GET /v1/verify/vp-request/{id}/status`; then
    `POST /v1/verify/v2/vp-results/{transactionId}`; map to `VALID` / `INVALID` / `EXPIRED`. Read the
    advertised `vp_formats` from the request object, so an unsupported format becomes a "not supported"
    cell with evidence.
  - Verifier role `inji-verify-sdk` (server side): learns the browser session from the `/v1/verify` proxy
    and `POST /api/runs/:id/verifier-callback`, rebuilds the `openid4vp://` request from the recorded
    `vp-session-request` response so the reference wallet can answer it, then fetches the result itself.
  - Fill `stackStatus()` (per-service health and image tags) for `GET /api/stack/status`.
  - When `PLAYGROUND_PUBLIC_URL` is set, advertise URLs through the playground proxy (Certify domain URL,
    `INJI_VERIFY_SUBMISSION_BASE_URL`) so traffic from a phone or from Mimoto is recorded too.
  - Holder proof for Certify: ES256 with a `did:jwk` key id is the combination Certify accepted; an EdDSA
    proof may be rejected by the sample config (G9). Certify pads the `did:jwk` it binds
    (inji/inji-certify#1054); present the holder DID exactly as bound.
  - Inji Verify 0.18.2 needs `presentation_submission` in every `direct_post` and supports neither DCQL nor
    `direct_post.jwt` nor `mso_mdoc`; it advertises `vc+sd-jwt`, not `dc+sd-jwt`.
  - Timeouts: Inji steps default to 90 s (`PLAYGROUND_TIMEOUT_INJI_MS`). Certify's first metadata call took
    52 s on a cold start and one Inji Verify LDP verification took 13 s (2026-10-04).
  - Live runs against one stack run one at a time; the Vitest `live` project already sets
    `fileParallelism: false` and a 180 s test timeout.

### WP-11 Tamper and negative-path scenario catalogue (PARTIAL)

- **Goal:** reusable scenarios, each with an expected outcome and the specification text that makes it
  correct, plus valid "probe" variants that show interoperability gaps.
- **Depends on:** WP-06, WP-07 (both DONE).
- **Owns:** `packages/scenarios/`, `packages/formats/src/tamper/`, `packages/formats/test/tamper.test.ts`.
- **Acceptance check:** `npm test -w @inji-playground/scenarios` passes (a table-driven test applies every
  scenario to the reference verifier for every applicable format and both OpenID4VP profiles and gets the
  expected outcome; the catalogue validates against the protocol schema), and
  `npm test -w @inji-playground/formats` still passes.
- **On the branch already:**
  - Tamper functions in `packages/formats/src/tamper/` (`jws.ts`, `ldp.ts`, `sd-jwt.ts`): flip a JWS or
    `proofValue` byte, alter, add or drop a disclosure, sign a KB-JWT again with a wrong nonce, audience or
    key, sign an SD-JWT with a self-signed `x5c`, present an ldp_vp signed by another holder. Exported as
    `@inji-playground/formats/tamper`.
  - 17 scenarios in `packages/scenarios/src/catalogue.ts`: `happy`; tamper: `expired`, `not-yet-valid`,
    `wrong-type`, `bad-signature`, `altered-disclosure`, `unreferenced-disclosure`, `kb-wrong-nonce`,
    `kb-wrong-aud`, `vp-replay`, `holder-mismatch`, `forged-x5c`; probes (expected `VALID`):
    `issuer-did-key`, `issuer-did-jwk`, `vc2-eddsa-rdfc-2022`, `dc-sd-jwt`, `holder-did-canonical`.
  - Protocol fields added to `ScenarioSpec` in `packages/protocol/src/scenario.ts`: `category` (`happy`,
    `tamper`, `probe`), `requires` (role ids per role kind), `vpProfiles`, `gap`.
  - Hooks for the orchestrator (`hooks.ts`), issuer options (`issuer.ts`), wallet behaviour (`wallet.ts`),
    tamper application (`tamper.ts`); `test/reference-matrix.test.ts` (the table-driven test).
  - `packages/oid4vp/src/verifier/verify-presentation.ts`: the reference verifier now requires an `x5c`
    chain to end at a configured trust anchor, so `forged-x5c` is rejected. This file is in lane D's folder;
    tell that lane in the pull request.
  - Formats and scenarios tests pass on the branch.
- **What remains:**
  - Fix the 2 type errors in `packages/scenarios/test/catalogue.test.ts` (lines 144 and 180: a
    `ScenarioSpec` passed where `Pick<ScenarioDefinition, 'issuer' | 'wallet'>` is expected); then
    `npm run typecheck` must exit 0 for the scenarios workspace.
  - In the same pull request, update the server test `api.test.ts` "lists scenarios", which expects the old
    one-entry list (one-line change in lane B's folder; say so in the pull request).
  - Run `npm run lint` and `npm run format:check`.
  - Update `packages/scenarios/README.md` with the catalogue table (id, category, expected outcome, formats,
    roles needed, specification reference).
- **Notes:**
  - Issuer-side variants need `ref-issuer`; wallet-side tampering needs `ref-wallet`. The `requires` field
    says so, and the server must report other combinations as "not supported", not as failures.
  - `expired` is a validly signed credential whose validity is in the past: expected `EXPIRED`, shown as
    "Valid but expired".
  - `forged-x5c` probes gap G7 (Inji Verify takes the SD-JWT key from the `x5c` leaf without checking the
    chain, from code reading). If Inji Verify accepts it in WP-10, treat it as a security finding: see
    WP-18.
  - `holder-did-canonical` is expected `VALID`: the did:jwk specification forbids padding, and the padded
    and unpadded strings name the same key.

### WP-13 Matrix view, history dashboard, run report page and tamper controls (PARTIAL)

- **Goal:** pages that turn stored runs into evidence anyone can browse.
- **Depends on:** WP-09, WP-12 (both DONE). Tamper controls show the WP-11 catalogue once it is merged.
- **Owns:** `packages/web/src/features/{matrix,history,report,tamper,gaps}/`, `packages/web/test/`,
  `packages/web/src/locales/en.json`, `packages/web/src/app/routes.tsx`, `packages/web/src/features/run-bar/`.
- **Acceptance check:** `npm test -w @inji-playground/web` passes, including: a matrix cell shows icon +
  text ("Pass", "Fail", "Not supported"), never colour alone, and links to its run; history filters change
  the API query; the report page renders every mandatory report field (issuer, wallet, verifier, format,
  proof type, outcome, error detail) and offers Markdown and JSON download; choosing a tamper scenario shows
  its expected outcome before the run and expected vs actual after; axe reports no violations on the
  matrix, history and report pages. Then `npm run build -w @inji-playground/web` exits 0.
- **On the branch already:** page components and API clients, no tests:
  - `features/matrix/` (`MatrixPage.tsx`, filters, layout, `api.ts` for `GET /api/matrix`);
  - `features/history/` (`HistoryPage.tsx`, filters, metric tiles from `GET /api/metrics`, live refresh);
  - `features/report/` (`ReportPage.tsx`, badges, `api.ts` for `/api/runs/{id}/report.json|.md`);
  - `features/tamper/` (`TamperControls.tsx`, `ReplayWithTamper.tsx`, store, scenario list);
  - `features/gaps/` (`GapsPage.tsx` for `GET /api/gaps`);
  - 224 new lines in `src/locales/en.json`.
- **What remains:**
  - `en.json` on the branch removed keys still used on `main`: `pages.runs.title`, `pages.runs.empty`,
    `pages.runs.none`, the `runs` navigation label, `pages.matrix.empty`, `pages.gaps.title` and
    `pages.gaps.empty` among them. This causes the 5 type errors in `src/pages/RunsPage.tsx` and
    `src/pages/PlaceholderPage.tsx` and the failing `app-shell.test.tsx` case. Restore the keys, or move the
    pages to the new ones and delete the old pages in the same change.
  - Wire the pages into `src/app/routes.tsx`: `/matrix` and `/gaps` still show `PlaceholderPage`, `/runs`
    still shows `RunsPage`, and the report page has no route yet.
  - Put `TamperControls` into the run bar (`src/features/run-bar/`) and "replay with tamper" on the report
    page (`POST /api/runs` with `replayOf`).
  - Write the tests listed in the acceptance check (Testing Library + MSW, as in the existing
    `packages/web/test/`), then run lint, format and build.
- **Notes:** the UI shows recorded exchanges only; test data imitating protocol payloads is named
  `*.synthetic.json`. Strings go in `src/locales/en.json`. Keep AA contrast in light and dark themes.

### WP-14 Inji Web wallet through Mimoto, fed by certify-ac and the reference issuer (TODO)

- **Goal:** Inji Web as a real wallet, and an all-Inji issuance path Inji Certify -> Inji Web through Mimoto
  with no eSignet and no phone. Then presentation from Inji Web if Mimoto's login can be satisfied locally.
- **Depends on:** WP-10.
- **Owns:** `packages/server/src/adapters/inji/`, `packages/server/test/live/`, `deploy/inji-stack/`,
  `docs/gaps/`, `docs/setup.md`.
- **Order inside the task:** (1) certify-ac + Mimoto guest download, (2) reference issuer into Inji Web,
  (3) logged-in wallet and presentation (best effort; a block becomes a gap entry).
- **Acceptance check:** this exits 0 (the npm commands start every profile unless
  `PLAYGROUND_STACK_PROFILES` says otherwise):

  ```bash
  npm run stack:up && npm run test:live -- inji-web certify-ac; rc=$?; npm run stack:down; exit $rc
  ```

  and the stored runs show:
  - certify-ac -> Inji Web (Mimoto guest download) completes, with Mimoto's token request to `/ref/as` and
    its credential request to certify-ac recorded, and the credential visible in the recorded response;
  - certify-ac -> reference wallet -> Inji Verify reports `VALID` in at least one format;
  - reference issuer -> Inji Web completes, with Mimoto -> `/ref/issuer` token and credential exchanges
    recorded;
  - Inji Web -> Inji Verify presentation reports `VALID`, or stores a run whose error names the blocking
    step, with a matching entry in `docs/gaps/gaps.json`.

- **Notes:**
  - Why certify-ac: Mimoto 0.22.0 only runs the authorization-code flow, and Certify in pre-authorized mode
    has no `authorization_endpoint` (G5, G6). certify-ac is a second Certify 0.14.0 container
    (`injistack/inji-certify-with-plugins:0.14.0`, profiles `default,csvdp-farmer`, the imported
    `certify-csvdp-farmer.properties` and `farmer_identity_data.csv`) whose authorization server is the
    playground's test authorization server at `/ref/as`. A new team file `certify-ac.properties` points
    `mosip.certify.authorization.url`, `authn.issuer-uri`, `authn.jwk-set-uri` and `authn.allowed-audiences`
    at the test server. Issuer DID `did:web:certify-ac.ps02.test` (add it to the TLS front). It needs its own
    database: a second Postgres container running the unchanged `certify_init.sql`. Debug port 28093. Add it
    to the `holder-web` profile.
  - Unproven: that Certify accepts the test server's tokens. Certify checks access tokens only against the
    configured issuer, JWKS URL and audiences, and takes the proof nonce from the token's `c_nonce` claim;
    data providers look the holder up by `sub` (the test server uses a farmer CSV row id, for example
    `2154189532`). If certify-ac rejects the tokens, store the failing exchange, record it in this file, and
    switch to eSignet 2.0.0 + mock-identity-system 0.14.0 + oidc-ui 2.0.0 (reserved ports 28200-28209;
    eSignet's README asks for 4 GB free RAM).
  - Mimoto config: edit the imported `config/mimoto-issuers-config.json` in place (replace the sample's
    Collab eSignet entries) with entries for certify-ac and the reference issuer (well-known, token and
    proxy-token endpoints through `PLAYGROUND_PUBLIC_URL`, `client_alias` of Mimoto's generated PKCS#12,
    `redirect_uri` of Inji Web). The test server must register Mimoto's client certificate
    (`$PLAYGROUND_RUN_DIR/stack/mimoto/oidc-client.crt`) to check its `private_key_jwt`. Add Inji Verify and
    the reference verifier to `config/mimoto-trusted-verifiers.json`.
  - Mimoto refuses an issuer whose metadata lacks `display` logo, `background_color` or `text_color` on any
    credential configuration (G4); the reference issuer already sets them.
  - In guest mode Mimoto returns only a PDF to the browser, so the raw credential is visible only in the
    recorded Mimoto -> issuer exchange; point certify-ac's domain URL at the playground proxy.
  - Guest download, headless: build the authorization request Inji Web would build
    (`response_type=code`, PKCE S256, `redirect_uri=<inji-web>/redirect`), follow the test server's
    auto-approve redirect, capture the code, then `POST /v1/mimoto/credentials/download`.
  - Logged-in flow (unproven): point Mimoto's Google provider settings (JWK set URI, issuer, client id) at
    the test server through environment variables, then `POST /v1/mimoto/auth/google/token-login` with a
    test ID token; create and unlock a wallet; `POST /wallets/{id}/credentials`; presentation through
    `POST /wallets/{id}/presentations` and `PATCH`. State-changing calls need the `X-XSRF-TOKEN` header
    echoing the `XSRF-TOKEN` cookie. If the login cannot be satisfied, a person can register a Google
    OAuth client for a manual run; record the block as a gap.
  - Inji Web cannot take a credential offer (G5); it starts from its issuer list. The Mimoto service must
    stay named `mimoto-service`: the inji-web image proxies `/v1/mimoto/` to that fixed host.
  - Measure the `holder-web` profile's memory with `docker stats` and replace the estimate in
    `docs/setup.md` (about 3 GiB total expected, not measured).

### WP-15 Headless matrix CLI and nightly interoperability workflow (TODO)

- **Goal:** the compatibility matrix runs with no UI, locally and nightly, and publishes `matrix.md`.
- **Depends on:** WP-08, WP-11, WP-12.
- **Owns:** `packages/cli/`, `.github/workflows/interop-nightly.yml`, `docs/interop-report/reference/`.
- **Acceptance check:** `npm run matrix:reference` exits 0 and writes
  `docs/interop-report/reference/matrix.md` and `matrix.json` (dated) with at least 30 reference cells
  whose verdicts match the spec; `npm test -w @inji-playground/cli` passes (spec parsing, Markdown
  rendering, exit code on mismatch, duration estimate);
  `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/interop-nightly.yml','utf8'))"`
  exits 0.
- **Notes:**
  - Today `packages/cli` has an argument parser (`src/main.ts`, `test/args.test.ts`) and
    `scripts/matrix.mjs` is a placeholder; `specs/` holds only a README.
  - Commands: `run` (one cell) and `matrix --spec <file>`; talk to a server over REST (`--server`, default
    `http://localhost:28100`) or start an in-process reference server (`--reference`, temporary run
    directory, port in 28600-28699); write `matrix.json`, `matrix.md` (dated, with versions) and redacted
    per-cell run files to `--out`; exit 1 when a verdict differs from the spec; `--junit` output.
  - Specs: `specs/reference.yaml` (CI), `specs/live-core.yaml` (Certify and Inji Verify cells),
    `specs/live-holder-web.yaml` (certify-ac and Inji Web cells), `specs/demo.yaml`. Case ids
    `TC_PG_<AREA>_<NN>` in a `uniqueIdentifier` field, the style of Inji Verify's api-test YAML.
  - A live spec must finish within 20 minutes including stack start; the CLI prints an estimate (cells x
    last measured cell time) and refuses a live spec over 20 minutes unless `--force`.
  - `matrix:reference` writes to `docs/interop-report/reference/`, `matrix:live` to
    `docs/interop-report/live/`, so the two never overwrite each other.
  - Nightly workflow: cron 20:30 UTC and manual trigger; job 1 the reference matrix; job 2 `stack:up` with
    `holder-web`, `matrix:live` for both live specs, upload `docs/interop-report/` as an artifact, matrix as
    job summary, `stack:down`. Whether a GitHub-hosted runner has enough memory for the stack is not known
    yet; the first run measures it.
  - Add the reference matrix job to `.github/workflows/ci.yml` (minimal change to a shared file).

### WP-16 Manual-wallet QR step, Inji Verify SDK panel, browser end-to-end and accessibility tests (TODO)

- **Goal:** the phone path and the official Inji Verify component in the UI, plus browser tests proving the
  whole UI works and is accessible.
- **Depends on:** WP-08, WP-09, WP-13.
- **Owns:** `packages/web/src/features/{manual-wallet,inji-verify-sdk}/`, `packages/web/e2e/`,
  `packages/web/playwright.config.ts`, `scripts/e2e.mjs` (placeholder today), `docs/ux/`, one job in
  `.github/workflows/ci.yml`.
- **Acceptance check:** `npm run e2e` passes (server in reference mode, Vite preview on 28174) with five
  browser tests: reference happy path from selector to report; tamper path; matrix and history pages;
  manual-wallet modal completed by a scripted wallet; keyboard-only happy path. axe reports no serious or
  critical violations on 5 pages. `npm run build -w @inji-playground/web` puts the Inji Verify SDK in its own
  lazy chunk. `npm exec -w @inji-playground/web -- playwright test --list --project e2e-live` lists
  `sdk-verify.spec.ts`. `docs/ux/README.md` has the user flow and at least 5 screenshots captured by
  Playwright.
- **Notes:**
  - Install the browser once: `npm exec -w @inji-playground/web -- playwright install chromium`
    (`PLAYWRIGHT_BROWSERS_PATH` chooses where it goes).
  - Manual-wallet modal: large QR, deep link with copy button, live waiting status, cancel and "done"
    (`POST /api/runs/:id/person-done`). Inji Wallet mobile reads credential offers only through its in-app
    "scan credential offer" button (no offer deep link) and takes presentation requests as
    `openid4vp://authorize?...` by QR or deep link. No APK is attached to the inji-wallet GitHub releases;
    use a Play Store build or build it locally.
  - Inji Verify SDK panel: `@injistack/react-inji-verify-sdk` pinned at 0.18.1 (npm `latest` is a 1.0
    pre-release that calls endpoints verify-service 0.18.2 lacks; the SDK needs React 18). Lazy-load
    `OpenID4VPVerification` (the SDK pulls in about 2 MB of JavaScript). Set `verifyServiceUrl="/v1/verify"`
    (verify-service has no CORS support, so it must be same-origin through the playground proxy), and set
    `isSameDeviceFlowEnabled={false}` unless an Inji Web base URL is configured (the default `true` errors on
    a desktop browser). Cast the presentation definition for SD-JWT: the SDK's type allows only `ldp_vc`.
    `onVPReceived` -> `POST /api/runs/:id/verifier-callback`.
  - `QRCodeVerification` tool page: the SDK rejects uploads under 10 KB.
  - Write `e2e/live/sdk-verify.spec.ts` (project `e2e-live`, not part of `npm run e2e`): the panel draws its
    QR, the reference wallet answers through the server, the page shows `VALID`. WP-17 runs it.

### WP-17 End-to-end demo script, bundle check and test report (TODO)

- **Goal:** one command proves the demo path, and one command regenerates the test report from real
  results.
- **Depends on:** WP-10, WP-14, WP-15, WP-16.
- **Owns:** `scripts/demo.mjs`, `scripts/test-report.mjs` (both placeholders today), `docs/test-report/`,
  `docs/interop-report/live/`, `deploy/compose.yaml`, `THIRD_PARTY_LICENSES.md` (new).
- **Acceptance check:**
  - `npm run demo -- --ci --keep-up && npm run e2e:live; rc=$?; npm run down; exit $rc` brings up the
    bundle, runs `packages/cli/specs/demo.yaml`, prints `DEMO PASS` and a cell table, passes the live SDK
    browser test, tears down and exits 0.
  - `npm run matrix:live -- --spec live-core` and `npm run matrix:live -- --spec live-holder-web`, each as a
    separate stack session, write `docs/interop-report/live/matrix.md` dated that day, listing the image
    versions, every cell linked to a stored run.
  - Clean-clone check with Docker only, no host Node, from the repository root:
    `rm -rf ../ps02-clean && git clone -q . ../ps02-clean && cd ../ps02-clean && env -u PLAYGROUND_RUN_DIR docker compose -f deploy/compose.yaml --profile holder-web up --build -d --wait && curl -sf http://localhost:28100/api/health; rc=$?; env -u PLAYGROUND_RUN_DIR docker compose -f deploy/compose.yaml --profile holder-web down -v; exit $rc`
    exits 0.
  - `npm run test:report` writes `docs/test-report/README.md` dated that day with per-package totals (0
    failures), Playwright and matrix results, stack start time and memory, and a licence audit listing only
    OSI-approved licences.
- **Notes:** `npm run demo` flags: `--ci`, `--keep-up`, `--preflight` (checks Docker, free ports in
  28000-28999 and memory before a recording). The report states measured numbers only, with dates. Use the
  Vitest JSON reporter (`--reporter=json --outputFile=<file>`) to collect totals.

### WP-18 Documentation set and interoperability gap write-up with issue drafts (TODO)

- **Goal:** anyone can install, understand and evaluate the playground from the docs, and the Inji team
  gets gap reports it can act on.
- **Depends on:** WP-13, WP-17.
- **Owns:** `README.md`, `docs/` (not `docs/ux/`, `docs/interop-report/`, `docs/api/openapi.json`,
  `docs/test-report/`), `scripts/docs-check.mjs` (placeholder today).
- **Acceptance check:** `npm run docs:check` exits 0: relative links resolve; required sections exist; every
  public entry in `docs/gaps/gaps.json` has an issue draft with repository, version, steps, expected,
  actual, a case id and a date; no entry marked `"disclosure": "private"` has a draft or exploit detail in
  the repository; every command in the README exists in `package.json`. Then from a separate clone
  (`git clone . ../ps02-docs-clone && cd ../ps02-docs-clone && npm ci && npm run matrix:reference`) exits 0.
- **Notes:**
  - Docs to write: `docs/architecture.md`, `docs/flows.md`, `docs/api.md`, `docs/test-data.md`,
    `docs/extending.md` (add an implementation as a role), `docs/demo/`; update `docs/setup.md`,
    `docs/README.md` (it does not link `docs/api/README.md` yet) and the README status, flows and matrix
    sections. The ADR folder has only 0000 and 0001; records still to write: recording at three capture
    points with redaction on export; Certify in pre-authorized mode for the core stack; TLS front with a test
    CA for local did:web; `node:sqlite` for storage; two protocol profiles in the reference roles; React 18
    pin for the Inji Verify SDK; test authorization server in place of eSignet for certify-ac.
  - Gaps: `docs/gaps/README.md`, `docs/gaps/gaps.json` (id, title, repository, version, severity, linked
    matrix cells, status new or existing upstream issue), `docs/gaps/issues/NN-<repo>-<slug>.md`. Re-run each
    gap with a playground case before writing it. Link known upstream issues instead of duplicating them.
  - Security-relevant findings (G7 confirmed, or a KB-JWT that is not bound) get `"disclosure": "private"`:
    no draft in the repository; the README lists them only as "reported privately".
  - The Inji repositories moved from `github.com/mosip/*` to `github.com/inji/*`; link the new names.

## How to split the remaining work between people

Each lane owns folders; a person works only in their lane's folders. Lanes:

| Lane        | Folders it owns                                                                                                                                                                                                          | Remaining tasks            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| A-reference | `packages/formats/`, `packages/oid4vci/`, `packages/scenarios/`, `packages/cli/`, `.github/workflows/interop-nightly.yml`, `docs/interop-report/reference/`                                                              | WP-11, WP-15               |
| B-server    | root tooling files, `packages/protocol/`, `packages/server/` except `src/adapters/inji/`, `test/live/`, `test/contract/inji/`; `.github/workflows/ci.yml`; `docs/api/`                                                   | WP-08                      |
| C-web       | `packages/web/` (including `e2e/`), `docs/ux/`, `scripts/e2e.mjs`                                                                                                                                                        | WP-13, WP-16               |
| D-stack     | `deploy/`, `packages/oid4vp/`, `packages/server/src/adapters/inji/`, `packages/server/test/live/`, `packages/server/test/contract/inji/`, `scripts/` (except `e2e.mjs`), `docs/` (except the folders above), `README.md` | WP-10, WP-14, WP-17, WP-18 |

With two people:

| Person | Lanes                   | Order of work                                                                                 |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| 1      | A, B, then D            | WP-11 (merge from the branch) -> WP-08 (merge and finish) -> WP-10 -> WP-14 -> WP-17 -> WP-18 |
| 2      | C, then `packages/cli/` | WP-13 (merge and finish) -> WP-16 -> WP-15 (only `packages/cli/` and the two workflow files)  |

With three or four people, give lane D to its own person from the start; they can begin WP-10's adapter code
against recorded fixtures while WP-08 is finished, and join the live runs when it is merged.

Rules when a change must touch another lane's folder or a shared file (`package.json`, `package-lock.json`,
`README.md`, `.github/workflows/ci.yml`, `.gitguardian.yaml`): keep the change minimal, put it in your pull
request, name it in the description, and ask that lane's owner to review it. Only one open pull request at a
time may change `package-lock.json`; adding a dependency is
`npm install -w @inji-playground/<name> <package>@<version>` with both `package.json` and
`package-lock.json` committed.

## Definition of done

A task moves to DONE only when, in one pull request:

- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` and `npm run build` exit 0;
- the task's acceptance check above was run, and its key result (command, exit code, counts, date) is in the
  pull request description;
- the package README, or the doc the card names, says what was built and how to use it, and claims nothing
  that was not run; an architecture decision record is added in `docs/adr/` if a design decision was made;
- the task table in this file is updated (status, commit ids) and the card's "what remains" is cleared;
- a teammate reviewed and approved it.

## Gap ids used in commits and docs

Short ids for upstream problems found while building the stack. "Measured" means it was run and seen;
"code reading" means found in the source but not run yet.

| Id  | Component                  | Gap                                                                                                                     | Evidence     | Local state                                            |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| G1  | inji-certify sample config | `credentialOfferCache` missing from `mosip.certify.cache.names`; pre-authorized issuance fails                          | measured     | fixed in `ba25dc6`                                     |
| G2  | vc-verifier (Inji Verify)  | did:web resolved only over `https://`                                                                                   | measured     | worked around by the TLS front and test CA (`e19cb30`) |
| G3  | inji-certify sample nginx  | `/.well-known/oauth-authorization-server` at the host root is not routed                                                | measured     | fixed in `af9e36d`                                     |
| G4  | Mimoto                     | needs `display` logo, `background_color`, `text_color` on every credential configuration (optional in OpenID4VCI)       | measured     | reference issuer and seed set them                     |
| G5  | Mimoto / Inji Web          | no pre-authorized code or credential offer support                                                                      | code reading | WP-14 uses certify-ac instead                          |
| G6  | Inji Certify               | authorization-server metadata has no `authorization_endpoint`                                                           | measured     | WP-14 uses the test authorization server               |
| G7  | vc-verifier SD-JWT         | key taken from the `x5c` leaf with no chain check and no link to `iss`                                                  | code reading | `forged-x5c` scenario (WP-11) tests it                 |
| G8  | Inji Certify SD-JWT output | `typ` `vc+sd-jwt` (newer drafts use `dc+sd-jwt`), holder key as `cnf.kid`, no `iat`/`exp` unless the template adds them | measured     | open                                                   |
| G9  | inji-certify sample config | proof algorithm list says `Ed25519` where the rest of the config uses `EdDSA`; an EdDSA holder proof may be rejected    | code reading | reference wallet uses ES256                            |
| G10 | inji-verify compose        | `OVP_QR_HEADER` value missing `$`                                                                                       | code reading | fixed in our compose (`76f2b67`)                       |
| G11 | Inji Certify sample config | credential-configuration and pre-authorized-data APIs are unauthenticated                                               | measured     | local only; never expose these ports                   |

Also seen and to be written up in WP-18: the inji-verify compose `init.sql` does not match the 0.18.x schema
(500 errors on status and submission; fixed locally in `d4b9a35`); verify-service has no CORS support; the
SDK's npm `latest` tag is a pre-release that needs the 1.0 service; the SDK's presentation definition type
allows only `ldp_vc`; the SDK rejects QR uploads under 10 KB.

## Optional extras

Only after every task above is DONE:

- `mso_mdoc` as a third format in the reference roles.
- eSignet in place of the test authorization server (becomes required if certify-ac rejects its tokens).
- Inji 1.0.0-alpha.1 images as extra columns, to run the `final-1.0` profile against Inji.
- An external non-Inji implementation as a role, or the OpenID Foundation conformance suite against the
  reference roles.
- `direct_post.jwt`, `x509_san_dns` and `x509_hash` client ids in the reference roles.
- A public did:web for Certify so a phone wallet can verify `ldp_vc`.
- A second UI language with a right-to-left check.
