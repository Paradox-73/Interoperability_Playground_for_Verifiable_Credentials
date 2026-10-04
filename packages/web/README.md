# @inji-playground/web

The playground UI: React 18, Vite, Tailwind CSS.

- `npm run dev -w @inji-playground/web`: dev server on port 28173; API, WebSocket and proxy paths are
  forwarded to the server on 28100 (`PLAYGROUND_SERVER_URL` overrides it).
- `npm run build -w @inji-playground/web`: bundle into `dist/`, which the server serves.
- Unit tests: `src/**/*.test.tsx` with Testing Library under jsdom.
- Browser tests: Playwright projects `e2e` (`e2e/`) and `e2e-live` (`e2e/live/`, needs the bundle).

Status (2026-10-04): skeleton page with the three role columns and the server health line.
