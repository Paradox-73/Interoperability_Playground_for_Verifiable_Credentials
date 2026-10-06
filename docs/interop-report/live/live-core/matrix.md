# Compatibility matrix: live-core

Run on 2026-10-06, 12:48:47 to 12:49:11 UTC (24 s), from `live-core.yaml` in live mode, against playground server 0.1.0 at http://localhost:28100.

Inji Certify and Inji Verify against the reference roles, both mandatory formats, plus tamper cells against Inji Verify.

**14 of 14 cells gave the verdict their spec expects**. Verdicts: 11 pass, 2 fail, 0 error, 1 not supported.

## Versions

| Role | Name | Ecosystem | Version |
| ---- | ---- | --------- | ------- |
| `inji-certify` | Inji Certify | inji | 0.14.0 |
| `inji-verify` | Inji Verify (API) | inji | 0.18.2 |
| `ref-issuer` | Reference issuer | reference | 0.1.0 |
| `ref-verifier` | Reference verifier | reference | 0.1.0 |
| `ref-wallet` | Reference wallet (headless) | reference | 0.1.0 |

## Cells

| Case | Issuer → wallet → verifier | Format | Profiles | Scenario | Expected | Actual | Verdict | Matches spec | Run |
| ---- | -------------------------- | ------ | -------- | -------- | -------- | ------ | ------- | ------------ | --- |
| TC_PG_LIVE_01 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124848-a09b40`](runs/TC_PG_LIVE_01.json) |
| TC_PG_LIVE_02 | `inji-certify` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124851-418161`](runs/TC_PG_LIVE_02.json) |
| TC_PG_LIVE_03 | `inji-certify` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124858-2ef4b6`](runs/TC_PG_LIVE_03.json) |
| TC_PG_LIVE_04 | `inji-certify` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T124859-cd3370`](runs/TC_PG_LIVE_04.json) |
| TC_PG_LIVE_05 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124901-48aa02`](runs/TC_PG_LIVE_05.json) |
| TC_PG_LIVE_06 | `ref-issuer` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T124903-cefadb`](runs/TC_PG_LIVE_06.json) |
| TC_PG_LIVE_07 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124903-2ea6ca`](runs/TC_PG_LIVE_07.json) |
| TC_PG_LIVE_08 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124906-d5c4f1`](runs/TC_PG_LIVE_08.json) |
| TC_PG_LIVE_09 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124906-3d7137`](runs/TC_PG_LIVE_09.json) |
| TC_PG_LIVE_10 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124907-155ffd`](runs/TC_PG_LIVE_10.json) |
| TC_PG_LIVE_11 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261006T124907-f67e4c`](runs/TC_PG_LIVE_11.json) |
| TC_PG_LIVE_12 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124908-40268c`](runs/TC_PG_LIVE_12.json) |
| TC_PG_LIVE_14 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124908-c2222b`](runs/TC_PG_LIVE_14.json) |
| TC_PG_LIVE_13 | `ref-issuer` → `ref-wallet` → `inji-verify` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261006T124911-f41356`](runs/TC_PG_LIVE_13.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Live runs are kept in git with this file, so every link above opens the recorded exchanges; the nightly workflow also publishes them as a build artifact.

## Errors and reasons

- TC_PG_LIVE_04: `outcome.unexpected` at verifier.result: The scenario "happy" expects VALID; Reference verifier answered INVALID.
- TC_PG_LIVE_06: `outcome.unexpected` at verifier.result: The scenario "happy" expects VALID; Inji Verify (API) answered INVALID.
- TC_PG_LIVE_13: `compatibility.verifier.format-unsupported` at playground.admin: Inji Verify (API) does not support the format dc+sd-jwt (it supports ldp_vc, vc+sd-jwt).
