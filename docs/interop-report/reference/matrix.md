# Compatibility matrix: reference

Run on 2026-10-13, 23:32:40 to 23:33:16 UTC (36 s), from `reference.yaml` in reference mode, against playground server 0.1.0 started in-process with the reference roles.

Reference issuer, wallet and verifier against the scenario catalogue; no Inji module takes part.

**123 of 123 cells gave the verdict their spec expects**. Verdicts: 119 pass, 0 fail, 0 error, 4 not supported.

## Versions

| Role | Name | Ecosystem | Version |
| ---- | ---- | --------- | ------- |
| `mobile-wallet` | Phone wallet (Inji Wallet or any OpenID4VC app) | external | any |
| `ref-issuer` | Reference issuer | reference | 0.1.0 |
| `ref-verifier` | Reference verifier | reference | 0.1.0 |
| `ref-verifier-dc-api` | Reference verifier (Digital Credentials API) | reference | 0.1.0 |
| `ref-wallet` | Reference wallet (headless) | reference | 0.1.0 |

## Cells

| Case | Issuer → wallet → verifier | Format | Profiles | Scenario | Expected | Actual | Verdict | Matches spec | Run |
| ---- | -------------------------- | ------ | -------- | -------- | -------- | ------ | ------- | ------------ | --- |
| TC_PG_HAPPY_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T233241-654b4e`](runs/TC_PG_HAPPY_01.json) |
| TC_PG_HAPPY_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233241-a32bb2`](runs/TC_PG_HAPPY_02.json) |
| TC_PG_HAPPY_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T233241-564543`](runs/TC_PG_HAPPY_03.json) |
| TC_PG_HAPPY_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233242-ebe684`](runs/TC_PG_HAPPY_04.json) |
| TC_PG_HAPPY_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T233242-e00436`](runs/TC_PG_HAPPY_05.json) |
| TC_PG_HAPPY_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233242-6538f2`](runs/TC_PG_HAPPY_06.json) |
| TC_PG_TAMPER_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233243-cdebb2`](runs/TC_PG_TAMPER_01.json) |
| TC_PG_TAMPER_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233243-b9fd60`](runs/TC_PG_TAMPER_02.json) |
| TC_PG_TAMPER_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233243-4cdd36`](runs/TC_PG_TAMPER_03.json) |
| TC_PG_TAMPER_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233243-34a25e`](runs/TC_PG_TAMPER_04.json) |
| TC_PG_TAMPER_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233244-a3b870`](runs/TC_PG_TAMPER_05.json) |
| TC_PG_TAMPER_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233244-e48626`](runs/TC_PG_TAMPER_06.json) |
| TC_PG_TAMPER_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233244-d7b969`](runs/TC_PG_TAMPER_07.json) |
| TC_PG_TAMPER_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233245-fac9d6`](runs/TC_PG_TAMPER_08.json) |
| TC_PG_TAMPER_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233245-98315b`](runs/TC_PG_TAMPER_09.json) |
| TC_PG_TAMPER_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233245-9ca359`](runs/TC_PG_TAMPER_10.json) |
| TC_PG_TAMPER_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233246-1011ba`](runs/TC_PG_TAMPER_11.json) |
| TC_PG_TAMPER_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233246-70b3c3`](runs/TC_PG_TAMPER_12.json) |
| TC_PG_TAMPER_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233246-890e54`](runs/TC_PG_TAMPER_13.json) |
| TC_PG_TAMPER_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233247-f06759`](runs/TC_PG_TAMPER_14.json) |
| TC_PG_TAMPER_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233247-74a72b`](runs/TC_PG_TAMPER_15.json) |
| TC_PG_TAMPER_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233247-bab509`](runs/TC_PG_TAMPER_16.json) |
| TC_PG_TAMPER_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233247-2ca72a`](runs/TC_PG_TAMPER_17.json) |
| TC_PG_TAMPER_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233248-8eee8e`](runs/TC_PG_TAMPER_18.json) |
| TC_PG_TAMPER_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233248-8566c2`](runs/TC_PG_TAMPER_19.json) |
| TC_PG_TAMPER_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233248-b4cfbb`](runs/TC_PG_TAMPER_20.json) |
| TC_PG_TAMPER_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233249-31cc6a`](runs/TC_PG_TAMPER_21.json) |
| TC_PG_TAMPER_22 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233249-e9ab90`](runs/TC_PG_TAMPER_22.json) |
| TC_PG_TAMPER_23 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233249-2ffb60`](runs/TC_PG_TAMPER_23.json) |
| TC_PG_TAMPER_24 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233250-06a809`](runs/TC_PG_TAMPER_24.json) |
| TC_PG_TAMPER_25 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233250-a2ca20`](runs/TC_PG_TAMPER_25.json) |
| TC_PG_TAMPER_26 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233250-14ea2b`](runs/TC_PG_TAMPER_26.json) |
| TC_PG_TAMPER_27 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233251-1ed803`](runs/TC_PG_TAMPER_27.json) |
| TC_PG_TAMPER_28 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233251-59fd64`](runs/TC_PG_TAMPER_28.json) |
| TC_PG_TAMPER_29 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233251-527463`](runs/TC_PG_TAMPER_29.json) |
| TC_PG_TAMPER_30 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233251-75321e`](runs/TC_PG_TAMPER_30.json) |
| TC_PG_TAMPER_31 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233252-99666d`](runs/TC_PG_TAMPER_31.json) |
| TC_PG_TAMPER_32 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233252-0be768`](runs/TC_PG_TAMPER_32.json) |
| TC_PG_TAMPER_33 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T233252-b1308f`](runs/TC_PG_TAMPER_33.json) |
| TC_PG_TAMPER_34 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T233253-85fd59`](runs/TC_PG_TAMPER_34.json) |
| TC_PG_TAMPER_35 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T233253-bcf6b3`](runs/TC_PG_TAMPER_35.json) |
| TC_PG_TAMPER_36 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T233253-aa2de0`](runs/TC_PG_TAMPER_36.json) |
| TC_PG_TAMPER_37 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T233254-892cfd`](runs/TC_PG_TAMPER_37.json) |
| TC_PG_TAMPER_38 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T233254-269782`](runs/TC_PG_TAMPER_38.json) |
| TC_PG_TAMPER_39 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T233254-a31efd`](runs/TC_PG_TAMPER_39.json) |
| TC_PG_TAMPER_40 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T233254-7c7d09`](runs/TC_PG_TAMPER_40.json) |
| TC_PG_TAMPER_41 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233255-63c44f`](runs/TC_PG_TAMPER_41.json) |
| TC_PG_TAMPER_42 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233255-a2c03e`](runs/TC_PG_TAMPER_42.json) |
| TC_PG_TAMPER_43 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233255-914140`](runs/TC_PG_TAMPER_43.json) |
| TC_PG_TAMPER_44 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233256-14e3d9`](runs/TC_PG_TAMPER_44.json) |
| TC_PG_TAMPER_45 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233256-c94f4d`](runs/TC_PG_TAMPER_45.json) |
| TC_PG_TAMPER_46 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233256-5d7c5f`](runs/TC_PG_TAMPER_46.json) |
| TC_PG_TAMPER_47 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233257-6beb90`](runs/TC_PG_TAMPER_47.json) |
| TC_PG_TAMPER_48 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233257-745d6f`](runs/TC_PG_TAMPER_48.json) |
| TC_PG_TAMPER_49 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233257-7db699`](runs/TC_PG_TAMPER_49.json) |
| TC_PG_TAMPER_50 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233257-de5789`](runs/TC_PG_TAMPER_50.json) |
| TC_PG_TAMPER_51 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233258-547d0e`](runs/TC_PG_TAMPER_51.json) |
| TC_PG_TAMPER_52 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233258-259515`](runs/TC_PG_TAMPER_52.json) |
| TC_PG_TAMPER_53 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T233258-85d6ea`](runs/TC_PG_TAMPER_53.json) |
| TC_PG_TAMPER_54 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T233259-73ea9b`](runs/TC_PG_TAMPER_54.json) |
| TC_PG_TAMPER_55 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T233259-fcddfe`](runs/TC_PG_TAMPER_55.json) |
| TC_PG_TAMPER_56 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T233259-5b0769`](runs/TC_PG_TAMPER_56.json) |
| TC_PG_TAMPER_57 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T233259-ada0a7`](runs/TC_PG_TAMPER_57.json) |
| TC_PG_TAMPER_58 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T233300-41a81b`](runs/TC_PG_TAMPER_58.json) |
| TC_PG_TAMPER_59 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T233300-175d21`](runs/TC_PG_TAMPER_59.json) |
| TC_PG_TAMPER_60 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T233300-f2ba22`](runs/TC_PG_TAMPER_60.json) |
| TC_PG_TAMPER_61 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T233301-d18e6f`](runs/TC_PG_TAMPER_61.json) |
| TC_PG_TAMPER_62 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T233301-5c2329`](runs/TC_PG_TAMPER_62.json) |
| TC_PG_TAMPER_63 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T233301-98497d`](runs/TC_PG_TAMPER_63.json) |
| TC_PG_TAMPER_64 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T233301-734d8a`](runs/TC_PG_TAMPER_64.json) |
| TC_PG_TAMPER_65 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T233302-46cf0d`](runs/TC_PG_TAMPER_65.json) |
| TC_PG_TAMPER_66 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T233302-e7ebfc`](runs/TC_PG_TAMPER_66.json) |
| TC_PG_TAMPER_67 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T233302-5c6f28`](runs/TC_PG_TAMPER_67.json) |
| TC_PG_TAMPER_68 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T233303-b30951`](runs/TC_PG_TAMPER_68.json) |
| TC_PG_TAMPER_69 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T233303-5baa72`](runs/TC_PG_TAMPER_69.json) |
| TC_PG_TAMPER_70 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T233303-0906da`](runs/TC_PG_TAMPER_70.json) |
| TC_PG_PROBE_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T233304-ec7ee3`](runs/TC_PG_PROBE_01.json) |
| TC_PG_PROBE_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T233304-b0283d`](runs/TC_PG_PROBE_02.json) |
| TC_PG_PROBE_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T233304-c1f24c`](runs/TC_PG_PROBE_03.json) |
| TC_PG_PROBE_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T233304-766a2d`](runs/TC_PG_PROBE_04.json) |
| TC_PG_PROBE_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T233305-5e63d0`](runs/TC_PG_PROBE_05.json) |
| TC_PG_PROBE_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T233305-c9c9dd`](runs/TC_PG_PROBE_06.json) |
| TC_PG_PROBE_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T233305-1365b0`](runs/TC_PG_PROBE_07.json) |
| TC_PG_PROBE_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T233306-3f4735`](runs/TC_PG_PROBE_08.json) |
| TC_PG_PROBE_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T233306-994ba4`](runs/TC_PG_PROBE_09.json) |
| TC_PG_PROBE_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T233306-586f67`](runs/TC_PG_PROBE_10.json) |
| TC_PG_PROBE_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T233306-6293a4`](runs/TC_PG_PROBE_11.json) |
| TC_PG_PROBE_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T233307-6af825`](runs/TC_PG_PROBE_12.json) |
| TC_PG_PROBE_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T233307-9a3ac5`](runs/TC_PG_PROBE_13.json) |
| TC_PG_PROBE_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T233307-7165a2`](runs/TC_PG_PROBE_14.json) |
| TC_PG_PROBE_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T233308-7d0660`](runs/TC_PG_PROBE_15.json) |
| TC_PG_PROBE_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T233308-2657c1`](runs/TC_PG_PROBE_16.json) |
| TC_PG_PROBE_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T233308-f0989d`](runs/TC_PG_PROBE_17.json) |
| TC_PG_PROBE_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T233309-e0703c`](runs/TC_PG_PROBE_18.json) |
| TC_PG_DCAPI_01 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233309-0e5cd8`](runs/TC_PG_DCAPI_01.json) |
| TC_PG_DCAPI_02 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233309-c4aa0b`](runs/TC_PG_DCAPI_02.json) |
| TC_PG_DCAPI_03 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233309-f91118`](runs/TC_PG_DCAPI_03.json) |
| TC_PG_DCAPI_04 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233310-9b64aa`](runs/TC_PG_DCAPI_04.json) |
| TC_PG_DCAPI_05 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233310-f86e3f`](runs/TC_PG_DCAPI_05.json) |
| TC_PG_NS_01 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T233310-c7ffff`](runs/TC_PG_NS_01.json) |
| TC_PG_NS_02 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T233310-701250`](runs/TC_PG_NS_02.json) |
| TC_PG_NS_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-did-canonical | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T233310-c8cd51`](runs/TC_PG_NS_03.json) |
| TC_PG_MDOC_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T233310-9d5122`](runs/TC_PG_MDOC_01.json) |
| TC_PG_MDOC_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T233311-342775`](runs/TC_PG_MDOC_02.json) |
| TC_PG_MDOC_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233311-91dc8d`](runs/TC_PG_MDOC_03.json) |
| TC_PG_MDOC_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T233311-960c91`](runs/TC_PG_MDOC_04.json) |
| TC_PG_MDOC_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233311-53571f`](runs/TC_PG_MDOC_05.json) |
| TC_PG_MDOC_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T233312-e3bae5`](runs/TC_PG_MDOC_06.json) |
| TC_PG_MDOC_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233312-8bb29f`](runs/TC_PG_MDOC_07.json) |
| TC_PG_MDOC_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T233312-e0b668`](runs/TC_PG_MDOC_08.json) |
| TC_PG_MDOC_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233313-4a17a7`](runs/TC_PG_MDOC_09.json) |
| TC_PG_MDOC_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T233313-3a09e4`](runs/TC_PG_MDOC_10.json) |
| TC_PG_MDOC_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233313-86c766`](runs/TC_PG_MDOC_11.json) |
| TC_PG_MDOC_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233313-feecad`](runs/TC_PG_MDOC_12.json) |
| TC_PG_MDOC_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233314-27e8d3`](runs/TC_PG_MDOC_13.json) |
| TC_PG_MDOC_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T233314-4b1109`](runs/TC_PG_MDOC_14.json) |
| TC_PG_MDOC_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233314-6066a4`](runs/TC_PG_MDOC_15.json) |
| TC_PG_MDOC_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T233315-63895b`](runs/TC_PG_MDOC_16.json) |
| TC_PG_MDOC_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233315-263d16`](runs/TC_PG_MDOC_17.json) |
| TC_PG_MDOC_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T233315-b0c528`](runs/TC_PG_MDOC_18.json) |
| TC_PG_MDOC_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T233316-7709f9`](runs/TC_PG_MDOC_19.json) |
| TC_PG_MDOC_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T233316-c80567`](runs/TC_PG_MDOC_20.json) |
| TC_PG_MDOC_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T233316-7e0c16`](runs/TC_PG_MDOC_21.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Those files are not kept in git (about 5 MB per run of the reference matrix); the nightly workflow publishes them as a build artifact.

## Errors and reasons

- TC_PG_NS_01: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Bad issuer signature" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_02: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_03: `compatibility.scenario.issuer-unsupported` at playground.admin: The scenario "Probe: canonical did:jwk for a padded holder binding" needs the issuer inji-certify or inji-certify-ac; Reference issuer cannot produce it.
- TC_PG_MDOC_21: `compatibility.scenario.format-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" applies only to vc+sd-jwt, dc+sd-jwt.
