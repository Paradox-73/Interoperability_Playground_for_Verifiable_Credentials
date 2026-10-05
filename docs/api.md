# API

Everything the playground server answers on its port (28100 by default). The machine-readable
description is [api/openapi.json](api/openapi.json) (OpenAPI 3.1, generated from the route schemas with
`npm run openapi`); a running server shows it at `http://localhost:28100/api/docs`. Reports, history,
matrix, metrics, gaps and the redaction rules are described in detail in [api/README.md](api/README.md).

Errors share one body, `{"error": "<code>", "message": "<text>"}`.

## REST

| Route                                   | Answer                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/health`                       | Liveness of the server                                                                  |
| `GET /api/roles`                        | Registered roles with their capabilities and current health                             |
| `GET /api/stack/status`                 | Health and image tags of the local Inji stack, and the health of every role             |
| `GET /api/scenarios`                    | The scenario catalogue with expected outcomes                                           |
| `GET /api/compatibility`                | Whether one issuer x wallet x verifier x format combination can run, and why not        |
| `POST /api/runs`                        | Start a run (or repeat one with `replayOf`); answers `{"runId": ...}` with status 201   |
| `GET /api/runs`                         | Run history, newest first, with filters and paging                                      |
| `GET /api/runs/{id}`                    | One run: configuration, status, report once finished, and the action a person must take |
| `GET /api/runs/{id}/events`             | The run's events in order (what the WebSocket streams)                                  |
| `GET /api/runs/{id}/exchanges`          | The run's recorded HTTP exchanges with full headers and bodies                          |
| `POST /api/runs/{id}/cancel`            | Cancel a queued or running run                                                          |
| `POST /api/runs/{id}/person-done`       | Confirm that the person did what the run waits for (manual fallback for phone wallets)  |
| `POST /api/runs/{id}/verifier-callback` | Deliver a signal from a verifier component in the page (the Inji Verify web component)  |
| `GET /api/runs/{id}/report.json`        | Interoperability report of a finished run                                               |
| `GET /api/runs/{id}/report.md`          | The same report as Markdown                                                             |
| `GET /api/runs/{id}/export`             | Everything stored about a run, with tokens, codes, cookies and keys redacted            |
| `GET /api/matrix`                       | Compatibility matrix: newest run per cell, plus the cells that cannot run and why       |
| `GET /api/metrics`                      | Success rates and p50/p95 durations per step, role pair and flow; credential sizes      |
| `GET /metrics`                          | The same metrics in the Prometheus text format                                          |
| `GET /api/gaps`                         | The interoperability gap register, [gaps/gaps.json](gaps/gaps.json)                     |

Start a run:

```bash
curl -s -X POST http://localhost:28100/api/runs -H 'content-type: application/json' \
  -d '{"issuer":"ref-issuer","wallet":"ref-wallet","verifier":"ref-verifier","format":"vc+sd-jwt","scenario":"happy"}'
# {"runId":"20261005T180456-bea81b"}
curl -s http://localhost:28100/api/runs/20261005T180456-bea81b/report.md
```

## WebSocket

`GET /ws` (upgrade). A client subscribes to one run, or to every run with `*`:

- client to server: `{"type":"subscribe","runId":"<id>"}`, `{"type":"unsubscribe","runId":"<id>"}`; the
  query `?runId=<id>` subscribes when the connection opens;
- server to client: `subscribed` and `unsubscribed` acknowledgements, `error` for a malformed message, and
  the run events: `run.started`, `step.started`, `exchange`, `artifact`, `person.action-needed`,
  `step.finished`, `run.finished`.

A subscription to one run first replays the run's stored events, then streams new ones, so a page opened
mid-run misses nothing. The event shapes are zod schemas in
[packages/protocol/src/events.ts](../packages/protocol/src/events.ts).

## Hosted reference endpoints

The reference roles are real HTTP services on the same port, so other wallets and verifiers (a phone,
Mimoto, Inji Verify) can talk to them:

| Path                                             | What                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/ref/issuer/draft13/*`, `/ref/issuer/v1/*`      | Reference issuer, OpenID4VCI draft 13 and 1.0 (metadata, token, credential, nonce)                              |
| `/ref/issuer/did-key/*`, `/ref/issuer/did-jwk/*` | The same issuer keys under another DID method, for the DID-method probes                                        |
| `/ref/as/*`                                      | Test authorization server: metadata, authorize (auto-approve), token, JWKS, userinfo                            |
| `/ref/verifier/*`                                | Reference verifier: request objects and `direct_post` responses                                                 |
| `/.well-known/*`                                 | The RFC 8615 "insert" form of the reference issuer's and authorization server's metadata URLs, at the host root |
| `/contexts/v1.jsonld`                            | The JSON-LD context of the reference credentials (`https://playground.ps02.test/contexts/v1.jsonld`)            |

And the recording proxy in front of the Inji services:

| Path                  | Forwards to                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `/proxy/certify/*`    | Inji Certify (certify-nginx)                                                                    |
| `/proxy/certify-ac/*` | certify-ac; `.well-known/*` is mapped under `/v1/certify`, as the sample nginx does for Certify |
| `/proxy/verify/*`     | Inji Verify service                                                                             |
| `/proxy/mimoto/*`     | Mimoto                                                                                          |
| `/v1/verify/*`        | Inji Verify service, same path (the Inji Verify web component calls it on the page's origin)    |

Every exchange through these paths is recorded in the run that claimed the target
([architecture](architecture.md#where-traffic-is-recorded)).
