# Live compatibility matrix

Combined from 2 specs, run on 2026-10-14. Each spec ran in its own session against the Inji stack; its page has the full detail.

| Spec | Run on (UTC) | Cells | As specified | Pass | Fail | Error | Not supported | Duration |
| ---- | ------------ | ----- | ------------ | ---- | ---- | ----- | ------------- | -------- |
| [live-core](live-core/matrix.md) | 2026-10-14 00:06 | 16 | 16 | 11 | 4 | 0 | 1 | 1 min 17 s |
| [live-holder-web](live-holder-web/matrix.md) | 2026-10-14 00:07 | 10 | 10 | 4 | 6 | 0 | 0 | 40 s |

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
| live-core | TC_PG_LIVE_01 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | happy | VALID | VALID | Pass | yes | [`20261014T000618-4eabfe`](live-core/runs/TC_PG_LIVE_01.json) |
| live-core | TC_PG_LIVE_02 | `inji-certify` → `ref-wallet` → `inji-verify` | ldp_vc | happy | VALID | VALID | Pass | yes | [`20261014T000619-f0527d`](live-core/runs/TC_PG_LIVE_02.json) |
| live-core | TC_PG_LIVE_03 | `inji-certify` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | happy | VALID | VALID | Pass | yes | [`20261014T000624-7735f4`](live-core/runs/TC_PG_LIVE_03.json) |
| live-core | TC_PG_LIVE_04 | `inji-certify` → `ref-wallet` → `ref-verifier` | ldp_vc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261014T000625-3963ac`](live-core/runs/TC_PG_LIVE_04.json) |
| live-core | TC_PG_LIVE_05 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | happy | VALID | VALID | Pass | yes | [`20261014T000626-f60d34`](live-core/runs/TC_PG_LIVE_05.json) |
| live-core | TC_PG_LIVE_06 | `ref-issuer` → `ref-wallet` → `inji-verify` | vc+sd-jwt | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261014T000629-ae4eb7`](live-core/runs/TC_PG_LIVE_06.json) |
| live-core | TC_PG_LIVE_07 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | expired | EXPIRED | EXPIRED | Pass | yes | [`20261014T000630-3960c7`](live-core/runs/TC_PG_LIVE_07.json) |
| live-core | TC_PG_LIVE_08 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | bad-signature | INVALID | INVALID | Pass | yes | [`20261014T000632-06f49c`](live-core/runs/TC_PG_LIVE_08.json) |
| live-core | TC_PG_LIVE_09 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261014T000633-9ae478`](live-core/runs/TC_PG_LIVE_09.json) |
| live-core | TC_PG_LIVE_10 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261014T000634-da5553`](live-core/runs/TC_PG_LIVE_10.json) |
| live-core | TC_PG_LIVE_11 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261014T000634-7516df`](live-core/runs/TC_PG_LIVE_11.json) |
| live-core | TC_PG_LIVE_12 | `inji-certify` → `ref-wallet` → `inji-verify` | vc+sd-jwt | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261014T000635-75f6a9`](live-core/runs/TC_PG_LIVE_12.json) |
| live-core | TC_PG_LIVE_14 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261014T000636-340b83`](live-core/runs/TC_PG_LIVE_14.json) |
| live-core | TC_PG_LIVE_13 | `ref-issuer` → `ref-wallet` → `inji-verify` | dc+sd-jwt | happy | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261014T000639-f80b8c`](live-core/runs/TC_PG_LIVE_13.json) |
| live-core | TC_PG_LIVE_15 | `inji-certify` → `ref-wallet` → `ref-verifier` | mso_mdoc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261014T000639-579719`](live-core/runs/TC_PG_LIVE_15.json) |
| live-core | TC_PG_LIVE_16 | `ref-issuer` → `ref-wallet` → `inji-verify` | mso_mdoc | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261014T000640-e2660f`](live-core/runs/TC_PG_LIVE_16.json) |
| live-holder-web | TC_PG_WEB_01 | `inji-certify-ac` → `ref-wallet` → `inji-verify` | vc+sd-jwt | happy | VALID | VALID | Pass | yes | [`20261014T000741-e9b713`](live-holder-web/runs/TC_PG_WEB_01.json) |
| live-holder-web | TC_PG_WEB_02 | `inji-certify-ac` → `ref-wallet` → `inji-verify` | ldp_vc | happy | VALID | VALID | Pass | yes | [`20261014T000742-4c4c2e`](live-holder-web/runs/TC_PG_WEB_02.json) |
| live-holder-web | TC_PG_WEB_03 | `inji-certify-ac` → `inji-web` → `inji-verify` | ldp_vc | happy | VALID | VALID | Pass | yes | [`20261014T000746-65e04d`](live-holder-web/runs/TC_PG_WEB_03.json) |
| live-holder-web | TC_PG_WEB_04 | `inji-certify-ac` → `inji-web` → `inji-verify` | vc+sd-jwt | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261014T000756-4b430c`](live-holder-web/runs/TC_PG_WEB_04.json) |
| live-holder-web | TC_PG_WEB_05 | `ref-issuer` → `inji-web` → `inji-verify` | ldp_vc | happy | VALID | VALID | Pass | yes | [`20261014T000758-be97a8`](live-holder-web/runs/TC_PG_WEB_05.json) |
| live-holder-web | TC_PG_WEB_06 | `ref-issuer` → `inji-web` → `ref-verifier` | ldp_vc | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261014T000805-669579`](live-holder-web/runs/TC_PG_WEB_06.json) |
| live-holder-web | TC_PG_WEB_07 | `ref-issuer` → `inji-web` → `inji-verify` | ldp_vc | holder-proof-es256 | VALID | INVALID | Fail (spec: Fail) | yes | [`20261014T000808-988afb`](live-holder-web/runs/TC_PG_WEB_07.json) |
| live-holder-web | TC_PG_WEB_08 | `ref-issuer` → `ref-wallet` → `inji-verify` | ldp_vc | holder-proof-es256 | VALID | INVALID | Fail (spec: Fail) | yes | [`20261014T000816-accabb`](live-holder-web/runs/TC_PG_WEB_08.json) |
| live-holder-web | TC_PG_WEB_09 | `inji-certify-ac` → `ref-wallet` → `ref-verifier` | mso_mdoc | happy | VALID | INVALID | Fail (spec: Fail) | yes | [`20261014T000819-f20616`](live-holder-web/runs/TC_PG_WEB_09.json) |
| live-holder-web | TC_PG_WEB_10 | `inji-certify-ac` → `inji-web` → `inji-verify` | mso_mdoc | happy | VALID | ERROR | Fail (spec: Fail) | yes | [`20261014T000820-8f1202`](live-holder-web/runs/TC_PG_WEB_10.json) |

Run files (`<spec>/runs/<case id>.json`) hold the redacted record of each run: configuration, events and every HTTP exchange. They are kept in git with the matrices; the nightly workflow also publishes them as a build artifact. Why a cell fails is under "Errors and reasons" on its spec page; the gaps are in [docs/gaps/gaps.json](../../gaps/gaps.json).
