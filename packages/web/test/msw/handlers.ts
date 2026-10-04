/**
 * Mock playground server for UI tests (Mock Service Worker intercepts fetch and WebSocket in Node).
 * The defaults describe a healthy server in reference mode with every role up; tests override single
 * endpoints with `server.use(...)`.
 */
import type { RoleStatus, RunConfigInput, StackStatus } from '@inji-playground/protocol';
import { http, HttpResponse, ws } from 'msw';
import { defaultSocketUrl } from '../../src/api/socket';
import { CHECKED_AT, roleStatuses } from '../fixtures/roles';

export const api = (path: string) => new URL(path, window.location.origin).toString();

/** The `/ws` endpoint of the page's origin, as the app computes it. */
export const runSocketLink = ws.link(defaultSocketUrl(window.location));

export function rolesHandler(roles: RoleStatus[]) {
  return http.get(api('/api/roles'), () => HttpResponse.json(roles));
}

export function stackHandler(status: StackStatus) {
  return http.get(api('/api/stack/status'), () => HttpResponse.json(status));
}

/** Records every `POST /api/runs` body and answers with the given run id. */
export function createRunHandler(runId: string, bodies: RunConfigInput[] = []) {
  return http.post(api('/api/runs'), async ({ request }) => {
    bodies.push((await request.json()) as RunConfigInput);
    return HttpResponse.json({ runId }, { status: 201 });
  });
}

export const defaultHandlers = [
  http.get(api('/api/health'), () =>
    HttpResponse.json({
      status: 'ok',
      service: 'inji-interop-playground',
      version: '0.1.0',
      uptimeSeconds: 3,
      time: CHECKED_AT,
    }),
  ),
  stackHandler({ mode: 'off', checkedAt: CHECKED_AT, services: [] }),
  rolesHandler(roleStatuses()),
  // Every combination that passes the local check is runnable unless a test says otherwise.
  http.get(api('/api/compatibility'), () => HttpResponse.json({ runnable: true, mode: 'live', reasons: [] })),
  // Accept connections; tests that stream events add their own listener.
  runSocketLink.addEventListener('connection', () => undefined),
];
