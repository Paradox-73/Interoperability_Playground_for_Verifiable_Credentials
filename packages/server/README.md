# @inji-playground/server

The playground server (Fastify): REST and WebSocket API, run orchestrator, recording proxy, SQLite
store (Node's built-in `node:sqlite`), hosted reference roles and the Inji adapters.

Status (2026-10-04): `GET /api/health`, the built UI served with client-side route fallback,
configuration from environment variables, and an empty Inji adapter registry
(`src/adapters/inji/index.ts`).

| Variable                | Default                    | Meaning                                           |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| `PLAYGROUND_PORT`       | `28100`                    | Port of UI, API and WebSocket                     |
| `PLAYGROUND_HOST`       | `127.0.0.1`                | Interface to listen on (`0.0.0.0` in the image)   |
| `PLAYGROUND_RUN_DIR`    | `<repo>/run`               | Database, generated keys and certificates         |
| `PLAYGROUND_WEB_DIST`   | `<repo>/packages/web/dist` | Built UI to serve                                 |
| `PLAYGROUND_STACK`      | `off`                      | `off`, `host` or `bundle`                         |
| `PLAYGROUND_PUBLIC_URL` | (none)                     | URL phones and containers use to reach the server |
| `PLAYGROUND_LOG_LEVEL`  | `info`                     | Log level                                         |

Tests: `test/` runs with `npm test`; `test/live/` needs the Inji stack and runs with
`npm run test:live`.
