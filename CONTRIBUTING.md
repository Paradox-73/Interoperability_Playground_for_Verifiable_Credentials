# Contributing

How to set up a computer, build and test the playground, run it, and finish a task. What is done and what
is left is in [docs/STATUS.md](docs/STATUS.md).

- [Tools](#tools)
- [One-time set-up](#one-time-set-up)
- [Build and test](#build-and-test)
- [Local Inji stack and ports](#local-inji-stack-and-ports)
- [Running the end-to-end path today](#running-the-end-to-end-path-today)
- [Repository layout](#repository-layout)
- [How packages fit together](#how-packages-fit-together)
- [Tests](#tests)
- [Conventions](#conventions)
- [Picking up a task](#picking-up-a-task)
- [Troubleshooting](#troubleshooting)

## Tools

| Tool                  | Version                                                     | Needed for                                          | Download                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Git                   | any recent; on Windows, Git for Windows (includes Git Bash) | everything                                          | <https://git-scm.com/downloads>                                                                                                                                                                              |
| Node.js with npm      | Node 24 (`.nvmrc`), which ships npm 11                      | building, tests, the server, all `npm run` commands | <https://nodejs.org/en/download>                                                                                                                                                                             |
| Docker with Compose   | Compose v2.24 or newer                                      | the local Inji stack, the bundle, image builds      | Windows and macOS: Docker Desktop <https://docs.docker.com/desktop/>; Linux: Docker Engine <https://docs.docker.com/engine/install/> and the Compose plugin <https://docs.docker.com/compose/install/linux/> |
| curl                  | any                                                         | the health checks below                             | included in Git Bash and macOS; on Linux use the distribution package                                                                                                                                        |
| Playwright Chromium   | the version `@playwright/test` asks for                     | browser tests (task WP-16 onwards)                  | installed with npm, see [Build and test](#build-and-test)                                                                                                                                                    |
| GitHub CLI (optional) | any                                                         | opening pull requests from the terminal             | <https://cli.github.com/>                                                                                                                                                                                    |

Optional version managers that read `.nvmrc`: nvm on Linux and macOS (<https://github.com/nvm-sh/nvm>,
then `nvm install && nvm use`); nvm-windows on Windows (<https://github.com/coreybutler/nvm-windows>, then
`nvm install 24` and `nvm use 24`; it does not read `.nvmrc`).

Platform differences:

- **Windows:** run every command in Git Bash; the documented commands use bash syntax (`rc=$?`, `export`).
  Docker Desktop must use Linux containers (the default, WSL 2 backend). When you type a `docker` command by
  hand that contains a container path such as `/certificates/x.crt`, prefix it with `MSYS_NO_PATHCONV=1`,
  or Git Bash rewrites the path to `C:/Program Files/Git/...`. The npm commands are not affected.
- **Linux:** add yourself to the `docker` group (<https://docs.docker.com/engine/install/linux-postinstall/>)
  so the scripts can call `docker` without `sudo`. `host.docker.internal` exists only in Docker Desktop: set
  `PLAYGROUND_REF_UPSTREAM=http://172.17.0.1:28100` (the Docker bridge address) so the stack can reach a
  playground server running on the host.
- **macOS:** Docker Desktop, same as Windows apart from the Git Bash note.
- **Memory:** the Inji stack used about 1.75-2.1 GiB in steady state (measured 2026-10-04); the Inji Web
  profile with the planned second Certify is estimated at about 3 GiB. Give Docker at least 4 GB.

## One-time set-up

```bash
git clone https://github.com/Paradox-73/Interoperability_Playground_for_Verifiable_Credentials.git
cd Interoperability_Playground_for_Verifiable_Credentials

# Commits carry your name and an address registered on your own GitHub account (needed for sign-off).
git config user.name "Your Name"
git config user.email "you@example.org"

node --version    # v24.x
npm ci            # installs every workspace from package-lock.json
npm test          # all unit and integration tests, no Docker needed
npm run build
```

Everything the playground generates at run time (SQLite database, reference keys, test CA, TLS
certificates, Mimoto's key store, smoke reports) goes to the run directory `PLAYGROUND_RUN_DIR`, default
`run/` in the clone (git-ignored). Set it to an absolute path if you want it elsewhere:

```bash
export PLAYGROUND_RUN_DIR="$HOME/ps02-run"
```

To download the Inji images before the first stack start (about 3.7 GB; the first `npm run stack:up` does it
otherwise):

```bash
for image in injistack/inji-certify-with-plugins:0.14.0 injistack/mimoto:0.22.0 injistack/inji-web:0.17.0 \
  injistack/inji-verify-service:0.18.2 injistack/inji-verify-ui:0.18.2 postgres:15 nginx:stable node:24-alpine; do
  docker pull "$image"
done
```

For browser tests (from WP-16 on), install Chromium once:

```bash
npm exec -w @inji-playground/web -- playwright install chromium
```

`PLAYWRIGHT_BROWSERS_PATH` chooses where Playwright keeps the browser, if you want it outside your home folder.

## Build and test

| Command                                   | What it does                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm ci`                                  | install exactly what `package-lock.json` lists                                        |
| `npm run build`                           | compile every package (`tsc -b`) and bundle the UI into `packages/web/dist`           |
| `npm run clean`                           | remove build output                                                                   |
| `npm run lint`                            | ESLint with type information, zero warnings allowed                                   |
| `npm run format:check` / `npm run format` | Prettier check / rewrite                                                              |
| `npm run typecheck`                       | TypeScript over the root and every workspace                                          |
| `npm test`                                | every Vitest project except `live`                                                    |
| `npm test -w @inji-playground/<folder>`   | one package, for example `npm test -w @inji-playground/server`                        |
| `npm run test:watch`                      | Vitest in watch mode                                                                  |
| `npm run test:coverage`                   | tests with coverage                                                                   |
| `npm run test:live`                       | only `packages/server/test/live/`; needs the Inji stack running                       |
| `npm run openapi`                         | writes `docs/api/openapi.json` from the route schemas                                 |
| `npm run dev`                             | server from source with reload (28100) and the UI dev server with live reload (28173) |
| `npm start`                               | the built server, serving the built UI (28100)                                        |
| `docker build -t ps02-playground:dev .`   | the playground container image                                                        |

Commands that print `not implemented yet (WP-xx)` and exit 1 belong to unfinished tasks:
`npm run smoke`, `matrix:reference`, `matrix:live`, `e2e`, `e2e:live`, `demo`, `test:report`, `docs:check`.
The task id in the message points to the card in [docs/STATUS.md](docs/STATUS.md).

Before every pull request: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.
CI (`.github/workflows/ci.yml`) runs the same on every push and pull request, plus an image build with a
health check.

## Local Inji stack and ports

The stack is the Docker Compose project `ps02-inji` (`deploy/inji-stack/compose.yaml`): Inji Certify 0.14.0,
Mimoto 0.22.0 with Inji Web 0.17.0, Inji Verify 0.18.2 (service and UI), Postgres 15 and nginx. Full guide:
[docs/setup.md](docs/setup.md); every change made to the upstream files: [deploy/inji-stack/README.md](deploy/inji-stack/README.md).

| Command                                                   | What it does                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run stack:init`                                      | create the test CA and TLS certificate (one-shot `init` service)                               |
| `npm run stack:up`                                        | init, start, wait until every service answers, including the slow first Certify call           |
| `npm run stack:status`                                    | container state and one probe per service (`-- --json` for machine output)                     |
| `npm run stack:smoke`                                     | start, issue and verify one credential per format, check every service, always stop            |
| `npm run stack:down`                                      | stop and remove containers and volumes (`-- --keep-volumes` keeps the data)                    |
| `node deploy/inji-stack/scripts/stack.mjs logs [service]` | compose logs                                                                                   |
| `node deploy/inji-stack/scripts/stack.mjs verify-imports` | check that the upstream files entered git unchanged; prints `IMPORTS MATCH`                    |
| `npm run up` / `npm run down`                             | the bundle (`deploy/compose.yaml`, project `ps02-bundle`): stack plus the playground container |

The npm stack commands start every profile (`holder-web` for Mimoto and Inji Web, `verify-ui` for the Inji
Verify web page). `PLAYGROUND_STACK_PROFILES=none` starts only the core (Certify, Inji Verify service,
Postgres, nginx). `npm run up` builds the playground image from the last commit (`git archive HEAD`); add
`-- --worktree` to include uncommitted changes. Always end a session with `npm run stack:down` or
`npm run down`.

Ports (all in 28000-28999):

| Port        | Service                                                       |
| ----------- | ------------------------------------------------------------- |
| 28100       | playground server: UI, API, WebSocket, proxy, reference roles |
| 28173       | Vite dev server (`npm run dev`)                               |
| 28174       | Vite preview for Playwright                                   |
| 28600-28699 | listeners started by tests and by `npm run smoke`             |
| 28091       | certify-nginx, Certify's public HTTP entry                    |
| 28090       | Certify directly, on 127.0.0.1 (debug, stack only)            |
| 28093       | certify-ac (debug; added by WP-14)                            |
| 28443       | TLS front: HTTPS for the `*.ps02.test` names                  |
| 28080       | Inji Verify service                                           |
| 28030       | Inji Verify UI (`verify-ui` profile)                          |
| 28099       | Mimoto (`holder-web` profile)                                 |
| 28004       | Inji Web (`holder-web` profile)                               |
| 28432       | Postgres, on 127.0.0.1 (debug, stack only)                    |
| 28200-28209 | reserved for an eSignet stack if it is ever needed            |

Environment variables read by the server (`packages/server/src/config/index.ts`) and the stack scripts
(`deploy/inji-stack/scripts/lib/env.mjs`, `scripts/bundle.mjs`):

| Variable                                                                                                             | Default                                | Meaning                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `PLAYGROUND_RUN_DIR`                                                                                                 | `run/` in the clone                    | folder for everything generated at run time; use an absolute path                     |
| `PLAYGROUND_PORT`, `PLAYGROUND_HOST`                                                                                 | `28100`, `127.0.0.1`                   | where the server listens (`0.0.0.0` to reach it from a phone on the LAN)              |
| `PLAYGROUND_STACK`                                                                                                   | `off`                                  | whether the Inji stack is expected and where: `off`, `host`, `bundle`                 |
| `PLAYGROUND_PUBLIC_URL`                                                                                              | unset                                  | URL the stack and phones use to reach the server (a LAN address when a phone is used) |
| `PLAYGROUND_DB`                                                                                                      | `<run dir>/playground.db`              | SQLite file; `:memory:` keeps nothing                                                 |
| `PLAYGROUND_GAPS_FILE`                                                                                               | `docs/gaps/gaps.json`                  | gap register served by `GET /api/gaps`                                                |
| `PLAYGROUND_FAKE_ROLES`                                                                                              | off                                    | `1` registers development-only fake roles ("Test role (fake)")                        |
| `PLAYGROUND_TIMEOUT_REFERENCE_MS` / `_INJI_MS` / `_PERSON_MS`                                                        | 15000 / 90000 / 600000                 | step timeouts                                                                         |
| `PLAYGROUND_LOG_LEVEL`                                                                                               | `info`                                 | server log level                                                                      |
| `PLAYGROUND_STACK_PROFILES`                                                                                          | `holder-web,verify-ui`                 | profiles the npm stack and bundle commands start; `none` for the core only            |
| `PLAYGROUND_REF_UPSTREAM`                                                                                            | `http://host.docker.internal:28100`    | where the TLS front sends `ref.ps02.test` in host mode                                |
| `INJI_VERIFY_SUBMISSION_BASE_URL`                                                                                    | `http://verify-service:8080/v1/verify` | `response_uri` base Inji Verify gives wallets                                         |
| `INJI_CERTIFY_URL`, `INJI_VERIFY_URL`, `INJI_MIMOTO_URL`, `INJI_WEB_URL`, `INJI_VERIFY_UI_URL`, `INJI_TLS_FRONT_URL` | the host ports above                   | host URLs the stack scripts probe                                                     |
| `PLAYGROUND_STACK_SAVE_LOGS`                                                                                         | unset                                  | `1` keeps compose logs of a passing smoke run                                         |
| `PLAYGROUND_IMAGE`                                                                                                   | `ps02-playground:bundle`               | image tag the bundle builds and runs                                                  |
| `PLAYWRIGHT_BASE_URL`                                                                                                | `http://localhost:28174`               | where Playwright points; `http://localhost:28100` for the bundle                      |

Added on the unfinished branch `wip/2026-10-04-stop` (WP-08), not on `main` yet: `PLAYGROUND_PROXY_TIMEOUT_MS`,
`PLAYGROUND_NETWORK_MAP` (host mode: `deploy/inji-stack/network-map.host.json`), `PLAYGROUND_EXTRA_CA` (for
example `$PLAYGROUND_RUN_DIR/stack/ca/ps02-test-ca.crt`), `PLAYGROUND_REF_ISSUER_DID` (`did:key`, `did:jwk` or
`did:web`), and the server's own `INJI_CERTIFY_URL`, `INJI_CERTIFY_AC_URL`, `INJI_VERIFY_URL`, `INJI_MIMOTO_URL`
for the reverse proxy.

## Running the end-to-end path today

What works, as of 2026-10-04:

1. **Playground in reference mode (`main`).** Server and UI start; no real roles are registered on `main`.

   ```bash
   npm run build && npm start
   curl -s http://localhost:28100/api/health     # {"status":"ok",...}
   ```

   To click through the UI before real roles exist, start with the development-only fake roles:
   `PLAYGROUND_FAKE_ROLES=1 npm run dev`, then open <http://localhost:28173>.

2. **Inji Certify -> Inji Verify (`main`, Docker).** `npm run stack:smoke` issues an `ldp_vc` and a
   `vc+sd-jwt` from Certify through the OpenID4VCI pre-authorized code flow with a scripted wallet, verifies
   both with Inji Verify, checks Mimoto, Inji Web and the Inji Verify UI, and stops the stack. It printed
   `SMOKE PASS` in 166 s on 2026-10-04. The report with every request and response is in
   `$PLAYGROUND_RUN_DIR/stack/smoke/`.

3. **Reference issuer -> reference wallet -> reference verifier (branch `wip/2026-10-04-stop`, no Docker).**
   On that branch a run through the API completes. Run on 2026-10-04 (server on port 28655):

   ```bash
   PLAYGROUND_PORT=28655 node --conditions=source --import tsx packages/server/src/main.ts &
   curl -s -X POST http://localhost:28655/api/runs -H 'content-type: application/json' \
     -d '{"issuer":"ref-issuer","wallet":"ref-wallet","verifier":"ref-verifier","format":"vc+sd-jwt"}'
   # {"runId":"..."}
   curl -s http://localhost:28655/api/runs/<runId>/report.json   # outcome VALID, verdict pass
   curl -s http://localhost:28655/api/runs/<runId>/exchanges     # 7 recorded exchanges
   ```

   The 7 exchanges were tagged `issuer.offer`, `issuer.metadata`, `as.metadata`, `token`, `credential`,
   `wallet.fetch-request`, `wallet.submit`.

Not working yet: Inji roles inside a playground run (WP-10, WP-14), tamper scenarios through the server
(WP-08 wiring after WP-11), matrix, history and report pages (WP-13), the phone path and Inji Verify SDK panel
(WP-16), `npm run smoke`, matrix, demo and report commands.

## Repository layout

| Path                 | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `packages/protocol`  | Contracts shared by every package: types and zod schemas. Change with care.    |
| `packages/formats`   | Keys, DIDs, credential formats (`src/tamper/` for tamper functions)            |
| `packages/oid4vci`   | Reference OpenID4VCI issuer, test authorization server, wallet issuance client |
| `packages/oid4vp`    | Reference OpenID4VP verifier and wallet presentation client                    |
| `packages/scenarios` | Happy path, tamper and probe scenarios with expected outcomes                  |
| `packages/server`    | Fastify server; Inji adapters in `src/adapters/inji/`                          |
| `packages/web`       | React UI; Playwright tests in `e2e/` (live tests in `e2e/live/`)               |
| `packages/cli`       | Headless matrix runner                                                         |
| `deploy/`            | Docker Compose for the Inji stack and the bundle                               |
| `scripts/`           | Root command implementations                                                   |
| `docs/`              | Documentation; decisions in `docs/adr/`; status in `docs/STATUS.md`            |

Every root `npm run` command calls a file. A command that is not built yet calls a placeholder that
prints `not implemented yet (WP-xx)` and exits 1; implementing it means replacing that file, not
editing `package.json`.

## How packages fit together

- Packages are ES modules in strict TypeScript 5.9. Import other packages by name
  (`@inji-playground/protocol`), never by relative path across packages.
- Each package exports `src/index.ts` under the `source` condition. Tests, `npm run dev` and the UI
  build read sources directly; `npm run build` compiles to `dist/` with project references
  (`tsconfig.build.json`), which `npm start` and the container image run.
- Each package has `tsconfig.json` (type check of `src/`, `test/` and `scripts/`, no output) and
  `tsconfig.build.json` (compiles `src/` only).

## Tests

- Vitest runs every package as one project named after its folder (`vitest.config.ts`).
  `npm test -w @inji-playground/<name>` runs one package; `npx vitest run --project <name>` does the same
  from the root.
- `packages/server/test/live/` holds tests that need the Inji stack; `npm test` skips them and
  `npm run test:live` runs only them, one file at a time.
- `deploy/inji-stack/scripts/test/` is the Vitest project `deploy` (stack script tests, no Docker needed).
- Playwright projects: `e2e` (reference mode, no Docker) and `e2e-live` (needs the bundle).
- Test data that imitates protocol payloads is named `*.synthetic.json`. The UI only ever shows
  recorded exchanges; synthetic data is for tests.
- Test names say which specification rule they check, where there is one.
- Server tests have a 20 s timeout and web tests 30 s, because building the app on a cold module cache took
  over 5 s on a busy laptop.

## Conventions

- **Commit messages:** conventional prefixes `feat:`, `fix:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`,
  `import:`. A fix for a known upstream gap names its id (for example `fix: G3 route ...`); the ids are listed
  in [docs/STATUS.md](docs/STATUS.md#gap-ids-used-in-commits-and-docs).
- **Sign-off:** every commit is signed off (Developer Certificate of Origin) with `git commit -s`, from your own
  GitHub account: `user.email` must be an address on that account. Forgot it on the last commit:
  `git commit --amend -s --no-edit`; on several: `git rebase --signoff origin/main`.
- **Pull requests:** small, one task (or one part of a task) each, from a branch off `main`, reviewed and
  approved by a teammate before merging. Never push to `main` directly. Do not squash an `import:` commit
  together with later changes.
- **Upstream code:** files from upstream Inji repositories are first committed unchanged, alone, as
  `import: upstream <repo>@<commit> (<licence>)`; every change to them is a later, separate commit, so the
  team's diff stays visible. Copy them from git objects, never from a working tree (on Windows,
  `core.autocrlf=true` checks clones out with CRLF line endings and changes every line):

  ```bash
  git -C <upstream-clone> cat-file blob <commit>:<path> > <destination>
  git hash-object --no-filters <destination>          # must equal:
  git -C <upstream-clone> rev-parse <commit>:<path>
  ```

  Record the file, repository, path, commit, blob id and licence in `deploy/inji-stack/UPSTREAM.md`, then
  `node deploy/inji-stack/scripts/stack.mjs verify-imports` must print `IMPORTS MATCH`. This repository's
  `.gitattributes` (`* -text`) stores every file byte for byte.

- **No secrets in git:** never commit keys, passwords, tokens or `.env` files. Generated material goes to
  `PLAYGROUND_RUN_DIR`. Upstream sample values inside imported files are listed in `.gitguardian.yaml`
  before the import commit. Look at `git diff --cached` before every commit.
- **Licences:** dependencies must be OSI-approved (MIT, Apache-2.0, BSD, ISC, MPL-2.0, ...). The team's code is
  MIT; imported upstream files keep MPL-2.0.
- **Dependencies:** add to the package that uses it, `npm install -w @inji-playground/<name> <pkg>@<version>`,
  and commit `package.json` and `package-lock.json` with the code that needs it. Never delete
  `package-lock.json`. Pinned on purpose: React 18 (root `overrides`) and `@injistack/react-inji-verify-sdk`
  0.18.1 (needs React 18, matches verify-service 0.18.2), TypeScript 5.9, ESLint 9.
- **Docs:** describe only what was run; mark anything else as planned. Every measured number carries its
  date. Comments in code explain why, not what.
- **Code style:** `npm run lint` and `npm run format:check` must pass (Prettier, print width 110, single
  quotes).

## Picking up a task

1. Open [docs/STATUS.md](docs/STATUS.md), choose a TODO or PARTIAL task whose dependencies are DONE, and check
   with the team that nobody else owns its lane right now (the lane table in that file says which folders
   each lane owns).
2. Branch off the latest `main`:

   ```bash
   git fetch origin
   git switch -c wp-10-inji-adapters origin/main
   ```

3. For a PARTIAL task, copy its paths from `origin/wip/2026-10-04-stop` as the "State of the unfinished
   branch" section of `docs/STATUS.md` shows, and commit them first as they are
   (`git commit -s -m "feat: ... (work from wip/2026-10-04-stop)"`), so reviewers can tell old work from new.
4. Work only in the folders the card lists. A minimal change to another lane's folder or a shared file
   (`package.json`, `package-lock.json`, `README.md`, `ci.yml`, `.gitguardian.yaml`) goes in your pull
   request with a note, and that lane's owner reviews it.
5. Run the checks before every push:
   `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.
6. Run the card's acceptance check. Commands that start Docker must end with `npm run stack:down` or
   `npm run down`, even when they fail (the cards use `...; rc=$?; npm run stack:down; exit $rc`).
7. Update the package README or the doc the card names, and in `docs/STATUS.md` set the status and commit ids
   and clear the card's "what remains".
8. Push and open a pull request titled `WP-xx: <title>`. In the description: what changed, the acceptance
   command, its exit code and key numbers with the date, and anything left open. A teammate reviews and
   merges.

## Troubleshooting

| Symptom                                                                                          | Cause and fix                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A probe waits for Certify for minutes                                                            | The first Certify start creates its keys and the first metadata call is slow (52 s on 2026-10-04; a cold image start took 231 s). `stack:up` waits up to 10 minutes per service.                                                                                                     |
| Inji Verify says `INVALID` for the Certify `ldp_vc`                                              | verify-service cannot fetch `https://certify.ps02.test/.well-known/did.json` (gap G2). Check its log for `Adding certificate with alias PS02 Playground Test CA (test only) to the JVM truststore` and that `tls-front` is healthy; `npm run stack:init` recreates the certificates. |
| Certify `POST /pre-authorized-data` fails with `credentialOfferCache not available`              | Gap G1: the cache name is missing. The fix is in `deploy/inji-stack/config/certify-default.properties`; keep it when editing that file.                                                                                                                                              |
| Inji Verify status poll or submission returns 500, log `column ... response_code does not exist` | The database was created from the old compose `init.sql`. The stack creates it from `sql/inji_verify/db.sql` and `ddl.sql`; run `npm run stack:down` (removes volumes) and start again.                                                                                              |
| Mimoto rejects an issuer (`RESIDENT-APP-041`)                                                    | Gap G4: a credential configuration lacks `display` logo, `background_color` or `text_color`. Add them to every configuration.                                                                                                                                                        |
| Mimoto gets 404 on `/.well-known/oauth-authorization-server`                                     | Gap G3: Mimoto asks at the host root. `nginx/certify-nginx.conf` routes it to Certify; do the same for any new issuer behind nginx.                                                                                                                                                  |
| Mimoto `/actuator/health` answers 503                                                            | Expected: it reports Redis as down. The APIs work; the stack checks `/v1/mimoto/issuers` instead.                                                                                                                                                                                    |
| Certify answers 200 with `unknown_claims`                                                        | The wallet asked for claims the configuration does not advertise. Request only advertised claims.                                                                                                                                                                                    |
| Certify rejects the holder proof                                                                 | Use ES256 with a `did:jwk` key id (the combination Certify accepted); an EdDSA proof may fail on the sample config (G9).                                                                                                                                                             |
| Inji Verify SDK in the browser: `Failed to fetch` or `403 Invalid CORS request`                  | verify-service has no CORS support. Point the SDK at `/v1/verify` on the playground's own origin, never at port 28080.                                                                                                                                                               |
| SDK session never completes over plain http                                                      | The `transaction_id` cookie is `Secure` by default; the stack sets `INJI_VERIFY_COOKIE_SECURE_VALUE=false`, and the proxy must keep the path `/v1/verify`.                                                                                                                           |
| SDK calls `/v2/vp-session-request` and gets 404                                                  | A 1.0 pre-release of `@injistack/react-inji-verify-sdk` was installed (npm `latest`). Keep the exact pin `0.18.1`.                                                                                                                                                                   |
| React 19 appears in `node_modules`                                                               | The root `overrides` pin React 18.3.1; run `npm ci` again and do not remove the overrides.                                                                                                                                                                                           |
| `@peculiar/x509` fails as soon as it is loaded                                                   | `reflect-metadata` must be imported before it (the formats package and the root do this).                                                                                                                                                                                            |
| An imported upstream file does not match its blob id                                             | It was copied from a working tree with CRLF line endings. Copy it again with `git cat-file blob` (see [Conventions](#conventions)).                                                                                                                                                  |
| `npm run up` does not show your change                                                           | The bundle builds from the last commit. Commit first, or use `npm run up -- --worktree`.                                                                                                                                                                                             |
| Bind-mount errors with a relative `PLAYGROUND_RUN_DIR`                                           | Compose resolves relative paths against the compose file. Use an absolute path.                                                                                                                                                                                                      |
| Paths like `C:/Program Files/Git/...` inside a container                                         | Git Bash rewrote a container path in a hand-typed `docker` command. Prefix it with `MSYS_NO_PATHCONV=1`.                                                                                                                                                                             |
| `ref.ps02.test` does not reach the playground on Linux                                           | Set `PLAYGROUND_REF_UPSTREAM=http://172.17.0.1:28100`.                                                                                                                                                                                                                               |
| Port already in use                                                                              | `npm run stack:status` shows what runs; stop it with `npm run stack:down` or `npm run down`.                                                                                                                                                                                         |
| Tests time out on a slow machine                                                                 | Close other heavy programs and run one package at a time (`npm test -w @inji-playground/<name>`).                                                                                                                                                                                    |
| Vite warns about a large Mermaid chunk during the UI build                                       | Expected: a 662 kB chunk inside Mermaid, loaded only when a diagram is shown.                                                                                                                                                                                                        |
