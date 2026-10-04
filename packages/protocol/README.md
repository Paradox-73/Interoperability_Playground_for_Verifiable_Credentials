# @inji-playground/protocol

The contracts every other package codes against. Data shapes are [zod](https://zod.dev) schemas named
`...Schema`, each with the TypeScript type inferred from it; behaviour is TypeScript interfaces.

```ts
import { RunConfigSchema, type RunEvent, type IssuerRole } from '@inji-playground/protocol';

const config = RunConfigSchema.parse(await request.json()); // throws on a malformed body
```

## Contents

| File           | What it defines                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `enums.ts`     | Credential formats, protocol profiles, outcomes, verdicts, step ids and other closed vocabularies                                              |
| `common.ts`    | Timestamps, role ids, run ids, scenario ids                                                                                                    |
| `roles.ts`     | `RoleDescriptor` (one card in a selector column), health, Inji stack status                                                                    |
| `roles-api.ts` | `IssuerRole`, `WalletRole`, `VerifierRole`, `RunContext`, `ScenarioHooks`, `RecordingHttpClient` (interfaces only)                             |
| `api.ts`       | Request and response bodies of the REST API, list filters, compatibility answer, WebSocket messages                                            |
| `errors.ts`    | `RoleError`: what a role throws, with a code and a category (`interop` or `environment`)                                                       |
| `flow.ts`      | Values passed between roles: issuance start, held credential, presentation request, result                                                     |
| `exchange.ts`  | `RecordedExchange`: one HTTP request and response as captured on the wire                                                                      |
| `events.ts`    | `RunEvent` union streamed over the WebSocket and stored; WebSocket subscribe messages                                                          |
| `report.ts`    | `InteropReport`: the pass/fail report of one run                                                                                               |
| `run.ts`       | `RunConfig` (body of `POST /api/runs`, with defaults), step errors and summaries                                                               |
| `scenario.ts`  | `ScenarioSpec`: happy path or tamper variant with its expected outcome                                                                         |
| `person.ts`    | `PersonAction`: a QR code to scan or a link to open, shown to a person                                                                         |
| `steps.ts`     | `STEP_INFO`: plain-language label, protocol term and specification section of every step; `ROLE_CALLS`: the five role calls of a run, in order |
| `verdict.ts`   | `verdictFor(expected, outcome)`                                                                                                                |
| `health.ts`    | Body of `GET /api/health`                                                                                                                      |

## Terms

- **Outcome**: what the verifier answered: `VALID`, `INVALID`, `EXPIRED`, or `ERROR`. `ERROR` is also
  the outcome when a role rejected the other side's protocol message before the verifier answered.
  `NOT_RUN` means the run stopped for a reason unrelated to interoperability (timeout, cancel, a service
  that could not be reached).
- **Verdict**: `pass` when the outcome equals the scenario's expected outcome, else `fail`; `error`
  when the outcome is `NOT_RUN`; `not-supported` when the compatibility check rejected the combination
  before starting.
- **Profiles**: `draft13` / `v1` for OpenID4VCI; `inji-draft` (drafts 21-23 with Presentation
  Exchange, as in Inji's stable releases) / `final-1.0` (OpenID4VP 1.0 with DCQL) for OpenID4VP.
- `vc+sd-jwt` and `dc+sd-jwt` are the old and the new name of the SD-JWT VC format; both are kept
  because Inji's stable releases use the old one.

## Fixtures

`fixtures/example-run.synthetic.json` is a complete made-up run (reference issuer → reference wallet
→ reference verifier, SD-JWT VC) for tests and UI development. Its tokens are placeholders. It is
never shown as a recorded run; recorded runs are exported with a different name.

## Changing a contract

Every package depends on this one. After a change, `npm run typecheck` and `npm test` at the
repository root check all of them.
