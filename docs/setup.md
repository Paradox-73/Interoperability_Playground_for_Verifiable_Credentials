# Set-up

How to install and run the playground, alone or with a local Inji stack. Every number on this page was
measured on the date given next to it; nothing here claims more than was run.

- [Prerequisites](#prerequisites)
- [Run modes](#run-modes)
- [Local Inji stack](#local-inji-stack)
- [One-command bundle](#one-command-bundle)
- [Ports](#ports)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| What                               | Needed for                                            | Version used by the team                                                       |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Node.js and npm                    | reference mode, the stack and bundle commands         | Node 24.21 or newer with npm 11.19 or newer (`.nvmrc`)                         |
| Docker with Compose v2.24 or newer | the local Inji stack and the bundle                   | Docker Desktop 29 (Linux containers)                                           |
| Git                                | `npm run up` builds the image from `git archive HEAD` | any recent                                                                     |
| Memory for Docker                  | the stack                                             | about 2.7 GiB in use with every profile, see [memory](#memory-and-start-times) |

Only Docker is needed to run the bundle from a clone (see [without Node](#without-node)).

## Run modes

| Mode         | What runs                                           | Docker | Command                                                      |
| ------------ | --------------------------------------------------- | ------ | ------------------------------------------------------------ |
| Reference    | playground server with the reference roles only     | no     | `npm ci && npm run build && npm start`                       |
| Host + stack | playground server on the host, Inji stack in Docker | yes    | `npm run stack:up`, then `PLAYGROUND_STACK=host npm run dev` |
| Bundle       | Inji stack and the playground container             | yes    | `npm run up`                                                 |

The playground answers on <http://localhost:28100> in every mode.

## Local Inji stack

The stack is the Docker Compose project `ps02-inji` in
[`deploy/inji-stack/compose.yaml`](../deploy/inji-stack/compose.yaml): Inji Certify 0.14.0, Mimoto 0.22.0 with
Inji Web 0.17.0, and Inji Verify 0.18.2 (service and UI), with one Postgres 15 and nginx. Which upstream files
it uses, and every change made to them, is in [`deploy/inji-stack/README.md`](../deploy/inji-stack/README.md)
and [`UPSTREAM.md`](../deploy/inji-stack/UPSTREAM.md).

### Commands

| Command                                                   | What it does                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run stack:init`                                      | creates the test CA and the TLS certificate (one-shot `init` service)                                 |
| `npm run stack:up`                                        | init, start, wait until every service answers on its host port, including the slow first Certify call |
| `npm run stack:status`                                    | container state and one probe per service (`-- --json` for machine output)                            |
| `npm run stack:smoke`                                     | start, issue and verify one credential per format, check every service, always stop                   |
| `npm run stack:down`                                      | stop and remove containers and volumes (`-- --keep-volumes` keeps the data)                           |
| `node deploy/inji-stack/scripts/stack.mjs wait`           | wait for a stack that is already starting                                                             |
| `node deploy/inji-stack/scripts/stack.mjs seed`           | add the SD-JWT credential configuration again (`up` does it)                                          |
| `node deploy/inji-stack/scripts/stack.mjs logs [service]` | compose logs                                                                                          |
| `node deploy/inji-stack/scripts/stack.mjs verify-imports` | prove the upstream files entered git unchanged; prints `IMPORTS MATCH`                                |

### Services and profiles

`docker compose up` without `--profile` starts only the services that have no profile, so the core always
runs and the rest is opt-in. The npm commands start every profile unless `PLAYGROUND_STACK_PROFILES` says
otherwise (for example `PLAYGROUND_STACK_PROFILES=none` for the core only).

| Profile           | Services                                                                                      | Use                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| core (no profile) | `init`, `database`, `certify`, `certify-nginx`, `certify-seed`, `tls-front`, `verify-service` | issuance with Certify, verification with Inji Verify |
| `holder-web`      | `database-ac`, `certify-ac`, `certify-ac-seed`, `mimoto-service`, `inji-web`                  | the Inji Web wallet, and certify-ac to feed it       |
| `verify-ui`       | `verify-ui`                                                                                   | the Inji Verify web page                             |

### What the smoke test checks

`npm run stack:smoke` starts the stack, runs these checks from the host, writes a JSON report with every
request and response to `$PLAYGROUND_RUN_DIR/stack/smoke/`, and always brings the stack down:

1. Certify issuer metadata answers 200 and lists `FarmerCredential` (`ldp_vc`) and `FarmerSdJwt` (`vc+sd-jwt`).
2. The TLS front serves the DID document of `did:web:certify.ps02.test` over HTTPS.
3. For each format: `POST /v1/certify/pre-authorized-data`, credential offer, token, credential
   (OpenID4VCI pre-authorized code flow, holder key P-256 bound as `did:jwk`, ES256 proof).
4. Inji Verify `POST /v1/verify/vc-verification` returns `SUCCESS` for both credentials.
5. Inji Verify `POST /v1/verify/vp-request` answers 201 and the status poll 200.
6. Mimoto `/v1/mimoto/issuers`, Inji Web (and its `/v1/mimoto/` proxy) and the Inji Verify UI answer 200.

It prints `SMOKE PASS` when all pass. The only failure it tolerates is Inji Verify answering `INVALID` for the
`ldp_vc` because it cannot resolve the issuer's did:web (gap G2); it then prints
`SMOKE PASS (known failure: G2)`.

### Run-time material

Nothing secret is in git. The `init` service and the Mimoto wrapper create, in `$PLAYGROUND_RUN_DIR/stack/`:

| Path                                                                                | What                                                                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ca/ps02-test-ca.crt`                                                               | test CA certificate, trusted by verify-service and Mimoto (`USE_SYSTEM_CA_CERTS=1`) and by the playground (`NODE_EXTRA_CA_CERTS`) |
| `ca-private/ca.key`                                                                 | test CA key                                                                                                                       |
| `tls/server.crt`, `tls/server.key`                                                  | TLS front certificate for `certify.ps02.test`, `certify-ac.ps02.test`, `verify.ps02.test`, `ref.ps02.test`                        |
| `mimoto/oidckeystore.p12`, `mimoto/oidckeystore.password`, `mimoto/oidc-client.crt` | Mimoto's client key store, its random password and certificate                                                                    |
| `smoke/*.json`, `logs/*.log`                                                        | smoke reports, and compose logs of failed smoke runs                                                                              |

## One-command bundle

[`deploy/compose.yaml`](../deploy/compose.yaml) (project `ps02-bundle`) includes the stack and adds the
`playground` container on port 28100.

| Command                      | What it does                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run up`                 | build the playground image from the last commit (`git archive HEAD`), start stack and playground, wait until all answer |
| `npm run up -- --build-only` | build the image only; no container starts                                                                               |
| `npm run up -- --worktree`   | build from the working tree, including uncommitted changes                                                              |
| `npm run up -- --no-build`   | start with the image that is already there                                                                              |
| `npm run down`               | stop and remove the bundle's containers and volumes                                                                     |

Building from the last commit keeps unfinished work in a shared working tree out of the image.

### Without Node

On a machine with only Docker, from a clone of the repository:

```bash
docker compose -f deploy/compose.yaml --profile holder-web --profile verify-ui up --build
docker compose -f deploy/compose.yaml --profile '*' down --volumes
```

The `init` service makes the certificates and the Mimoto wrapper its key store, so nothing has to be
prepared on the host. Run-time material goes to `run/` in the clone unless `PLAYGROUND_RUN_DIR` (an absolute
path) says otherwise.

## Ports

All host ports are in the project range 28000-28999.

| Port  | Service                                         | Mode          |
| ----- | ----------------------------------------------- | ------------- |
| 28100 | playground: UI, API, WebSocket, reference roles | all           |
| 28173 | Vite dev server (`npm run dev`)                 | host          |
| 28091 | certify-nginx: Certify's public HTTP entry      | stack, bundle |
| 28443 | tls-front: HTTPS for the `*.ps02.test` names    | stack, bundle |
| 28080 | Inji Verify service                             | stack, bundle |
| 28030 | Inji Verify UI (`verify-ui` profile)            | stack, bundle |
| 28099 | Mimoto (`holder-web` profile)                   | stack, bundle |
| 28004 | Inji Web (`holder-web` profile)                 | stack, bundle |
| 28093 | certify-ac on 127.0.0.1 (`holder-web` profile)  | stack, bundle |
| 28090 | Certify directly, on 127.0.0.1 (debug)          | stack only    |
| 28432 | Postgres, on 127.0.0.1 (debug)                  | stack only    |

## Environment variables

| Variable                                                                                                             | Default                              | Meaning                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| `PLAYGROUND_RUN_DIR`                                                                                                 | `<repo>/run`                         | everything generated at run time; must be absolute when compose is used directly |
| `PLAYGROUND_STACK_PROFILES`                                                                                          | `holder-web,verify-ui`               | profiles the npm commands start; `none` for the core only                        |
| `PLAYGROUND_REF_UPSTREAM`                                                                                            | `http://host.docker.internal:28100`  | where the TLS front sends `ref.ps02.test` in host mode                           |
| `INJI_VERIFY_SUBMISSION_BASE_URL`                                                                                    | `https://verify.ps02.test/v1/verify` | `response_uri` base Inji Verify gives wallets; set a LAN address for a phone     |
| `INJI_CERTIFY_URL`, `INJI_VERIFY_URL`, `INJI_MIMOTO_URL`, `INJI_WEB_URL`, `INJI_VERIFY_UI_URL`, `INJI_TLS_FRONT_URL` | the host ports above                 | host URLs the stack scripts probe                                                |
| `PLAYGROUND_STACK_SAVE_LOGS`                                                                                         | unset                                | `1` keeps the compose logs of a passing smoke run too                            |
| `PLAYGROUND_IMAGE`                                                                                                   | `ps02-playground:bundle`             | image tag the bundle builds and runs                                             |

## Memory and start times

Measured on this team's Windows 11 laptop (Docker Desktop 29, 8 GB Docker VM shared with other projects),
images already pulled:

| Item                                                                                                     | Measured                                                                                                                                | Date       |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `npm run stack:smoke`, all profiles: every service answering on its host port                            | 80 s after `up` (Certify 73 s, Mimoto 80 s)                                                                                             | 2026-10-04 |
| `npm run stack:smoke` from start to the stack being removed                                              | 166 s, `SMOKE PASS`                                                                                                                     | 2026-10-04 |
| Inji Verify `/vc-verification` of the Certify `ldp_vc` (did:web over the TLS front) / of the `vc+sd-jwt` | 2.9 s / 0.08 s, both `SUCCESS`                                                                                                          | 2026-10-04 |
| Inji Verify `vp-request` status long poll with no wallet answering                                       | 56.5 s (55 s timeout configured)                                                                                                        | 2026-10-04 |
| `npm run up` (bundle, all profiles): stack and playground answering                                      | 194 s                                                                                                                                   | 2026-10-04 |
| Memory of the stack in steady state (research trial, same images)                                        | about 1.75-2.1 GiB: Mimoto 636-921 MiB, Certify 621-696 MiB, verify-service 305-359 MiB, Postgres 88-121 MiB, each nginx 10-15 MiB      | 2026-10-04 |
| Memory with every profile, after live runs (`docker stats`)                                              | about 2.7 GiB: Mimoto 762 MiB, Certify 714 MiB, certify-ac 647 MiB, verify-service 400 MiB, both Postgres 123 MiB, nginx 12-20 MiB each | 2026-10-05 |
| `holder-web` profile on its own (Mimoto, certify-ac, `database-ac`, Inji Web)                            | about 1.46 GiB                                                                                                                          | 2026-10-05 |
| Cold first start of the images (research trial)                                                          | Certify 231 s, verify-service 297 s                                                                                                     | 2026-10-04 |

The whole acceptance check (smoke, then bundle up, health check, bundle down) took 8 min 19 s.

## Troubleshooting

| Symptom                                                                    | Cause and fix                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A probe waits for Certify for minutes                                      | The first Certify start creates its keys and the first metadata call is slow (52 s in the 2026-10-04 research trial). `stack:up` waits up to 10 minutes per service.                                                                                                                       |
| Inji Verify says `INVALID` for the Certify `ldp_vc`                        | verify-service cannot fetch `https://certify.ps02.test/.well-known/did.json`. Check that its log has `Adding certificate with alias PS02 Playground Test CA (test only) to the JVM truststore` and that `tls-front` is healthy; `npm run stack:init` recreates the certificates.           |
| Mimoto `/actuator/health` answers 503                                      | Expected: it reports Redis as down. The APIs work; the stack checks `/v1/mimoto/issuers` instead.                                                                                                                                                                                          |
| Bind-mount errors with a relative `PLAYGROUND_RUN_DIR`                     | Compose resolves relative paths against the compose file. Use an absolute path (the npm commands do this for you).                                                                                                                                                                         |
| Paths like `C:/Program Files/Git/...` inside a container                   | Git Bash rewrote a container path in a `docker` command typed by hand. Prefix it with `MSYS_NO_PATHCONV=1`; the npm commands are not affected.                                                                                                                                             |
| `ref.ps02.test` does not reach the playground on Linux                     | `host.docker.internal` comes from Docker Desktop. Set `PLAYGROUND_REF_UPSTREAM` to the host bridge address, for example `http://172.17.0.1:28100`.                                                                                                                                         |
| Inji Web runs fail at the token or credential step                         | certify-ac and Mimoto reach the playground at `https://ref.ps02.test`, and certify-ac accepts only tokens whose issuer is `https://ref.ps02.test/ref/as`. Run the playground on 28100 with `PLAYGROUND_PUBLIC_URL=https://ref.ps02.test` (the bundle uses it by default since 2026-10-06). |
| `docker restart` of Mimoto exits at once                                   | The image's CA entrypoint stops when the test CA alias is already in the JVM trust store. Recreate the container instead: `docker compose -p ps02-inji ... up -d --force-recreate mimoto-service`, or `npm run stack:down` and `npm run stack:up`.                                         |
| Mimoto sign-in answers 500 for a user who signed in before                 | Gap G21: the first ID token lacked `picture` or `phone_number`. The playground's test identity now has both; remove a stale user with `npm run stack:down` and `npm run stack:up` (the Mimoto database is recreated).                                                                      |
| Mimoto `RESIDENT-APP-028` for certify-ac's SD-JWT                          | Mimoto started before `certify-ac-seed` added the configuration. The stack now starts Mimoto after the seed; for a stack started by hand, recreate `mimoto-service`.                                                                                                                       |
| Mimoto `signature_verification_failed` on an `ldp_vc` download             | Mimoto fetches the credential's JSON-LD contexts from the internet on every download, and a context host answered HTTP 429 (seen once on 2026-10-05, in its log as `LOADING_REMOTE_CONTEXT_FAILED`). Wait a minute and run again.                                                          |
| `npm ci` says the lock file is not in sync ("Missing: ... from lock file") | The npm of an older Node 24 (npm 11.6.2 with Node 24.11.1) reads the lock file differently. npm 11.19.0 (Node 24.21.0, the image build) and 11.21.0 accept it (measured 2026-10-05). Update Node 24, or run `npx -y npm@11.21.0 ci`; do not regenerate the lock file for it.               |
| Port already in use                                                        | Another stack uses a port of the table above. `npm run stack:status` shows what is running; stop it with `npm run stack:down` or `npm run down`.                                                                                                                                           |
