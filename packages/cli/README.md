# @inji-playground/cli

Headless runner for single runs and the compatibility matrix (`inji-playground run`,
`inji-playground matrix --spec <file>`, `inji-playground index --out <dir>`), used locally, in CI, by
`npm run demo` and by the nightly workflow.

`run` and `matrix` work against a running server (`--server`) or an in-process reference server
(`--reference`). The latest matrix results are in [README, Current numbers](../../README.md#current-numbers).

## Commands

```bash
npm run matrix:reference                          # specs/reference.yaml, in-process server, no Docker
npm run matrix:live -- --spec live-core           # against http://localhost:28100 with the Inji stack
npm run matrix:live -- --spec live-holder-web     # the same, server with PLAYGROUND_PUBLIC_URL=https://ref.ps02.test
node --conditions=source --import tsx packages/cli/src/main.ts run --format ldp_vc --scenario expired --reference
```

| Command                | What it does                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`                  | One cell from `--issuer`, `--wallet`, `--verifier`, `--format`, `--vci-profile`, `--vp-profile`, `--scenario`; prints `verdict=<verdict>`; exit 0 only for `pass` |
| `matrix --spec <file>` | Every cell of a spec, in order; compares each verdict and outcome with the spec; exit 1 when any cell differs                                                     |
| `index --out <dir>`    | One `matrix.md` in `<dir>` from the `matrix.json` of every folder directly below it: a summary per spec, the versions each met, every cell linked to its run file |

| Option           | Meaning                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `--server <url>` | Server to drive over REST (default `http://localhost:28100`)                                                   |
| `--reference`    | Start a server in-process instead: first free port of 28600-28699, in-memory database, temporary run directory |
| `--spec <file>`  | A spec path, or the name of a file in `specs/` (`reference`, `live-core`, `live-holder-web`, `demo`)           |
| `--out <dir>`    | Write `matrix.json`, `matrix.md` and `runs/<case id>.json` (the redacted export of each cell's run)            |
| `--junit <file>` | Also write JUnit XML (one test case per cell, a failure for each cell that differs from its spec)              |
| `--force`        | Run a live spec whose estimate is over the 20-minute budget                                                    |

Exit codes: 0 every cell as specified, 1 a cell differs (or `run` did not pass), 2 bad arguments, no
server, or a live spec over budget.

`npm run matrix:reference` writes to `docs/interop-report/reference/`. `npm run matrix:live` writes each
spec to `docs/interop-report/live/<spec>/`, because the live specs run in separate stack sessions, then
rewrites `docs/interop-report/live/matrix.md` with `index` from every spec folder there. `matrix.md` and
`matrix.json` are kept in git, and so are the live specs' `runs/` folders (about 1.4 MB per live spec, the
evidence every live cell links to); the reference `runs/` folder is not (about 5 MB per run). The nightly
workflow uploads all of them as an artifact.

## Specs

See [specs/README.md](specs/README.md). Each case has a `TC_PG_<AREA>_<NN>` id, the three roles (or
spec-wide `defaults`), format, OpenID4VP profile (the OpenID4VCI profile is paired with it), scenario, and
the expected outcome (default: the scenario's) and verdict (default `pass`). A cell matches its spec when
its verdict equals the expected verdict and, for `pass`, its outcome equals the expected outcome.

Before a run, the CLI prints an estimate: cells x the mean cell time of the last `matrix.json` in the
output folder for the same mode, else the spec's `cellSeconds`, else 2 s (reference) or 60 s (live). A live
spec over 20 minutes is refused unless `--force`.

## Workflows

- `.github/workflows/ci.yml`, job `reference matrix`: `npm run matrix:reference` on every push and pull
  request, with the matrix as the job summary.
- `.github/workflows/interop-nightly.yml` (20:30 UTC and on demand): the reference matrix, then the Inji
  stack with the `holder-web` profile, the server against it, `live-core`, the server again with
  `PLAYGROUND_PUBLIC_URL=https://ref.ps02.test`, `live-holder-web`, the
  matrices and the containers' memory as job summary, `docs/interop-report/` as an artifact, stack down.
  Passed on a GitHub-hosted runner on 2026-10-14 (run 38565031324).

## Source

| File                      | Contents                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `src/spec.ts`             | Spec schema, parsing with errors that name each problem, spec name resolution           |
| `src/client.ts`           | REST client: health, roles, scenarios, start a run, wait for it, export it              |
| `src/matrix.ts`           | Runs the cells, compares with the spec, totals, duration estimate and budget, exit code |
| `src/render.ts`           | `matrix.md`, the combined index of several specs, and JUnit XML                         |
| `src/reference-server.ts` | The in-process reference server for `--reference`                                       |
| `src/main.ts`             | Command line                                                                            |
| `scripts/matrix.mjs`      | `npm run matrix:reference` / `matrix:live`                                              |

Tests (`npm test -w @inji-playground/cli`): argument parsing; spec parsing, defaults and errors; every
spec file in `specs/` is valid; the reference spec has at least 30 cells and orders replays after their
happy cells; duration estimate and budget; a small matrix against an in-process reference server
(verdicts, expected outcomes from the catalogue, per-cell exports, exit code 1 on a mismatch, an unknown
role); Markdown and JUnit rendering; both workflow files parse as YAML.
