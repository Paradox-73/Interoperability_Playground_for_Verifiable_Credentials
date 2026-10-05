# Extending the playground

How to put another implementation into the playground (an issuer, a wallet or a verifier from another
project, or another Inji module), so it runs against every other role and shows up in the matrix.

## Add a role

A role is a class that implements one interface from `@inji-playground/protocol`
([roles-api.ts](../packages/protocol/src/roles-api.ts)):

| Kind     | Interface      | Methods the orchestrator calls                                                |
| -------- | -------------- | ----------------------------------------------------------------------------- |
| issuer   | `IssuerRole`   | `startIssuance(ctx, request)`: a credential offer or a wallet-initiated start |
| wallet   | `WalletRole`   | `receiveCredential(ctx, start)`, `present(ctx, request)`                      |
| verifier | `VerifierRole` | `createRequest(ctx, request)`, `awaitResult(ctx, request)`                    |

Every role also has `describe()` (id, name, version, ecosystem, capabilities) and `health()`.

1. Describe what it supports truthfully in `describe().capabilities`: formats, proof types, DID methods,
   OpenID4VCI and OpenID4VP profiles, issuance modes (`credential-offer`, `wallet-initiated`), response
   modes. The compatibility check uses them to mark cells it cannot run as not supported, with the reason,
   instead of letting them fail.
2. Make every protocol HTTP call through `ctx.http.fetch` (never the global `fetch`) and pass `ctx.signal`,
   so the call is recorded in the run and stops on timeout or cancel. Tag the step on each call
   (`step: 'token'`), or call `ctx.enterStep('wallet.submit')` as the role moves through the protocol.
3. When the implementation runs elsewhere and calls back (a phone, a service in a container), hand it URLs
   that pass a capture point, `PLAYGROUND_PUBLIC_URL/ref/*` or `/proxy/<target>/*`, and claim the target for
   the run (`hub.claim(runId, target)`), so its requests are recorded too. A new proxied service is one
   entry in `packages/server/src/recording/targets.ts`.
4. Throw `RoleError` (from `@inji-playground/protocol`) with a code and the category `interop` when the
   other side sent something the specifications do not allow, or `environment` when a service could not be
   reached. The report shows the code, the step and the message.
5. Register the role. Adapters for modules of the Inji stack go into
   `packages/server/src/adapters/inji/index.ts` (registered when `PLAYGROUND_STACK` is `host` or
   `bundle`). Anything else can be passed to `buildApp({ roles: [{ role, stepTimeoutMs }] })`; use a longer
   step timeout for slow services.

The role then appears in the role selector of the UI, in `GET /api/roles`, and in the matrix. The
`inji-web` role ([inji-web.ts](../packages/server/src/adapters/inji/inji-web.ts)) is a complete example of a
wallet that drives a backend API and reads its credential from recorded traffic; the reference roles in
`packages/server/src/adapters/reference/` show the plain case.

To add a scenario (a tamper or a probe), see [scenarios](../packages/scenarios/README.md): each scenario
states its expected outcome and the specification clause behind it.

## Test it

| Test                    | Where                                                                    | Needs                           |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| Unit and contract tests | `packages/server/test/`, `test/contract/<module>/`                       | nothing                         |
| Live tests              | `packages/server/test/live/` (`npm run test:live`)                       | the stack                       |
| Matrix cells            | a spec in `packages/cli/specs/` (`npm run matrix:live -- --spec <name>`) | the stack and a server on 28100 |

- Contract tests replay real answers without containers: capture a run from the live service with
  `packages/server/scripts/capture-inji-fixtures.ts` (the export is redacted), then drive the role against
  the recorded exchanges, as `test/contract/inji/adapters/inji-web.test.ts` does.
- A live test asserts the outcome measured on a date. When a gap of the other implementation decides the
  outcome, the test names the gap and checks that `docs/gaps/gaps.json` holds it, so a fixed gap shows up as
  a failing test to update.
- A matrix spec lists cells with the verdict the specifications require; a cell blocked by a known gap
  expects `verdict: fail` and names the gap in its description.
- Record a new gap in `docs/gaps/gaps.json` and write its issue draft in `docs/gaps/issues/`
  (`npm run docs:check` checks both). Security-relevant findings are reported privately instead
  ([gaps](gaps/README.md#reported-privately)).
