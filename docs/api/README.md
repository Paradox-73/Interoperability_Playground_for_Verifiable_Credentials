# Reports, history, matrix, metrics and gaps API

What the playground server derives from stored runs: the pass/fail report of each run (problem
statement task 7), the run history, the compatibility matrix, run metrics and the interoperability gap
register. The server listens on port 28100 by default; every path below is relative to it.

- Full machine-readable description: [`openapi.json`](openapi.json) (OpenAPI 3.1, generated from the
  route schemas). Regenerate it with `npm run openapi` after changing a route.
- Browsable version on a running server: `http://localhost:28100/api/docs`.
- Response shapes are zod schemas in [`packages/protocol/src/insights.ts`](../../packages/protocol/src/insights.ts)
  (report document, export, matrix, metrics, gaps) and
  [`packages/protocol/src/api.ts`](../../packages/protocol/src/api.ts) (history). The UI and the CLI
  parse answers with the same schemas.
- Errors share one body: `{"error": "<code>", "message": "<text>"}` with status 400 (bad query),
  404 (unknown run) or 409 (run not finished yet).

| Route                            | Answer                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/runs/{id}/report.json` | Report document of a finished run (JSON); `?download=true` adds a download file name |
| `GET /api/runs/{id}/report.md`   | The same report as Markdown                                                          |
| `GET /api/runs/{id}/export`      | Everything stored about a run, with tokens and codes redacted                        |
| `GET /api/runs`                  | History with filters, paging and sort order                                          |
| `GET /api/matrix`                | Compatibility matrix (JSON); `?format=md` gives a dated Markdown document            |
| `GET /api/metrics`               | Success rates and p50/p95 durations per step, role pair and flow; credential sizes   |
| `GET /metrics`                   | The same figures in the Prometheus text format                                       |
| `GET /api/gaps`                  | The interoperability gap register, `docs/gaps/gaps.json`                             |

## Run report

`GET /api/runs/{id}/report.json` returns:

- `report`: the stored report. Its first fields are the ones task 7 asks for: `issuer`, `wallet`,
  `verifier` (each with id, name, version and ecosystem), `format`, `credentialProof` (proof type),
  `outcome` (`VALID`, `INVALID`, `EXPIRED`, `ERROR`, `NOT_RUN`) and `error` (step, code, message).
  It also holds the holder proof, the issuer DID, the OpenID4VCI and OpenID4VP profiles, the scenario
  with its expected outcome, the `verdict` (`pass`, `fail`, `error`, `not-supported`) and the steps.
- `versions`: issuer, wallet, verifier and playground versions.
- `steps`: every step with its plain-language label, protocol term, specification section, status
  and duration in milliseconds; `run.totalStepMs` is their sum.
- `error.exchange`: the recorded HTTP exchange that shows the failure (method, URL with secrets
  removed, status) with two links: `apiLink` (raw payloads) and `uiLink` (`/runs/{id}?exchange=...`,
  the run page with the exchange open in the protocol inspector). When a role did not name the
  exchange, the last exchange of the failing step that got an error status or no answer is used.
- `credentialSize`: see [Credential size](#credential-size).

`report.md` renders the same content. Its first table lists issuer, wallet, verifier, format, proof
type, holder proof, outcome, verdict and error detail; then come error detail with the exchange link,
versions, steps with durations, credential size and links. Example (fake test roles, measured
2026-10-04 on a local server):

```markdown
| Field        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Issuer       | Test role (fake) issuer (`fake-issuer`, fake, reference)     |
| Wallet       | Test role (fake) wallet (`fake-wallet`, fake, reference)     |
| Verifier     | Test role (fake) verifier (`fake-verifier`, fake, reference) |
| Format       | `vc+sd-jwt`                                                  |
| Proof type   | FakeDigest                                                   |
| Outcome      | VALID (expected VALID)                                       |
| Verdict      | PASS                                                         |
| Error detail | none                                                         |
```

## Redacted export

`GET /api/runs/{id}/export` returns the run, its events, its recorded exchanges and its artefacts in
one JSON document that is safe to attach to an issue. The stored data is never changed; redaction
happens on the way out.

Replaced by `[redacted sha256:<first 8 hex digits of the value's SHA-256>]`:

- JSON members `access_token`, `refresh_token`, `id_token`, `pre-authorized_code`, `tx_code`,
  `user_pin`, `client_secret`, `client_assertion`, `password`, `secret`, `api_key` and private key
  fields (`privateKeyJwk`, `privateKeyMultibase`, ...);
- private members of a JWK (`d`, `p`, `q`, `dp`, `dq`, `qi`, `oth`, `k`);
- the same names plus `code` (the OAuth authorization code) in form bodies, URL queries and URL
  fragments, including JSON carried inside a parameter, such as the `pre-authorized_code` inside an
  `openid-credential-offer://?credential_offer=...` link;
- headers `Authorization` and `Proxy-Authorization` (the scheme, such as `Bearer`, stays), `Cookie`,
  `Set-Cookie`, `DPoP`, `X-Api-Key`;
- `name=value` pairs and `Bearer` / `DPoP` tokens inside free text such as error messages.

Kept, because they are the interoperability evidence: credentials, presentations (`vp_token`), proof
JWTs, nonces, metadata, request objects, verification results and error codes. In JSON bodies a
member named `code` is kept: there it is an error code far more often than an authorization code.

The digest prefix lets a reader see that the access token returned by the token endpoint is the one
sent to the credential endpoint, without seeing the token. `redactions` counts the replaced values.

## History

`GET /api/runs` filters, all optional and combined with AND:

| Parameter                      | Meaning                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `issuer`, `wallet`, `verifier` | Role id                                                                |
| `version`                      | Module version: runs where any of the three roles had it               |
| `format`                       | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` or `mso_mdoc` (encode `+` as `%2B`) |
| `scenario`                     | Scenario id, for example `happy`                                       |
| `outcome`, `verdict`           | As in the report                                                       |
| `status`, `mode`               | `queued` / `running` / `finished`; `live` / `reference` / `playback`   |
| `from`, `to`                   | ISO 8601 times with an offset; `from` inclusive, `to` exclusive        |
| `order`                        | `newest` (default) or `oldest`                                         |
| `limit`, `offset`              | Paging; `limit` 1 to 500, default 50                                   |

The answer carries `total` (the size of the filtered set) next to the page of `items`.

## Compatibility matrix

A cell is one combination of issuer, wallet, verifier, credential format, OpenID4VP profile and
scenario. Its id is those six values joined by `/`, for example
`inji-certify/ref-wallet/inji-verify/ldp_vc/inji-draft/happy`.

- Cells with stored runs show the verdict of the newest finished run (`latestRun`) and the counts of
  all finished runs of the cell (`runs`, `pass`, `fail`, `error`, `notSupported`). Runs still going
  are not counted.
- Every other combination of the roles registered now, for the requested `scenario` (default
  `happy`), comes from the compatibility check: `untested` if it could run, `not-supported` with the
  blocking reasons if not (for example "Inji Verify does not support the format mso_mdoc"). The check
  passes if either OpenID4VCI profile works, draft 13 first.
- `reasons` of a cell are the compatibility reasons for the roles as registered now; `gapIds` are the
  gap register entries whose cell patterns match it.
- Filters: `issuer`, `wallet`, `verifier`, `credentialFormat`, `vpProfile`, `mode`; `scenario`;
  `hideNotSupported=true` drops the cells that cannot run.
- `format=md` answers with Markdown: a generation time stamp, the totals, a table of the
  implementations and their versions, a results table and a "Not supported" table with the reasons.
  Results are words (`PASS`, `FAIL`, `ERROR`, `NOT RUN YET`, `NOT SUPPORTED`), never colour alone.

## Metrics

`GET /api/metrics` computes every figure from the finished runs that match its filters (`issuer`,
`wallet`, `verifier`, `version`, `format`, `scenario`, `mode`, `from`, `to`); nothing is stored
separately, so the figures always agree with the history.

| Figure                  | Definition                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `successRate` (overall) | pass / (pass + fail + error); not-supported runs were never attempted and are left out                                                                                                                           |
| `steps[].successRate`   | steps that finished ok / steps that ran (skipped and not-run steps are not counted)                                                                                                                              |
| `pairs[]`               | `issuance` (issuer -> wallet: offer to credential) and `presentation` (wallet -> verifier: request to result) per role pair; a phase succeeded when every step of it that ran was ok and its last step completed |
| `flows[]`               | per issuer, wallet, verifier and format: verdict counts and success rate                                                                                                                                         |
| `duration`              | `count`, `sumMs`, `p50Ms`, `p95Ms`, `maxMs`; percentiles use the nearest-rank method, so each one is a measured value                                                                                            |
| `credentialSizes[]`     | per issuer and format: samples, largest size and PixelPass length, how many fit a version 40 QR code, and the newest sample                                                                                      |

`GET /metrics` gives the same figures in the Prometheus text format 0.0.4 over all stored runs:
gauges `playground_runs{verdict}`, `playground_success_ratio`, `playground_step_success_ratio{step}`,
`playground_pair_success_ratio{phase,from,to}`, `playground_flow_success_ratio{issuer,wallet,verifier,format}`,
`playground_credential_bytes`, `playground_credential_pixelpass_chars`,
`playground_credential_fits_qr_v40{issuer,format}`; summaries with quantiles 0.5 and 0.95 (in
seconds) `playground_step_duration_seconds`, `playground_pair_duration_seconds`,
`playground_flow_duration_seconds`. Values that cannot be computed yet (a rate with no attempts) are
left out rather than written as `NaN`.

## Credential size

Every report of a run that received a credential records, for the credential exactly as issued
(before any tamper scenario changes it):

- `bytes`: UTF-8 size;
- `pixelpassChars`: length of the text PixelPass (`@injistack/pixelpass` 0.8.0, the encoder Inji uses
  for credential QR codes) produces: CBOR for JSON, zlib, then base45;
- `fitsQrV40`: whether that text fits the largest QR code, version 40 at error correction level L
  (4,296 alphanumeric characters, ISO/IEC 18004).

## Gap register

`GET /api/gaps` reads `docs/gaps/gaps.json` (another file with `PLAYGROUND_GAPS_FILE`). The file is
either an array of gaps or `{"gaps": [...]}`. Fields of an entry: `id`, `title`, `repository`
(required); `version`, `severity` (`low` to `critical`), `status` (`new`, `existing-upstream`,
`fixed-locally`, `resolved`), `summary`, `upstreamIssue`, `issueDraft`, `evidence` (`caseId`, `runId`,
`date`), `disclosure` (`public` by default) and `cells`: matrix cell ids in which `*` matches any value
and trailing values may be left out, for example `inji-certify/*/inji-verify/ldp_vc`.

- A missing file gives `{"source": null, "gaps": [], "problems": []}`.
- Entries that do not match the schema are left out and listed in `problems` with their index.
- Entries with `"disclosure": "private"` (security-relevant) are reduced to id, repository and
  severity, with the title "Reported privately", and are not linked to matrix cells.
- The file is read again when its modification time changes.
