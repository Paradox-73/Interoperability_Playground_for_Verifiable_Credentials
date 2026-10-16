# @inji-playground/web

The playground UI: React 18, Vite, Tailwind CSS 4, TanStack Query, zustand, react-router 7, i18next.
It talks only to the playground server on its own origin (REST under `/api`, run events on `/ws`).

```bash
npm run dev -w @inji-playground/web     # dev server on 28173; /api, /ws, /v1/verify, /ref, /proxy go to 28100
npm run build -w @inji-playground/web   # bundle into dist/, which the server serves
npm test -w @inji-playground/web        # unit and page tests (Vitest, jsdom, Testing Library, MSW)
```

`PLAYGROUND_SERVER_URL` points the dev server at another server address.

## What the first page does

| Area          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar       | Product name, mode badge (Live when an Inji module is selected, Reference otherwise, Playback when a stored run is replayed), navigation, theme choice (system / light / dark, remembered in `localStorage`).                                                                                                                                                                                                                                                                                                                                                                       |
| Status strip  | One chip per service: the playground server (`GET /api/health`), each Inji container (`GET /api/stack/status`), and the live-update WebSocket. Each chip shows an icon and a status word.                                                                                                                                                                                                                                                                                                                                                                                           |
| Role selector | Three columns (Issuer → Wallet → Verifier) of cards from `GET /api/roles`: name, "Inji" / "Reference (non-Inji)" / "External (non-Inji)" tag, version, health, how the role runs, format and proof chips. Each column is a native radio group, so arrow keys move between cards.                                                                                                                                                                                                                                                                                                    |
| Compatibility | A card that cannot work with the other two selections stays visible, gets a dashed frame and says why in words. Reasons come from two places: an instant check of the role descriptors in the browser (shared format, OpenID4VCI and OpenID4VP version, credential offer versus wallet-initiated issuance), and `GET /api/compatibility`, which adds what only the server knows (blocking reasons and warnings, with gap register ids).                                                                                                                                             |
| Default       | On the first visit: healthy Inji modules in every column (PS02 task 2), choosing a combination that works together and prefers roles that run without a person; else the reference roles. The person's own choice is never overridden.                                                                                                                                                                                                                                                                                                                                              |
| Run bar       | Credential format and protocol versions, limited to values every selected role supports; a scenario picker (happy path, then the tamper and probe scenarios of `GET /api/scenarios` that fit the format, grouped by what they corrupt) with the expected outcome, the reason and the specification text shown before the run; Run posts the configuration with the scenario to `POST /api/runs`, and the server's compatibility check includes the scenario. After the run, the expected outcome is shown next to the actual one. When Run is disabled, the text under it says why. |
| Live timeline | Follows the run over the WebSocket: one row per step with the plain-language label first and the protocol term second, status icon and word, duration, error code and message, the specification section that defines the step, and the verdict at the end. `/runs/:id` shows the same timeline for any run.                                                                                                                                                                                                                                                                        |
| Other routes  | `/runs` (history), `/runs/:id/report` (report), `/matrix`, `/gaps`, `/about` (what the playground is, how capture works, every role's version), and a not-found page.                                                                                                                                                                                                                                                                                                                                                                                                               |

## Evidence pages

| Route              | Source                              | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/matrix`          | `GET /api/matrix`                   | Rows are issuer → wallet → verifier, columns format × OpenID4VP profile. Each cell is an icon plus a word ("Pass", "Fail", "Error", "Not supported", "Not tested") and a frame colour, links to the newest run's report, shows run counts and the error or the blocking reason, and can run again ("Run cell", "Run row"). Red cells link to `/gaps?cell=<id>`. Filters (roles, format, profile, mode, scenario, hide not supported) live in the page address. Markdown download of the same matrix. |
| `/runs`            | `GET /api/runs`, `GET /api/metrics` | Metric tiles (finished runs, success rate, verdict counts), step timings (p50, p95), and a paged table of stored runs, newest first, with links to each report and timeline. Filters (roles, version, format, scenario, outcome, verdict, mode, UTC days) live in the address; the metrics ignore the outcome and verdict filters.                                                                                                                                                                   |
| `/runs/:id/report` | `GET /api/runs/{id}/report.json`    | The mandatory fields (issuer, wallet, verifier, format, proof type, outcome, error detail with a link to the failing message), expected versus actual outcome with an explanation, run details, step table with specification links, Markdown / JSON / redacted export downloads, print, and "Replay with tamper" (`POST /api/runs` with `replayOf`). A run that has not finished says so.                                                                                                           |
| `/gaps`            | `GET /api/gaps`                     | The gap register (`docs/gaps/gaps.json`); from a matrix cell, only the gaps whose cell patterns match it. Entries marked private show only id, repository and severity.                                                                                                                                                                                                                                                                                                                              |

Evidence pages refetch when any run finishes (`features/history/live-refresh.ts`), so a cell run from the
matrix turns green or red without a reload.

## Accessibility

- Every status is an icon plus a word, never colour alone.
- Finished steps, person actions and the run result are announced through one polite `aria-live`
  region (`src/app/LiveAnnouncer.tsx`).
- Skip link, one `h1` per page, page titles, labelled form controls, visible focus ring, reduced
  motion respected.
- Colour tokens for both themes are in `src/index.css`. `test/theme-contrast.test.ts` reads that file
  and checks WCAG 2.2 AA contrast for every text colour on every background (4.5:1) and for control
  borders and the focus ring (3:1), because jsdom cannot measure rendered colours.
- `test/playground.test.tsx` runs axe-core on the playground page before and after a run, and
  `test/evidence-pages.test.tsx` on the matrix, history and report pages.

## Source layout

```
src/
  App.tsx, main.tsx          providers (query client, socket, router) and start-up
  api/                       http.ts (JSON client), queries.ts (TanStack Query hooks and keys),
                             socket.ts (reconnecting WebSocket client), compatibility.ts
  app/                       shell, top bar, status strip, live region, icons, routes
  features/selector/         role cards, local compatibility check, default selection
  features/run-bar/          run settings and the Run button
  features/timeline/         live timeline and its WebSocket subscription
  features/matrix/           compatibility matrix page, filters and the grid layout (pure functions)
  features/history/          history dashboard, filters in the address, metric tiles, live refresh
  features/report/           run report page and the status and outcome badges shared by all pages
  features/tamper/           scenario picker, expected outcome, expected vs actual, replay with tamper
  features/gaps/             gap register page and cell pattern matching
  pages/                     one component per route
  state/                     zustand stores (selection, run events, announcer) and run-view.ts,
                             the pure function that turns run events into timeline rows
  theme/                     light / dark preference
  i18n/, locales/en.json     every user-visible string
test/
  fixtures/roles.synthetic.json   made-up role catalogue for tests (named *.synthetic.json)
  fixtures/evidence.ts            made-up runs, metrics, matrix, report, gaps and scenarios, parsed
                                  with the protocol schemas
  msw/                            mock server (REST and WebSocket) used by every page test
```

```
src/inspector/             protocol inspector, run explorer (diagram + inspector, one selection)
src/sequence/              Mermaid sequence diagram, built from recorded exchanges, lazy-loaded
src/playback/              /runs/:id/playback: stored run replayed step by step
```

How the inspector, the diagram and playback work: [`src/inspector/README.md`](src/inspector/README.md).

`src/features/manual-wallet/` (phone step modal) and `src/features/inji-verify-sdk/` (the official Inji
Verify component, lazy-loaded in its own chunk) complete the run page.

## How the parts fit

- **Server data** goes through TanStack Query (`api/queries.ts`); every response is parsed with the
  zod schemas of `@inji-playground/protocol`, so a server that drifts from the contract shows an
  error instead of half-rendered data. Role health is refetched every 15 s, the stack every 10 s.
- **Run events** arrive on one WebSocket (`api/socket.ts`). It connects on the first subscription,
  subscribes per run id (reference-counted), reconnects with exponential back-off and jitter
  (0.5 s doubling to 10 s), and subscribes again after a reconnect. The server then resends the
  run's stored events; `state/run-events.ts` drops exact duplicates, so nothing is shown or
  announced twice.
- **The timeline** is `buildRunView(runId, events)`, a pure reducer. The same function will serve
  stored runs and playback.
- **The compatibility endpoint** shape follows the server's `CompatibilityResultSchema`
  (`runnable`, `reasons[]` with `code`, `severity`, `message`, `roles`, `gapIds`). It is checked by
  hand in `api/compatibility.ts` until that schema is published in the contract package; an endpoint
  that is missing or answers an error adds no reasons, and the local check still works.

## Translations

All strings are in `src/locales/en.json`. Keys are type-checked (`src/i18n/i18next.d.ts`), so a
misspelt key fails `npm run typecheck`. A new language is one more JSON file registered in
`src/i18n/index.ts`.

## Tests

`npm test -w @inji-playground/web` runs this package's tests; the counts are in the
[test report](../../docs/test-report/README.md#unit-and-integration-tests-per-package). The run explorer, the playback page and Mermaid load on demand, so they stay out of the main
chunk; Vite warns about one chunk over 500 kB, a shared chunk inside Mermaid that loads only after Mermaid
itself.

Page tests get 30 s each and `findBy*` / `waitFor` 5 s (`vite.config.ts`, `test/setup.ts`), because the
defaults (5 s, 1 s) failed while other packages were building on the same machine, with no fault in the page.

| File                                                                                | What it checks                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/playground.test.tsx`                                                          | Three columns from `/api/roles`; incompatible card reasons (local and server); default selection and fallback; Run posts the configuration; run bar errors; timeline from WebSocket events; announcements; axe                                                                                                 |
| `test/evidence-pages.test.tsx`                                                      | Matrix cells as icon and word linked to their run, filters in the API query, run cell; history table, filters in the API query; report mandatory fields, downloads, expected vs actual, replay with tamper; gaps for a cell; run bar scenario picker and expected vs actual; axe on matrix, history and report |
| `test/app-shell.test.tsx`                                                           | Routes and page titles, navigation, about page, status strip, theme switch                                                                                                                                                                                                                                     |
| `test/theme-contrast.test.ts`                                                       | AA contrast of every token pair in both themes                                                                                                                                                                                                                                                                 |
| `src/api/socket.test.ts`                                                            | Subscribe and unsubscribe, routing of events, reconnect back-off, resubscription, invalid messages                                                                                                                                                                                                             |
| `src/api/compatibility.test.ts`                                                     | Response parsing and per-role filtering                                                                                                                                                                                                                                                                        |
| `src/features/selector/*.test.ts`                                                   | Shared options, incompatibility rules, run-setting choice, default selection tiers                                                                                                                                                                                                                             |
| `src/state/*.test.ts`                                                               | Timeline reducer (synthetic example run, failures, repeated steps, person actions), duplicate events                                                                                                                                                                                                           |
| `test/inspector*.test.ts(x)`, `test/sequence*.test.ts(x)`, `test/playback.test.tsx` | Protocol inspector, sequence diagram and playback; see [`src/inspector/README.md`](src/inspector/README.md#tests)                                                                                                                                                                                              |

## Browser tests

`npm run e2e` (`scripts/e2e.mjs`) builds everything, starts the server on a free port of 28600-28699
(reference mode, in-memory database) and `vite preview` on 28174, runs Playwright project `e2e` in
Chromium, and stops both. `npm run e2e -- --screenshots` also writes the screenshots of
[docs/ux](../../docs/ux/README.md); `--no-build` reuses the last build. Install the browser once with
`npm exec -w @inji-playground/web -- playwright install chromium`.

`e2e/playground.spec.ts` holds the tests: the reference and `mso_mdoc` happy paths, a tamper run, a revoked
credential, matrix and history, the manual-wallet modal answered by a scripted wallet, keyboard only, the
run, playback, gaps and not-found pages, the Digital Credentials API, a phone-sized screen, and axe-core
(WCAG 2.1 A/AA) checks on the pages they open. The latest count and time are in
[README, Current numbers](../../README.md#current-numbers).

`npm run e2e:live` runs project `e2e-live` (`e2e/live/`: the all-Inji run in the playground, Inji Certify ->
reference wallet -> the Inji Verify web component, and Inji Web's own pages from login to a VALID share)
against a bundle or a host-mode server on 28100 (`PLAYWRIGHT_BASE_URL`). `e2e/` has its own `tsconfig.json` without DOM types, because the tests run in
Node and import the workspace's protocol clients.
