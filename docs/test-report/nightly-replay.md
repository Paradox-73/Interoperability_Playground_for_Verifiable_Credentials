# Nightly workflow, run locally

The nightly interoperability workflow (`.github/workflows/interop-nightly.yml`) has two jobs: `reference` (the
reference matrix, no Docker) and `live` (the Inji stack in Docker and both live matrices). Both were run on
2026-10-06 on the development laptop (Windows 11, Docker Desktop 29.7 with 8 GB, Node 24.19.0), at commit
`373518a` plus the workflow change of the same day.

## Results

| Job         | How it was run                                                                     | Result                                                                 | Time  |
| ----------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----- |
| `reference` | nektos/act 0.2.89 (`act workflow_dispatch -j reference -P ubuntu-latest=node:24-bookworm --pull=false`) | every step succeeded; reference matrix 84 of 84 as specified           | about 95 s |
| `reference` | `node scripts/nightly-replay.mjs`                                                  | every step succeeded; 84 of 84                                         | 74 s  |
| `live`      | `node scripts/nightly-replay.mjs`                                                  | every step succeeded; live-core 14 of 14, live-holder-web 8 of 8; the failure gate step skipped | 139 s |

The replay wrote `run/nightly-replay/result.json` (each step with its outcome and seconds). Steps of the `live`
job, in seconds: `npm ci` 56.7, `npm run build` 7.1, start the Inji stack 6.6 (it was already running; a cold
start took 87 s the same day), start the playground server 3.8, live-core matrix 22.8, live-holder-web matrix
31.4, job summary 2.4, stop server and stack 7.7.

## Why two ways

- act runs a job in a container like a hosted runner, with `actions/checkout`, `actions/setup-node` and
  `actions/upload-artifact` (to `--artifact-server-path`). That works for `reference`.
- The `live` job starts the Inji stack with `docker compose` and drives it on `localhost` ports. Inside an act
  container on Docker Desktop neither the Docker CLI nor the published ports of the stack are reachable, so
  `scripts/nightly-replay.mjs` runs the job's `run` steps in order on the host, with the job and step `env`,
  `if:` conditions, `continue-on-error` and `$GITHUB_STEP_SUMMARY` handled as a runner does. Its rules are
  in the file header; `deploy/inji-stack/scripts/test/nightly-replay.test.mjs` checks them against the
  workflow.

## What the replay changed in the workflow

- One playground server with `PLAYGROUND_PUBLIC_URL=https://ref.ps02.test` for both live specs, instead of a
  server without it for live-core and a restart for live-holder-web. Inji Verify resolves the reference
  issuer's `did:web` and contexts through `ref.ps02.test`, and certify-ac accepts only tokens issued there;
  `npm run test:live` failed 1 to 5 of 20 tests without the public URL on 2026-10-06.
- The server is stopped in the last `always()` step. On Windows `kill` of the background job does not stop
  the node process npm started; the replay stops what a job left listening on 28100.

## Not measured

- A GitHub-hosted runner: the repository stays private until submission and the workflow has not run on
  GitHub. Whether the 7 GB of a hosted runner holds the stack (2.5 GiB measured locally) is still open.
- The Linux bridge address `PLAYGROUND_REF_UPSTREAM=http://172.17.0.1:28100`: Docker Desktop has no such
  bridge, so the replay used `http://host.docker.internal:28100`, which the TLS front also resolves.
