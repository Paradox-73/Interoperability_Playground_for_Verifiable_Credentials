# Compatibility matrix: live-holder-web

Run on 2026-10-06, 12:49:42 to 12:50:24 UTC (42 s), from `live-holder-web.yaml` in live mode, against playground server 0.1.0 at http://localhost:28100.

Inji Web (Mimoto) as the wallet, with certify-ac and the reference issuer; certify-ac with the reference wallet.

**8 of 8 cells gave the verdict their spec expects**. Verdicts: 4 pass, 4 fail, 0 error, 0 not supported.

## Versions

| Role | Name | Ecosystem | Version |
| ---- | ---- | --------- | ------- |
| `inji-certify-ac` | Inji Certify (authorization code) | inji | 0.14.0 |
| `inji-verify` | Inji Verify (API) | inji | 0.18.2 |
| `inji-web` | Inji Web (through Mimoto) | inji | 0.17.0 + Mimoto 0.22.0 |
| `ref-issuer` | Reference issuer | reference | 0.1.0 |
| `ref-verifier` | Reference verifier | reference | 0.1.0 |
| `ref-wallet` | Reference wallet (headless) | reference | 0.1.0 |

## Cells

| Case | Issuer → wallet → verifier | Format | Profiles | Scenario | Expected | Actual | Verdict | Matches spec | Run |
| ---- | -------------------------- | ------ | -------- | -------- | -------- | ------ | ------- | ------------ | --- |
| TC_PG_WEB_01 | `inji-certify-ac` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124942-f7bc7f`](runs/TC_PG_WEB_01.json) |
| TC_PG_WEB_02 | `inji-certify-ac` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124944-817857`](runs/TC_PG_WEB_02.json) |
| TC_PG_WEB_03 | `inji-certify-ac` → `inji-web` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124949-8a81a3`](runs/TC_PG_WEB_03.json) |
| TC_PG_WEB_04 | `inji-certify-ac` → `inji-web` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261006T125006-5a331b`](runs/TC_PG_WEB_04.json) |
| TC_PG_WEB_05 | `ref-issuer` → `inji-web` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T125007-f22be4`](runs/TC_PG_WEB_05.json) |
| TC_PG_WEB_06 | `ref-issuer` → `inji-web` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261006T125014-41e82f`](runs/TC_PG_WEB_06.json) |
| TC_PG_WEB_07 | `ref-issuer` → `inji-web` → `inji-verify` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T125018-c39616`](runs/TC_PG_WEB_07.json) |
| TC_PG_WEB_08 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T125024-ed24e8`](runs/TC_PG_WEB_08.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Live runs are kept in git with this file, so every link above opens the recorded exchanges; the nightly workflow also publishes them as a build artifact.

## Errors and reasons

- TC_PG_WEB_04: `wallet.no-matching-credential` at wallet.fetch-request: Mimoto offers no credential for this request (the run's credential is vc+sd-jwt): its credential matching supports only ldp_vc (gap G25)
- TC_PG_WEB_06: `wallet.presentation-request-failed` at wallet.fetch-request: Mimoto presentation-request: HTTP 400 {"errorCode":"invalid_request","errorMessage":"Missing Input: filter->pattern param is required"}
- TC_PG_WEB_07: `outcome.unexpected` at verifier.result: The scenario "holder-proof-es256" expects VALID; Inji Verify (API) answered INVALID.
- TC_PG_WEB_08: `outcome.unexpected` at verifier.result: The scenario "holder-proof-es256" expects VALID; Inji Verify (API) answered INVALID.
