# Contributing

## Set-up

- Node.js 24 (`.nvmrc`) and npm 11. Docker is needed only for the Inji stack and the bundle.
- `npm ci` once. Then `npm run dev` for development, `npm test` before every commit.
- Ports: everything this project starts uses 28000-28999 (server 28100, UI dev server 28173, UI
  preview 28174, test listeners 28600-28699). Docker Compose project names start with `ps02-`.

## Repository layout

| Path                 | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `packages/protocol`  | Contracts shared by every package: types and zod schemas. Change with care.    |
| `packages/formats`   | Keys, DIDs, credential formats                                                 |
| `packages/oid4vci`   | Reference OpenID4VCI issuer, test authorization server, wallet issuance client |
| `packages/oid4vp`    | Reference OpenID4VP verifier and wallet presentation client                    |
| `packages/scenarios` | Happy path and tamper scenarios                                                |
| `packages/server`    | Fastify server; Inji adapters in `src/adapters/inji/`                          |
| `packages/web`       | React UI; Playwright tests in `e2e/` (live tests in `e2e/live/`)               |
| `packages/cli`       | Headless matrix runner                                                         |
| `deploy/`            | Docker Compose for the Inji stack and the bundle                               |
| `scripts/`           | Root command implementations                                                   |
| `docs/`              | Documentation; decisions in `docs/adr/`                                        |

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
  `npm test -w @inji-playground/<name>` runs one package.
- `packages/server/test/live/` holds tests that need the Inji stack; `npm test` skips them and
  `npm run test:live` runs only them.
- Playwright projects: `e2e` (reference mode, no Docker) and `e2e-live` (needs the bundle).
- Test data that imitates protocol payloads is named `*.synthetic.json`. The UI only ever shows
  recorded exchanges; synthetic data is for tests.
- Test names say which specification rule they check, where there is one.

## Dependencies

- Licences must be OSI-approved (MIT, Apache-2.0, BSD, ISC, MPL-2.0, ...).
- Add a dependency to the package that uses it: `npm install -w @inji-playground/<name> <pkg>@<version>`,
  then commit `package.json` and `package-lock.json` together with the code that needs it.
- Pinned on purpose: React 18 and `@injistack/react-inji-verify-sdk` 0.18.1 (the SDK needs React 18
  and matches verify-service 0.18.2), TypeScript 5.9, ESLint 9. See `docs/adr/`.

## Commits

- Conventional messages: `feat:`, `fix:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`, `import:`.
- Sign off every commit (Developer Certificate of Origin): `git commit -s`.
- Files from upstream Inji repositories are first committed unchanged as
  `import: upstream <repo>@<commit> (<licence>)`, copied from git objects so line endings stay as
  published; every change to them is a separate commit, so the team's diff stays visible.
- Never commit keys, passwords or tokens. Generated material goes to the run directory
  (`PLAYGROUND_RUN_DIR`, default `./run`, git-ignored).

## Code style

- `npm run lint` (ESLint with type information) and `npm run format:check` (Prettier) must pass.
- Comments explain why, not what. Every number taken from a measurement carries its date.
- Docs describe only what has been run; mark anything else as planned.
