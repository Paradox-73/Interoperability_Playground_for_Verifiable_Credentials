# 0001. Use a TypeScript monorepo with a shared contract package

- Status: Accepted
- Date: 2026-10-04

## Context

- The playground has a browser UI, a server that orchestrates runs and records traffic, reference
  protocol implementations (issuer, wallet, verifier), a headless matrix runner and deployment scripts.
- All of them exchange the same data: role descriptions, run events, recorded HTTP exchanges and
  interoperability reports. If each part defines these shapes itself, they drift apart.
- Several people build different parts at the same time, so the shared shapes must exist, and be
  checked, before any of the parts.
- Node.js 24.19.0 is installed on the development machine, and every credential library the reference
  roles need (jose, `@sd-jwt/sd-jwt-vc`, Digital Bazaar `vc` with Ed25519Signature2020 and
  eddsa-rdfc-2022, DID resolvers, `dcql`, `@injistack/pixelpass`) passed sign-and-verify proofs of
  concept on it (2026-10-04).
- The Inji Verify React SDK 0.18.1, which the UI reuses, needs React 18 and builds with Vite and
  TypeScript 5.9 (checked 2026-10-04).

## Decision

- One repository, npm workspaces, eight packages under `packages/`: `protocol`, `formats`,
  `scenarios`, `oid4vci`, `oid4vp`, `server`, `web`, `cli`. All ES modules, TypeScript 5.9 in strict
  mode (plus `noUncheckedIndexedAccess`).
- `packages/protocol` holds every shared shape twice in one definition: a zod schema (runtime
  validation of API input, stored rows and WebSocket messages) and the TypeScript type inferred from
  it. Behaviour shared between packages (the issuer, wallet and verifier role interfaces, the run
  context) is TypeScript interfaces in the same package.
- Packages export their TypeScript sources under a `source` export condition. Vitest, the dev server
  (`tsx --conditions=source`) and the UI build read sources directly, so nothing has to be built
  before tests run. `npm run build` compiles with project references (`tsc -b`) into `dist/`, which the
  container image runs.
- One Vitest configuration (`vitest.config.ts`) with one project per package and a separate `live`
  project for tests that need the Inji stack, which `npm test` excludes. Vitest 5 has no separate
  workspace file; the `projects` list replaces it.
- Every root command calls a file, and a command that is not built yet calls a placeholder that exits
  1, so later work replaces files and never edits the root `package.json`.
- Pinned versions: TypeScript 5.9 (TypeScript 7 is out, but typescript-eslint supports below 6.1),
  ESLint 9 (eslint-plugin-jsx-a11y does not yet accept ESLint 10), React 18.3.1 forced for the whole
  tree with an npm override (otherwise libraries that accept React 18 or later pulled React 19 next to
  it and the UI tests failed with two React copies), and `@injistack/react-inji-verify-sdk` 0.18.1
  exactly (newer SDK lines call verify-service endpoints that 0.18.2 does not have).

## Alternatives considered

- **Spring Boot server (as the problem statement suggests) with a React UI:** two languages and no
  shared types between UI and server; a slower edit-and-test loop.
- **Express instead of Fastify:** no built-in request and response schemas, so no OpenAPI document
  generated from the same zod schemas.
- **Separate repositories per part:** the contracts would need publishing and versioning before any
  part could use them.
- **TypeScript types without runtime schemas:** data from Inji containers, phones and stored runs
  arrives untyped at run time; types alone would not catch a wrong shape.

## Consequences

- A change to `packages/protocol` is checked against every package by `npm run typecheck` and
  `npm test` in one run.
- Every package must keep `src/index.ts` as its entry point and add new dependencies to its own
  `package.json`.
- `@peculiar/x509` needs the `reflect-metadata` package to be loaded before it (its dependency
  tsyringe requires the Reflect metadata API); the formats test loads them in that order.
