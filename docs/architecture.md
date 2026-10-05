# Architecture

How the playground is built: the parts, what happens in one run, and where the HTTP traffic of a run is
recorded. Detail lives next to the code; each section links to it.

## Components

```
                     browser (React UI, http://localhost:28100)
                               │  REST /api/*, WebSocket /ws
                               ▼
  ┌──────────────────────── playground server (Fastify, Node 24) ────────────────────────┐
  │ orchestrator ── role registry ── roles:                                               │
  │   reference: ref-issuer, ref-wallet, ref-verifier          (packages/oid4vci, oid4vp)  │
  │   Inji adapters: inji-certify, inji-certify-ac, inji-web, inji-verify, inji-verify-sdk │
  │   manual: mobile-wallet (a person with a phone)                                        │
  │ hosted reference endpoints /ref/issuer, /ref/as, /ref/verifier                          │
  │ capture points: outbound client, inbound /ref/*, reverse proxy /proxy/* and /v1/verify/*│
  │ SQLite store (node:sqlite) ── event bus ── reports, matrix, metrics, gap register       │
  └───────────────────────────────────────────────────────────────────────────────────────┘
                               │  HTTP through the capture points
                               ▼
  local Inji stack (Docker Compose project ps02-inji, deploy/inji-stack/)
    Inji Certify 0.14.0 (pre-authorized)   certify-ac 0.14.0 (authorization code)
    Inji Verify 0.18.2 (service and UI)     Mimoto 0.22.0 + Inji Web 0.17.0
    Postgres 15 x2, certify-nginx, TLS front for *.ps02.test (test CA)
```

| Part               | Package or folder                                       | Guide                                                       |
| ------------------ | ------------------------------------------------------- | ----------------------------------------------------------- |
| Shared contracts   | `packages/protocol` (zod schemas and TypeScript types)  | [protocol](../packages/protocol/README.md)                  |
| Credential formats | `packages/formats` (keys, DIDs, Data Integrity, SD-JWT) | [formats](../packages/formats/README.md)                    |
| OpenID4VCI         | `packages/oid4vci` (issuer, test AS, wallet client)     | [oid4vci](../packages/oid4vci/README.md)                    |
| OpenID4VP          | `packages/oid4vp` (verifier, wallet client)             | [oid4vp](../packages/oid4vp/README.md)                      |
| Scenarios          | `packages/scenarios` (happy path, tampers, probes)      | [scenarios](../packages/scenarios/README.md)                |
| Server             | `packages/server`                                       | [server](../packages/server/README.md)                      |
| UI                 | `packages/web` (React 18, Vite, Tailwind)               | [web](../packages/web/README.md)                            |
| Matrix runner      | `packages/cli`                                          | [cli](../packages/cli/README.md)                            |
| Inji stack         | `deploy/inji-stack/`                                    | [stack](../deploy/inji-stack/README.md), [set-up](setup.md) |
| One-command bundle | `deploy/compose.yaml`, `Dockerfile`                     | [set-up](setup.md#one-command-bundle)                       |

The reasons behind these choices are the [architecture decision records](adr/README.md).

Roles are the unit of interoperability. Every issuer, wallet and verifier, whether a reference
implementation, an adapter for an Inji module or a person with a phone, implements one interface from
`packages/protocol` (`IssuerRole`, `WalletRole`, `VerifierRole`) and describes its capabilities (formats,
proof types, DID methods, protocol profiles, issuance modes). The orchestrator never knows which kind of
role it drives; the compatibility check compares descriptors before a run starts.

## One run end to end

1. The UI (or the CLI) sends `POST /api/runs` with an issuer, a wallet, a verifier, a format, the
   OpenID4VCI and OpenID4VP profiles and a scenario.
2. The orchestrator stores the run and checks compatibility. A combination that cannot run (a format a
   role does not support, an issuer that cannot serve the wallet's issuance mode) is stored at once with
   the verdict `not-supported` and the reason.
3. A run that uses an Inji module waits for the stack lock: live runs share one stack and run one at a
   time. Runs of reference roles only run in parallel.
4. Issue: `IssuerRole.startIssuance` returns a credential offer, or, for a wallet that cannot take an
   offer (Inji Web), the wallet-initiated start (issuer URL and configuration id).
5. Hold: `WalletRole.receiveCredential` runs OpenID4VCI: metadata, authorization server metadata, token,
   credential.
6. Present: `VerifierRole.createRequest` builds the OpenID4VP request; `WalletRole.present` resolves and
   answers it. Scenario hooks may tamper with the credential or the presentation in between.
7. Verify: `VerifierRole.awaitResult` returns `VALID`, `INVALID`, `EXPIRED` or an error.
8. The orchestrator compares the outcome with the scenario's expected outcome, stores the report (verdict
   `pass`, `fail`, `error` or `not-supported`) and emits `run.finished`.

Every step is an event (`step.started`, `exchange`, `artifact`, `step.finished`), stored first and then
published on the WebSocket, so a page opened mid-run misses nothing. The run page draws the events as a
timeline, the exchanges as an animated sequence diagram, and opens any message in the protocol inspector.
The full lifecycle, step names and verdict rules: [server guide](../packages/server/README.md#how-a-run-works).

## Where traffic is recorded

A run is only useful if every HTTP message of it is visible. Three capture points record into the run:

| Capture point    | Sees                                                                                          | How it knows the run                                                    |
| ---------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Outbound client  | Calls the server's own roles make (reference wallet to Inji Certify, adapters to Mimoto)      | The role calls `ctx.http.fetch` of its run context                      |
| Inbound `/ref/*` | Calls from outside to the hosted reference roles (a phone, Mimoto, Inji Verify)               | Attribution headers of the server's own calls, else the newest claim    |
| Reverse proxy    | `/proxy/<service>/*` and `/v1/verify/*`: calls to Inji services that are not the server's own | The same: a role claims the target for its run before handing out a URL |

So when Mimoto (inside the stack) requests a token from the test authorization server and a credential
from certify-ac, both calls pass a capture point: the authorization server is hosted under `/ref/as`, and
certify-ac's public URL is `https://ref.ps02.test/proxy/certify-ac`. The `inji-web` role claims both
targets before it starts Mimoto's download, so the exchanges land in its run.

Exchanges are stored as they were sent. Secrets (tokens, codes, cookies, CSRF tokens, private keys) are
replaced only on the way out: in exports, reports and recorded fixtures
([redaction rules](api/README.md#redacted-export)).

Names the stack uses inside its compose network (`certify-nginx`, `verify-service:8080`,
`ref.ps02.test`) are mapped to host ports when the server runs on the host
(`deploy/inji-stack/network-map.host.json`), and resolve directly when it runs in the bundle next to the
stack. The TLS front serves `certify.ps02.test`, `certify-ac.ps02.test`, `verify.ps02.test`,
`ref.ps02.test` and `playground.ps02.test` over HTTPS with a test CA, because Inji's verifier resolves
`did:web` only over HTTPS (gap G2).
