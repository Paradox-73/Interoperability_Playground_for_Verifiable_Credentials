# Compatibility matrix: live-core

Run on 2026-10-06, 14:44:17 to 14:45:36 UTC (1 min 20 s), from `live-core.yaml` in live mode, against playground server 0.1.0 at http://localhost:28100.

Inji Certify and Inji Verify against the reference roles, both mandatory formats, plus tamper cells against Inji Verify.

**16 of 16 cells gave the verdict their spec expects**. Verdicts: 11 pass, 4 fail, 0 error, 1 not supported.

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
| TC_PG_LIVE_01 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T144417-592999`](runs/TC_PG_LIVE_01.json) |
| TC_PG_LIVE_02 | `inji-certify` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T144422-6ef6fe`](runs/TC_PG_LIVE_02.json) |
| TC_PG_LIVE_03 | `inji-certify` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T144430-59e468`](runs/TC_PG_LIVE_03.json) |
| TC_PG_LIVE_04 | `inji-certify` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T144431-00b02e`](runs/TC_PG_LIVE_04.json) |
| TC_PG_LIVE_05 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T144432-6a9012`](runs/TC_PG_LIVE_05.json) |
| TC_PG_LIVE_06 | `ref-issuer` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T144434-deca30`](runs/TC_PG_LIVE_06.json) |
| TC_PG_LIVE_07 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T144435-d26334`](runs/TC_PG_LIVE_07.json) |
| TC_PG_LIVE_08 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T144436-da5e3a`](runs/TC_PG_LIVE_08.json) |
| TC_PG_LIVE_09 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261006T144436-a2980d`](runs/TC_PG_LIVE_09.json) |
| TC_PG_LIVE_10 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261006T144437-b137a2`](runs/TC_PG_LIVE_10.json) |
| TC_PG_LIVE_11 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261006T144437-829e2a`](runs/TC_PG_LIVE_11.json) |
| TC_PG_LIVE_12 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T144438-13eecd`](runs/TC_PG_LIVE_12.json) |
| TC_PG_LIVE_14 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T144438-7e3df3`](runs/TC_PG_LIVE_14.json) |
| TC_PG_LIVE_13 | `ref-issuer` → `ref-wallet` → `inji-verify` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261006T144441-c33c37`](runs/TC_PG_LIVE_13.json) |
| TC_PG_LIVE_15 | `inji-certify` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261006T144441-bdb6d0`](runs/TC_PG_LIVE_15.json) |
| TC_PG_LIVE_16 | `ref-issuer` → `ref-wallet` → `inji-verify` | mso_mdoc | draft13 / inji-draft | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261006T144441-deacf3`](runs/TC_PG_LIVE_16.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Live runs are kept in git with this file, so every link above opens the recorded exchanges; the nightly workflow also publishes them as a build artifact.

## Errors and reasons

- TC_PG_LIVE_04: `outcome.unexpected` at verifier.result: The scenario "happy" expects VALID; Reference verifier answered INVALID.
- TC_PG_LIVE_06: `outcome.unexpected` at verifier.result: The scenario "happy" expects VALID; Inji Verify (API) answered INVALID.
- TC_PG_LIVE_13: `compatibility.verifier.format-unsupported` at playground.admin: Inji Verify (API) does not support the format dc+sd-jwt (it supports ldp_vc, vc+sd-jwt, mso_mdoc).
- TC_PG_LIVE_15: `outcome.unexpected` at verifier.result: The scenario "happy" expects VALID; Reference verifier answered INVALID.
- TC_PG_LIVE_16: `verifier.submission-refused` at verifier.result: Inji Verify refused the presentation with HTTP 400 (INVALID_VP_TOKEN: Verifiable presentation failed due to invalid VP token)
