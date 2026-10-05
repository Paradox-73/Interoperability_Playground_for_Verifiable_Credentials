# 0005. Store runs in SQLite through node:sqlite

- Status: Accepted
- Date: 2026-10-04

## Context

- Runs, events and exchanges must survive a restart and be queried for history, matrix and metrics. The server runs on Windows laptops, in Docker and in CI.
- Native SQLite add-ons need a compiler or prebuilt binaries for each platform and Node version.

## Decision

- One SQLite file through Node 24's built-in `node:sqlite` (`DatabaseSync`), with migrations and all SQL in `packages/server/src/store/`. `PLAYGROUND_DB=:memory:` for tests and throw-away servers.

## Alternatives considered

- **better-sqlite3:** a native add-on to build or download per platform.
- **Postgres:** another service to run for a single-user playground.
- **JSON files:** no queries for history and matrix.

## Consequences

- Node prints an experimental-feature warning for `node:sqlite`; the scripts set `NODE_NO_WARNINGS=1` where the output is read.
- Node 24 is required (`.nvmrc`, `engines`).
