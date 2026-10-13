# Inji Interoperability Playground

A web app for testing verifiable credentials across systems. You pick an **issuer**, a **wallet** and a
**verifier**, run issue → hold → present → verify, and read every protocol message on the way. The roles are
the Inji modules (Inji Certify, Inji Web through Mimoto, Inji Wallet mobile, Inji Verify) and independent
reference implementations written for this playground, so Inji is also tested against code that is not Inji.

MOSIP Decode 2026, problem statement 02 (Interoperability Playground for Verifiable Credentials), team Badmosip.

## Start it

Needs Docker Desktop (or Docker Engine with Compose 2.24 or newer), Node.js 24, Git and about 4 GB of memory
for Docker.

```bash
npm ci
npm run demo      # checks Docker, ports and memory, starts Inji Certify, Mimoto, Inji Web, Inji Verify and the playground,
                  # runs five live cells, prints DEMO PASS, leaves the bundle up on http://localhost:28100
npm run down      # stops and removes everything
```

`npm run demo` took 384 s from a clean checkout on 2026-10-14 (the bundle was up after 156 s). `npm run up`
starts the same bundle without running the cells. Without Docker, the reference roles alone run with
`npm ci && npm run build && npm start`, then open <http://localhost:28100>. More modes and troubleshooting:
[docs/setup.md](docs/setup.md). A teammate's pre-recording checklist for macOS, Linux and Windows:
[docs/manual-test-checklist.md](docs/manual-test-checklist.md).

## What it covers

| Dimension           | Covered                                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issuers             | Inji Certify 0.14.0 (pre-authorized code), certify-ac (authorization code), reference issuer (did:key, did:jwk, did:web)                                                                                                                             |
| Wallets             | Inji Web 0.17.0 through Mimoto 0.22.0, reference wallet (headless), browser wallet (Digital Credentials API), phone wallet by QR code or deep link (Inji Wallet mobile: the step exists, no phone run yet)                                           |
| Verifiers           | Inji Verify 0.18.2 (API and the `react-inji-verify-sdk` web component), reference verifier, reference verifier over the Digital Credentials API                                                                                                      |
| Credential formats  | `ldp_vc` (W3C VC 1.1 and 2.0, Ed25519 and ECDSA Data Integrity), `vc+sd-jwt` and `dc+sd-jwt` (SD-JWT VC), `mso_mdoc` (ISO/IEC 18013-5)                                                                                                               |
| Protocol profiles   | OpenID4VCI draft 13 with OpenID4VP drafts 21-23 and Presentation Exchange (the Inji profile), and OpenID4VCI 1.0 with OpenID4VP 1.0 and DCQL ([ADR 0006](docs/adr/0006-two-protocol-profiles.md))                                                    |
| Presentation flows  | Cross-device QR code, same-device deep link, W3C Digital Credentials API                                                                                                                                                                             |
| Tamper scenarios    | 21 scenarios, among them `expired`, `bad-signature`, `altered-disclosure`, `kb-wrong-nonce`, `vp-replay`, `holder-mismatch`, `forged-x5c`, `self-issued`, `issuer-name-borrowed` and `revoked`; each states the outcome a correct verifier must give |
| Reports and history | A pass/fail report per run (Markdown, JSON, redacted export), a compatibility matrix, a history page with filters, playback of stored runs                                                                                                           |
| Protocol inspector  | Every HTTP message of every run, decoded (JWT, SD-JWT disclosures, CBOR, JSON-LD), plus an animated sequence diagram                                                                                                                                 |
| Gap register        | 29 findings in Inji Certify, Inji Verify and Mimoto, 27 public with an issue draft ([docs/gaps](docs/gaps/README.md)), 2 reported privately                                                                                                          |

## Where each task of the problem statement is shown

