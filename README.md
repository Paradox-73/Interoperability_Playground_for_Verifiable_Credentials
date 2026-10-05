# Inji Interoperability Playground

A visual sandbox for verifiable credentials: pick an **issuer**, a **wallet** and a **verifier**, run
issue → hold → present → verify, and inspect every protocol message on the way. The roles are the
Inji modules (Inji Certify, Inji Web through Mimoto, Inji Wallet mobile, Inji Verify) and independent,
standards-based reference implementations written for this playground, so Inji is also tested against
code that is not Inji.

MOSIP Decode 2026, problem statement 02, team Badmosip.

## Status

| Date       | State                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-04 | Repository scaffold: eight npm workspaces, the shared contracts (`packages/protocol`), a server answering `GET /api/health`, a skeleton UI, the test and build tooling, CI and image.                                                                                                                                                                                                  |
| 2026-10-05 | Every work package built and measured (branches awaiting review, [docs/STATUS.md](docs/STATUS.md)): reference roles in both protocol profiles, recording, Inji Certify, certify-ac, Inji Web through Mimoto and Inji Verify (API and web component) as roles, the UI with matrix, history, reports and gaps, the headless matrix, browser tests, the demo command and the test report. |
| 2026-10-06 | Reviewed and merged to `main`; every acceptance check run again ([docs/STATUS.md](docs/STATUS.md)). Fixed in review: redaction of PKCE verifiers, keyboard access to scrollable message bodies, a flaky browser test, the licence audit; Dependabot updates applied.                                                                                                                   |

Measured on 2026-10-06 ([test report](docs/test-report/README.md)): 972 unit and integration tests, 7
browser tests and 20 live tests against the Inji stack pass; the reference matrix has 82 of 82 cells as
specified, the live matrices 20 of 20. Nothing in this README claims more than has been run.

## Status and contributing

- [docs/STATUS.md](docs/STATUS.md): every task with its status, the unfinished work, one card per remaining
  task with its acceptance check, and how to split the work between people.
- [CONTRIBUTING.md](CONTRIBUTING.md): tools, set-up, build and test commands, the local Inji stack, commit and
  pull request rules, troubleshooting.

## Quick start (reference mode, no Docker)

Requires Node.js 24 (`.nvmrc`).

```bash
npm ci
npm run build
npm start                                   # http://localhost:28100
curl -s http://localhost:28100/api/health   # {"status":"ok",...}
```

During development, `npm run dev` starts the server from source (port 28100) and the UI with live
reload (port 28173).

## Container image

```bash
docker build -t ps02-playground:dev .
docker run --rm -p 28100:28100 ps02-playground:dev
```

## Architecture

- `packages/protocol`: contracts every package codes against (role interfaces, run events, recorded
  exchanges, interoperability report), as TypeScript types and zod schemas.
- `packages/formats`: keys, DIDs, W3C VC Data Integrity and SD-JWT VC.
- `packages/oid4vci`, `packages/oid4vp`: reference issuer, wallet clients and verifier.
- `packages/scenarios`: happy path and tamper scenarios with expected outcomes.
- `packages/server`: Fastify server: orchestrator, recording proxy, SQLite store, REST and WebSocket API.
- `packages/web`: React 18 + Vite + Tailwind UI.
- `packages/cli`: headless matrix runner.

The design decisions are recorded in [docs/adr](docs/adr/README.md).

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
| `npm run up` / `npm run down`                                                     | One-command bundle: Inji stack + playground ([docs/setup.md](docs/setup.md#one-command-bundle))                                    |
| `npm run matrix:reference` / `npm run matrix:live`                                | Headless compatibility matrix ([packages/cli](packages/cli/README.md))                                                             |
| `npm run demo`                                                                    | Checks Docker, ports and memory, starts the bundle, runs the demo cells, prints `DEMO PASS` ([scripts/demo.mjs](scripts/demo.mjs)) |
| `npm run test:report` / `npm run openapi`                                         | Dated test report in [docs/test-report/](docs/test-report/README.md) and THIRD_PARTY_LICENSES.md / OpenAPI export                  |
| `npm run docs:check`                                                              | Documentation check: links, required sections, gap issue drafts, commands                                                          |

## Flows

Each run is issue → hold → present → verify between the three chosen roles, with every HTTP message
recorded:

- **Issuance:** a credential offer with a pre-authorized code (Inji Certify, the reference issuer), or a
  wallet-initiated authorization code flow for wallets that cannot take an offer (Inji Web through Mimoto,
  with certify-ac or the reference issuer). OpenID4VCI draft 13 or 1.0.
- **Presentation:** OpenID4VP drafts 21-23 with Presentation Exchange (as Inji Verify and Inji Wallet speak
  it) or OpenID4VP 1.0 with DCQL; `ldp_vc` / `ldp_vp` and SD-JWT VC with a key binding JWT.
- **Scenarios:** the happy path, tampered credentials and presentations (expired, bad signature, altered
  disclosure, wrong key binding, replay, wrong holder) and probes, each with the outcome the specifications
  require.

Step by step, with the messages and the Inji Web specifics: [docs/flows.md](docs/flows.md). The parts and
where traffic is recorded: [docs/architecture.md](docs/architecture.md).

## Interoperability matrix and gaps

- Reference matrix (no Inji module): [docs/interop-report/reference/matrix.md](docs/interop-report/reference/matrix.md),
  82 of 82 cells as specified (2026-10-06).
- Live matrix against Inji Certify 0.14.0, certify-ac, Inji Web 0.17.0 with Mimoto 0.22.0 and Inji Verify
  0.18.2: [docs/interop-report/live/matrix.md](docs/interop-report/live/matrix.md), 20 of 20 cells as
  specified (2026-10-06). All-Inji SD-JWT VC issuance and verification is `VALID`; the cells that fail are
  blocked by recorded gaps.
- Gaps: [docs/gaps/README.md](docs/gaps/README.md) lists 23 public gaps in Inji Certify, Inji Verify and
  Mimoto, each with an issue draft (repository, version, steps, expected and actual result, playground case
  and date). Two further findings are reported privately.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Documentation index:
[docs/README.md](docs/README.md).

## Licence

MIT for the team's code ([LICENSE](LICENSE)). Files imported from upstream Inji repositories keep their
own licence (MPL-2.0), recorded next to them.
