# Live compatibility matrix

Combined from 2 specs, run on 2026-10-05. Each spec ran in its own session against the Inji stack; its page has the full detail.

| Spec | Run on (UTC) | Cells | As specified | Pass | Fail | Error | Not supported | Duration |
| ---- | ------------ | ----- | ------------ | ---- | ---- | ----- | ------------- | -------- |
| [live-core](live-core/matrix.md) | 2026-10-05 21:13 | 14 | 14 | 10 | 3 | 0 | 1 | 33 s |
| [live-holder-web](live-holder-web/matrix.md) | 2026-10-05 21:15 | 6 | 6 | 1 | 5 | 0 | 0 | 40 s |

## Versions

| Role | Name | Ecosystem | Version | Specs |
| ---- | ---- | --------- | ------- | ----- |
| `inji-certify-ac` | Inji Certify (authorization code) | inji | 0.14.0 | live-holder-web |
| `inji-certify` | Inji Certify | inji | 0.14.0 | live-core |
| `inji-verify` | Inji Verify (API) | inji | 0.18.2 | live-core, live-holder-web |
| `inji-web` | Inji Web (through Mimoto) | inji | 0.17.0 + Mimoto 0.22.0 | live-holder-web |
| `ref-issuer` | Reference issuer | reference | 0.1.0 | live-core, live-holder-web |
| `ref-verifier` | Reference verifier | reference | 0.1.0 | live-core, live-holder-web |
| `ref-wallet` | Reference wallet (headless) | reference | 0.1.0 | live-core, live-holder-web |

## Cells

| Spec | Case | Issuer → wallet → verifier | Format | Scenario | Expected | Actual | Verdict | Matches spec | Run |
| ---- | ---- | -------------------------- | ------ | -------- | -------- | ------ | ------- | ------------ | --- |
| live-core | TC_PG_LIVE_01 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | happy | VALID | VALID | Pass | yes | [`20261005T211313-6567d5`](live-core/runs/TC_PG_LIVE_01.json) |
| live-core | TC_PG_LIVE_02 | `inji-certify` → `ref-wallet` → `inji-verify` | ldp_vc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261005T211316-66d140`](live-core/runs/TC_PG_LIVE_02.json) |
| live-core | TC_PG_LIVE_03 | `inji-certify` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | happy | VALID | VALID | Pass | yes | [`20261005T211334-354e37`](live-core/runs/TC_PG_LIVE_03.json) |
| live-core | TC_PG_LIVE_04 | `inji-certify` → `ref-wallet` → `ref-verifier` | ldp_vc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261005T211334-9ff5e1`](live-core/runs/TC_PG_LIVE_04.json) |
| live-core | TC_PG_LIVE_05 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | happy | VALID | VALID | Pass | yes | [`20261005T211337-f5c089`](live-core/runs/TC_PG_LIVE_05.json) |
| live-core | TC_PG_LIVE_06 | `ref-issuer` → `ref-wallet` → `inji-verify` | vc+sd-jwt | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261005T211339-14ecd6`](live-core/runs/TC_PG_LIVE_06.json) |
| live-core | TC_PG_LIVE_07 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | expired | EXPIRED | EXPIRED | Pass | yes | [`20261005T211339-d208eb`](live-core/runs/TC_PG_LIVE_07.json) |
| live-core | TC_PG_LIVE_08 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | bad-signature | INVALID | INVALID | Pass | yes | [`20261005T211341-a34fcb`](live-core/runs/TC_PG_LIVE_08.json) |
| live-core | TC_PG_LIVE_09 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261005T211341-157cb8`](live-core/runs/TC_PG_LIVE_09.json) |
| live-core | TC_PG_LIVE_10 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261005T211342-1e930a`](live-core/runs/TC_PG_LIVE_10.json) |
| live-core | TC_PG_LIVE_11 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261005T211343-a4c989`](live-core/runs/TC_PG_LIVE_11.json) |
| live-core | TC_PG_LIVE_12 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261005T211343-14dab0`](live-core/runs/TC_PG_LIVE_12.json) |
| live-core | TC_PG_LIVE_14 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261005T211344-f1b033`](live-core/runs/TC_PG_LIVE_14.json) |
| live-core | TC_PG_LIVE_13 | `ref-issuer` → `ref-wallet` → `inji-verify` | dc+sd-jwt | happy | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261005T211346-090a5d`](live-core/runs/TC_PG_LIVE_13.json) |
| live-holder-web | TC_PG_WEB_01 | `inji-certify-ac` → `ref-wallet` → `inji-verify` | vc+sd-jwt | happy | VALID | VALID | Pass | yes | [`20261005T211518-94de71`](live-holder-web/runs/TC_PG_WEB_01.json) |
| live-holder-web | TC_PG_WEB_02 | `inji-certify-ac` → `ref-wallet` → `inji-verify` | ldp_vc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261005T211521-6770bb`](live-holder-web/runs/TC_PG_WEB_02.json) |
| live-holder-web | TC_PG_WEB_03 | `inji-certify-ac` → `inji-web` → `inji-verify` | ldp_vc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261005T211527-8d0a9e`](live-holder-web/runs/TC_PG_WEB_03.json) |
| live-holder-web | TC_PG_WEB_04 | `inji-certify-ac` → `inji-web` → `inji-verify` | vc+sd-jwt | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261005T211545-96b551`](live-holder-web/runs/TC_PG_WEB_04.json) |
| live-holder-web | TC_PG_WEB_05 | `ref-issuer` → `inji-web` → `inji-verify` | ldp_vc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261005T211547-01ef35`](live-holder-web/runs/TC_PG_WEB_05.json) |
| live-holder-web | TC_PG_WEB_06 | `ref-issuer` → `inji-web` → `ref-verifier` | ldp_vc | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261005T211554-c54de1`](live-holder-web/runs/TC_PG_WEB_06.json) |

Run files (`<spec>/runs/<case id>.json`) hold the redacted record of each run: configuration, events and every HTTP exchange. They are kept in git with the matrices; the nightly workflow also publishes them as a build artifact. Why a cell fails is under "Errors and reasons" on its spec page; the gaps are in [docs/gaps/gaps.json](../../gaps/gaps.json).