| Task in the problem statement                             | Evidence                                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Inji stack running end to end                          | `npm run stack:smoke` prints `SMOKE PASS` ([docs/setup.md](docs/setup.md#local-inji-stack)); Inji Certify credential verified `SUCCESS` by Inji Verify in both formats                  |
| M2 Three-column issuer, wallet, verifier selector         | Playground page, [screenshot](docs/ux/screenshots/1-playground.png), [docs/ux/README.md](docs/ux/README.md)                                                                             |
| M3 Live issue flow with offer, token exchange, credential | Run page and inspector; [docs/flows.md](docs/flows.md)                                                                                                                                  |
| M4 Live present and verify with Valid, Invalid, Expired   | Inji Certify → reference wallet → Inji Verify `VALID`; `expired` gives `EXPIRED` ([live matrix](docs/interop-report/live/matrix.md), cells `TC_PG_LIVE_01`, `_07`)                      |
| M5 Protocol inspector                                     | Inspector on every run page, [screenshot](docs/ux/screenshots/2-timeline-and-inspector.png)                                                                                             |
| M6 Two formats end to end, labelled per run               | `ldp_vc` and `vc+sd-jwt` at Inji Certify → Inji Verify (`TC_PG_LIVE_01`, `_02`); `mso_mdoc` and `dc+sd-jwt` for the reference roles; the run bar and the report name the format         |
| M7 Pass/fail report per run                               | `/runs/<id>/report`, [screenshot](docs/ux/screenshots/3-report.png), `npm run matrix:reference` writes one per cell                                                                     |
| G1 Non-Inji mock in the matrix                            | Reference issuer, wallet and verifier, written from the specifications and not from Inji code ([reference matrix](docs/interop-report/reference/matrix.md))                             |
| G2 mDoc as third format                                   | 20 reference cells `TC_PG_MDOC_*`; Inji Certify's mock mDoc measured live (gaps G26-G29 block the Inji verifier side)                                                                   |
| G3 Animated Mermaid sequence diagram                      | Run page and playback page                                                                                                                                                              |
| G4 Replay and tamper                                      | Scenario picker on the run bar and "Replay with tamper" on the report page                                                                                                              |
| G5 History dashboard with filters                         | History page, [screenshot](docs/ux/screenshots/6-history.png)                                                                                                                           |
| G6 Same-device flow and Digital Credentials API           | `TC_PG_DCAPI_01-05`, [screenshot](docs/ux/screenshots/13-dc-api.png)                                                                                                                    |
| B1 CI-style suite with nightly matrix                     | `.github/workflows/interop-nightly.yml`, replayed locally ([nightly-replay.md](docs/test-report/nightly-replay.md)); hosted runs: see [Continuous integration](#continuous-integration) |
| B2 Gaps contributed as issues                             | 27 issue drafts in [docs/gaps/issues](docs/gaps/issues/). They are not filed yet, because the repository stays private until submission.                                                |
| B3 Telemetry                                              | Metric tiles and step timings on the history page. No Obsrv or Druid.                                                                                                                   |
| B4 One-command Docker Compose bundle                      | `npm run up`, `npm run demo`                                                                                                                                                            |
| Deliverable: demo video of 3-5 minutes                    | Shot list in [docs/video-script.md](docs/video-script.md)                                                                                                                               |

## Current numbers

All measured on 2026-10-14 at commit `812aaaa` or later, on Windows 11 with Docker Desktop (8 GB), Node 24.

| Check                                             | Result                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm test` (unit and integration)                 | 1203 of 1203 tests, 79 files                                                 |
| `npm run e2e` (browser, axe accessibility checks) | see the [test report](docs/test-report/README.md)                            |
| `npm run test:live` (against the Inji stack)      | 20 of 20, 60 s                                                               |
| `npm run matrix:reference` (no Docker)            | 123 of 123 cells as specified: 119 pass, 4 not supported                     |
| `npm run matrix:live` (`live-core`)               | 16 of 16 as specified: 11 pass, 4 fail, 1 not supported, 0 error; 1 min 18 s |
| `npm run matrix:live -- --spec live-holder-web`   | 10 of 10 as specified: 4 pass, 6 fail; 43 s                                  |
| `npm run stack:smoke` (every profile)             | `SMOKE PASS`, 207 s                                                          |
| `npm run demo -- --ci`                            | `DEMO PASS`, 5 of 5 cells                                                    |
| `npm audit`                                       | 0 vulnerabilities                                                            |

"As specified" means the cell gave the verdict its spec file expects. A cell that expects `fail` is a gap
in an Inji module that the playground found and recorded; it is not a playground failure. The live matrix
files are in [docs/interop-report/live](docs/interop-report/live/matrix.md) and the full test report is in
[docs/test-report](docs/test-report/README.md).

## Known limits

- **Inji Wallet mobile was not run.** No APK is published and no phone was available. The playground shows
  the QR code and link for it (`mobile-wallet` role), but no run with a phone is recorded.
- **No status check for `mso_mdoc`.** The reference verifier checks Token Status Lists (SD-JWT VC) and
  Bitstring Status Lists (`ldp_vc`). For an mdoc the report says the status was not checked. Inji Verify and
  Inji Certify were not tested for revocation, because the local Inji Certify issues no status entries.
- **DNS rebinding is not blocked.** The reference verifier refuses private, loopback and link-local addresses
  when it fetches a `did:web` document or a status list, but it resolves the name again when the request is
  made. Remote JSON-LD contexts (live mode) have no address or size limit.
- **mdoc over the Digital Credentials API is not done**, and Inji Web cannot present SD-JWT VC (G25) or
  hold an mdoc (G29). Inji Verify cannot verify an mdoc presentation (G28).
- **The API on port 28100 has no login.** It listens on 127.0.0.1 by default; the container image listens on
  all interfaces inside the container. See [SECURITY.md](SECURITY.md).
- **Findings are not filed upstream yet.** The 27 drafts wait for the repository to become public.

## Continuous integration

Hosted GitHub Actions cannot run since 2026-10-09: a billing problem on the GitHub account stops every job
before it starts, so the current `main` has no green hosted run. The last green hosted `ci` run was on
2026-10-06 (commit `c3f4189`) and the last green `interop-nightly` run on 2026-10-08. Local runs replace
hosted CI until the account is fixed: the commands in the table above, and `node scripts/nightly-replay.mjs`,
which runs the nightly workflow's jobs on this machine step by step.

## Architecture

- `packages/protocol`: contracts every package codes against (role interfaces, run events, recorded
  exchanges, interoperability report), as TypeScript types and zod schemas.
- `packages/formats`: keys, DIDs, W3C VC Data Integrity, SD-JWT VC, mdoc, status lists, limited fetch.
- `packages/oid4vci`, `packages/oid4vp`: reference issuer, wallet clients and verifier.
- `packages/scenarios`: happy path and tamper scenarios with expected outcomes.
- `packages/server`: Fastify server with the orchestrator, recording proxy, SQLite store, REST and WebSocket API.
- `packages/web`: React 18, Vite and Tailwind UI.
- `packages/cli`: headless matrix runner.
- `deploy/inji-stack`: the Docker Compose project for the Inji modules, with the upstream configuration
  imported unchanged and every local change listed in `UPSTREAM.md`.

The parts and where traffic is recorded: [docs/architecture.md](docs/architecture.md). Design decisions:
[docs/adr](docs/adr/README.md). API: [docs/api.md](docs/api.md) and [docs/api/openapi.json](docs/api/openapi.json).
Test data and credentials: [docs/test-data.md](docs/test-data.md).

## Commands

| Command                                                                           | What it does                                                                                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                                     | Server from source with reload (28100) and the UI dev server (28173)                                                               |
| `npm start`                                                                       | Built server, serving the built UI (28100)                                                                                         |
| `npm run build`                                                                   | Compile every package (`tsc -b`) and bundle the UI                                                                                 |
| `npm run lint` / `npm run format:check` / `npm run typecheck`                     | ESLint, Prettier, TypeScript                                                                                                       |
| `npm test`                                                                        | All unit and integration tests (Vitest), without the live Inji stack                                                               |
| `npm run test:live`                                                               | Tests against the running Inji stack                                                                                               |
| `npm run smoke`                                                                   | One reference run end to end, printing the recorded exchanges and the verdict                                                      |
| `npm run e2e` / `npm run e2e:live`                                                | Browser tests: reference mode (no Docker) / against the bundle or a host-mode server on 28100                                      |
| `npm run stack:init` / `stack:up` / `stack:down` / `stack:status` / `stack:smoke` | Local Inji stack ([docs/setup.md](docs/setup.md#local-inji-stack))                                                                 |
| `npm run up` / `npm run down`                                                     | One-command bundle: Inji stack and playground ([docs/setup.md](docs/setup.md#one-command-bundle))                                  |
| `npm run matrix:reference` / `npm run matrix:live`                                | Headless compatibility matrix ([packages/cli](packages/cli/README.md))                                                             |
| `npm run demo`                                                                    | Checks Docker, ports and memory, starts the bundle, runs the demo cells, prints `DEMO PASS` ([scripts/demo.mjs](scripts/demo.mjs)) |
| `npm run test:report` / `npm run openapi`                                         | Dated test report in [docs/test-report/](docs/test-report/README.md) and THIRD_PARTY_LICENSES.md / OpenAPI export                  |
| `node scripts/nightly-replay.mjs`                                                 | Runs the nightly workflow's jobs locally ([docs/test-report/nightly-replay.md](docs/test-report/nightly-replay.md))                |
| `npm run docs:check`                                                              | Documentation check: links, required sections, gap issue drafts, commands                                                          |

## Flows

Each run is issue → hold → present → verify between the three chosen roles, with every HTTP message recorded.

- **Issuance.** A credential offer with a pre-authorized code (Inji Certify, the reference issuer), or a
  wallet-initiated authorization code flow for wallets that cannot take an offer (Inji Web through Mimoto,
  with certify-ac or the reference issuer).
- **Presentation.** OpenID4VP drafts 21-23 with Presentation Exchange, or OpenID4VP 1.0 with DCQL, for
  `ldp_vp`, SD-JWT VC with a key binding JWT, and `mso_mdoc` (DeviceResponse).
- **Same device and browser.** Deep links, the Inji Verify web component's same-device switch, and
  OpenID4VP over `navigator.credentials.get()`, with the verifier binding the answer to the page's origin.
- **Scenarios.** The happy path, tampered credentials and presentations, and probes, each with the outcome
  the specifications require.

Step by step, with the messages and the Inji Web specifics: [docs/flows.md](docs/flows.md).

## Project documents

[docs/STATUS.md](docs/STATUS.md) lists every task and what is left. [CONTRIBUTING.md](CONTRIBUTING.md) covers
tools, set-up and commit rules. [SECURITY.md](SECURITY.md) lists the protections and their limits.
[docs/README.md](docs/README.md) is the index of all documentation.

## Licence

MIT for the team's code ([LICENSE](LICENSE)). Files imported from upstream Inji repositories keep their
own licence (MPL-2.0), recorded next to them.
