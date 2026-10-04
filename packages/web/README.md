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

| Area          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar       | Product name, mode badge (Live when an Inji module is selected, Reference otherwise, Playback when a stored run is replayed), navigation, theme choice (system / light / dark, remembered in `localStorage`).                                                                                                                                                                                                                           |
| Status strip  | One chip per service: the playground server (`GET /api/health`), each Inji container (`GET /api/stack/status`), and the live-update WebSocket. Each chip shows an icon and a status word.                                                                                                                                                                                                                                               |
| Role selector | Three columns (Issuer → Wallet → Verifier) of cards from `GET /api/roles`: name, "Inji" / "Reference (non-Inji)" / "External (non-Inji)" tag, version, health, how the role runs, format and proof chips. Each column is a native radio group, so arrow keys move between cards.                                                                                                                                                        |
| Compatibility | A card that cannot work with the other two selections stays visible, gets a dashed frame and says why in words. Reasons come from two places: an instant check of the role descriptors in the browser (shared format, OpenID4VCI and OpenID4VP version, credential offer versus wallet-initiated issuance), and `GET /api/compatibility`, which adds what only the server knows (blocking reasons and warnings, with gap register ids). |
| Default       | On the first visit: healthy Inji modules in every column (PS02 task 2), choosing a combination that works together and prefers roles that run without a person; else the reference roles. The person's own choice is never overridden.                                                                                                                                                                                                  |
| Run bar       | Credential format and protocol versions, limited to values every selected role supports; scenario "Happy path" with its expected outcome; Run posts the configuration to `POST /api/runs`. When Run is disabled, the text under it says why.                                                                                                                                                                                            |
| Live timeline | Follows the run over the WebSocket: one row per step with the plain-language label first and the protocol term second, status icon and word, duration, error code and message, the specification section that defines the step, and the verdict at the end. `/runs/:id` shows the same timeline for any run.                                                                                                                            |
| Other routes  | `/runs` (runs started in this tab, until the history dashboard), `/matrix` and `/gaps` (empty states until their features land), `/about` (what the playground is, how capture works, every role's version), and a not-found page.                                                                                                                                                                                                      |

## Accessibility

- Every status is an icon plus a word, never colour alone.
- Finished steps, person actions and the run result are announced through one polite `aria-live`
  region (`src/app/LiveAnnouncer.tsx`).
- Skip link, one `h1` per page, page titles, labelled form controls, visible focus ring, reduced
  motion respected.
- Colour tokens for both themes are in `src/index.css`. `test/theme-contrast.test.ts` reads that file
  and checks WCAG 2.2 AA contrast for every text colour on every background (4.5:1) and for control
  borders and the focus ring (3:1), because jsdom cannot measure rendered colours.
- `test/playground.test.tsx` runs axe-core on the playground page before and after a run.

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
  pages/                     one component per route
  state/                     zustand stores (selection, run events, announcer) and run-view.ts,
                             the pure function that turns run events into timeline rows
  theme/                     light / dark preference
  i18n/, locales/en.json     every user-visible string
test/
  fixtures/roles.synthetic.json   made-up role catalogue for tests (named *.synthetic.json)
  msw/                            mock server (REST and WebSocket) used by every page test
```

```
src/inspector/             protocol inspector, run explorer (diagram + inspector, one selection)
src/sequence/              Mermaid sequence diagram, built from recorded exchanges, lazy-loaded
src/playback/              /runs/:id/playback: stored run replayed step by step
```

How the inspector, the diagram and playback work: [`src/inspector/README.md`](src/inspector/README.md).

Later features add `src/features/{matrix,history,report,tamper,gaps,manual-wallet,inji-verify-sdk}/`.

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

Measured on 2026-10-04 (Windows 11, Node 24.19.0): `npm test -w @inji-playground/web` passed 9 test
files with 157 tests in 56 s while other packages were building on the same laptop (about 20 s on
an idle one); `npm run build -w @inji-playground/web` built a 464 kB JavaScript bundle (143 kB gzip)
and 17 kB of CSS.

After the protocol inspector, sequence diagram and playback were added (2026-10-04): 15 test files, 217 tests, 24 s; the build's main chunk is 356 kB (112 kB gzip) because the run explorer (35 kB), the playback page (7 kB) and Mermaid (`mermaid.core` 94 kB, `sequenceDiagram` 116 kB, plus Mermaid's own lazy chunks) load on demand. Vite still warns about one chunk over 500 kB (662 kB): a shared chunk inside Mermaid, loaded only
after Mermaid itself.

Page tests get 30 s each and `findBy*` / `waitFor` 5 s (`vite.config.ts`,
`test/setup.ts`), because the defaults (5 s, 1 s) failed under that load with no fault in the page.

| File                                                                                | What it checks                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/playground.test.tsx`                                                          | Three columns from `/api/roles`; incompatible card reasons (local and server); default selection and fallback; Run posts the configuration; run bar errors; timeline from WebSocket events; announcements; axe |
| `test/app-shell.test.tsx`                                                           | Routes and page titles, navigation, about page, status strip, theme switch                                                                                                                                     |
| `test/theme-contrast.test.ts`                                                       | AA contrast of every token pair in both themes                                                                                                                                                                 |
| `src/api/socket.test.ts`                                                            | Subscribe and unsubscribe, routing of events, reconnect back-off, resubscription, invalid messages                                                                                                             |
| `src/api/compatibility.test.ts`                                                     | Response parsing and per-role filtering                                                                                                                                                                        |
| `src/features/selector/*.test.ts`                                                   | Shared options, incompatibility rules, run-setting choice, default selection tiers                                                                                                                             |
| `src/state/*.test.ts`                                                               | Timeline reducer (synthetic example run, failures, repeated steps, person actions), duplicate events                                                                                                           |
| `test/inspector*.test.ts(x)`, `test/sequence*.test.ts(x)`, `test/playback.test.tsx` | Protocol inspector, sequence diagram and playback; see [`src/inspector/README.md`](src/inspector/README.md#tests)                                                                                              |

Browser tests: Playwright projects `e2e` (`e2e/`) and `e2e-live` (`e2e/live/`, needs the bundle).
