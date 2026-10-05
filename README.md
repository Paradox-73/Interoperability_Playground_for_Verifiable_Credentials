# Inji Interoperability Playground

A visual sandbox for verifiable credentials: pick an **issuer**, a **wallet** and a **verifier**, run
issue → hold → present → verify, and inspect every protocol message on the way. The roles are the
Inji modules (Inji Certify, Inji Web through Mimoto, Inji Wallet mobile, Inji Verify) and independent,
standards-based reference implementations written for this playground, so Inji is also tested against
code that is not Inji.

MOSIP Decode 2026, problem statement 02, team Badmosip.

## Status

| Date       | State                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-04 | Repository scaffold: eight npm workspaces, the shared contracts (`packages/protocol`), a server answering `GET /api/health`, a skeleton UI, the test and build tooling, CI and image. |

Commands that print `not implemented yet (WP-xx)` exist so the command list below is complete; the
named work package replaces them. Nothing below claims more than has been run.

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

| Command                                                                           | What it does                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                                                                     | Server from source with reload (28100) and the UI dev server (28173)                            |
| `npm start`                                                                       | Built server, serving the built UI (28100)                                                      |
| `npm run build`                                                                   | Compile every package (`tsc -b`) and bundle the UI                                              |
| `npm run lint` / `npm run format:check` / `npm run typecheck`                     | ESLint, Prettier, TypeScript                                                                    |
| `npm test`                                                                        | All unit and integration tests (Vitest), without the live Inji stack                            |
| `npm run test:live`                                                               | Tests against the running Inji stack                                                            |
| `npm run smoke`                                                                   | One reference run end to end, printing the recorded exchanges and the verdict                   |
| `npm run e2e` / `npm run e2e:live`                                                | Browser tests (not implemented yet)                                                             |
| `npm run stack:init` / `stack:up` / `stack:down` / `stack:status` / `stack:smoke` | Local Inji stack ([docs/setup.md](docs/setup.md#local-inji-stack))                              |
| `npm run up` / `npm run down`                                                     | One-command bundle: Inji stack + playground ([docs/setup.md](docs/setup.md#one-command-bundle)) |
| `npm run matrix:reference` / `npm run matrix:live`                                | Headless compatibility matrix ([packages/cli](packages/cli/README.md))                          |
| `npm run demo`                                                                    | Demo check before recording (not implemented yet)                                               |
| `npm run test:report` / `npm run docs:check` / `npm run openapi`                  | Test report, documentation check, OpenAPI export (not implemented yet)                          |

## Flows

To be written with the flows themselves.

## Interoperability matrix and gaps

Reference matrix (no Inji module): [docs/interop-report/reference/matrix.md](docs/interop-report/reference/matrix.md),
run on 2026-10-05, 82 of 82 cells as specified. The live matrix against Inji Certify, Inji Verify and Inji
Web follows with the Inji adapters (WP-10, WP-14); the gaps found so far are listed in
[docs/STATUS.md](docs/STATUS.md#gap-ids-used-in-commits-and-docs).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Documentation index:
[docs/README.md](docs/README.md).

## Licence

MIT for the team's code ([LICENSE](LICENSE)). Files imported from upstream Inji repositories keep their
own licence (MPL-2.0), recorded next to them.
