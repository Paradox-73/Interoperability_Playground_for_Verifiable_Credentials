# Compatibility matrix: reference

Run on 2026-10-13, 18:00:37 to 18:01:07 UTC (30 s), from `reference.yaml` in reference mode, against playground server 0.1.0 started in-process with the reference roles.

Reference issuer, wallet and verifier against the scenario catalogue; no Inji module takes part.

**117 of 117 cells gave the verdict their spec expects**. Verdicts: 113 pass, 0 fail, 0 error, 4 not supported.

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
| TC_PG_HAPPY_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T180037-36f398`](runs/TC_PG_HAPPY_01.json) |
| TC_PG_HAPPY_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180038-aa83fe`](runs/TC_PG_HAPPY_02.json) |
| TC_PG_HAPPY_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T180038-63f60d`](runs/TC_PG_HAPPY_03.json) |
| TC_PG_HAPPY_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180038-7a4f77`](runs/TC_PG_HAPPY_04.json) |
| TC_PG_HAPPY_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T180039-7d64c0`](runs/TC_PG_HAPPY_05.json) |
| TC_PG_HAPPY_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180039-5b56e3`](runs/TC_PG_HAPPY_06.json) |
| TC_PG_TAMPER_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180039-049f15`](runs/TC_PG_TAMPER_01.json) |
| TC_PG_TAMPER_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180039-aca3ce`](runs/TC_PG_TAMPER_02.json) |
| TC_PG_TAMPER_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180040-76184f`](runs/TC_PG_TAMPER_03.json) |
| TC_PG_TAMPER_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180040-5bffb5`](runs/TC_PG_TAMPER_04.json) |
| TC_PG_TAMPER_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180040-b330c1`](runs/TC_PG_TAMPER_05.json) |
| TC_PG_TAMPER_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180040-3c9be0`](runs/TC_PG_TAMPER_06.json) |
| TC_PG_TAMPER_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180041-33a1e6`](runs/TC_PG_TAMPER_07.json) |
| TC_PG_TAMPER_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180041-3aeacd`](runs/TC_PG_TAMPER_08.json) |
| TC_PG_TAMPER_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180041-0ae736`](runs/TC_PG_TAMPER_09.json) |
| TC_PG_TAMPER_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180042-f4d728`](runs/TC_PG_TAMPER_10.json) |
| TC_PG_TAMPER_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180042-d24544`](runs/TC_PG_TAMPER_11.json) |
| TC_PG_TAMPER_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180042-48cfc4`](runs/TC_PG_TAMPER_12.json) |
| TC_PG_TAMPER_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180042-60ccbf`](runs/TC_PG_TAMPER_13.json) |
| TC_PG_TAMPER_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180043-900eae`](runs/TC_PG_TAMPER_14.json) |
| TC_PG_TAMPER_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180043-d0271f`](runs/TC_PG_TAMPER_15.json) |
| TC_PG_TAMPER_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180043-59446f`](runs/TC_PG_TAMPER_16.json) |
| TC_PG_TAMPER_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180043-e4e60c`](runs/TC_PG_TAMPER_17.json) |
| TC_PG_TAMPER_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180044-ace971`](runs/TC_PG_TAMPER_18.json) |
| TC_PG_TAMPER_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180044-1359bc`](runs/TC_PG_TAMPER_19.json) |
| TC_PG_TAMPER_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180044-4e4796`](runs/TC_PG_TAMPER_20.json) |
| TC_PG_TAMPER_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180044-618608`](runs/TC_PG_TAMPER_21.json) |
| TC_PG_TAMPER_22 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180045-527ecc`](runs/TC_PG_TAMPER_22.json) |
| TC_PG_TAMPER_23 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180045-545397`](runs/TC_PG_TAMPER_23.json) |
| TC_PG_TAMPER_24 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180045-8701bb`](runs/TC_PG_TAMPER_24.json) |
| TC_PG_TAMPER_25 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180046-ce7427`](runs/TC_PG_TAMPER_25.json) |
| TC_PG_TAMPER_26 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180046-b0f663`](runs/TC_PG_TAMPER_26.json) |
| TC_PG_TAMPER_27 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180046-659fd3`](runs/TC_PG_TAMPER_27.json) |
| TC_PG_TAMPER_28 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180046-2459b1`](runs/TC_PG_TAMPER_28.json) |
| TC_PG_TAMPER_29 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180047-ce5743`](runs/TC_PG_TAMPER_29.json) |
| TC_PG_TAMPER_30 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180047-d3a317`](runs/TC_PG_TAMPER_30.json) |
| TC_PG_TAMPER_31 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180047-da5967`](runs/TC_PG_TAMPER_31.json) |
| TC_PG_TAMPER_32 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180047-511150`](runs/TC_PG_TAMPER_32.json) |
| TC_PG_TAMPER_33 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T180048-28e32d`](runs/TC_PG_TAMPER_33.json) |
| TC_PG_TAMPER_34 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T180048-cb6ad3`](runs/TC_PG_TAMPER_34.json) |
| TC_PG_TAMPER_35 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T180048-5406ed`](runs/TC_PG_TAMPER_35.json) |
| TC_PG_TAMPER_36 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T180048-598428`](runs/TC_PG_TAMPER_36.json) |
| TC_PG_TAMPER_37 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T180049-4a79dd`](runs/TC_PG_TAMPER_37.json) |
| TC_PG_TAMPER_38 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T180049-5defb5`](runs/TC_PG_TAMPER_38.json) |
| TC_PG_TAMPER_39 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T180049-8b87c6`](runs/TC_PG_TAMPER_39.json) |
| TC_PG_TAMPER_40 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T180049-3148d2`](runs/TC_PG_TAMPER_40.json) |
| TC_PG_TAMPER_41 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180050-f6605a`](runs/TC_PG_TAMPER_41.json) |
| TC_PG_TAMPER_42 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180050-82b32f`](runs/TC_PG_TAMPER_42.json) |
| TC_PG_TAMPER_43 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180050-f6b973`](runs/TC_PG_TAMPER_43.json) |
| TC_PG_TAMPER_44 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180051-4e71ad`](runs/TC_PG_TAMPER_44.json) |
| TC_PG_TAMPER_45 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180051-3cdb47`](runs/TC_PG_TAMPER_45.json) |
| TC_PG_TAMPER_46 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180051-971d56`](runs/TC_PG_TAMPER_46.json) |
| TC_PG_TAMPER_47 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180051-832254`](runs/TC_PG_TAMPER_47.json) |
| TC_PG_TAMPER_48 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180052-f068e9`](runs/TC_PG_TAMPER_48.json) |
| TC_PG_TAMPER_49 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180052-4260d1`](runs/TC_PG_TAMPER_49.json) |
| TC_PG_TAMPER_50 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180052-f44077`](runs/TC_PG_TAMPER_50.json) |
| TC_PG_TAMPER_51 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180052-9f1f21`](runs/TC_PG_TAMPER_51.json) |
| TC_PG_TAMPER_52 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180053-3d1f92`](runs/TC_PG_TAMPER_52.json) |
| TC_PG_TAMPER_53 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T180053-b6c85a`](runs/TC_PG_TAMPER_53.json) |
| TC_PG_TAMPER_54 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T180053-fd5259`](runs/TC_PG_TAMPER_54.json) |
| TC_PG_TAMPER_55 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T180053-991bfd`](runs/TC_PG_TAMPER_55.json) |
| TC_PG_TAMPER_56 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T180054-b8a6d0`](runs/TC_PG_TAMPER_56.json) |
| TC_PG_TAMPER_57 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T180054-66073b`](runs/TC_PG_TAMPER_57.json) |
| TC_PG_TAMPER_58 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T180054-8a14b6`](runs/TC_PG_TAMPER_58.json) |
| TC_PG_TAMPER_59 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T180055-f457df`](runs/TC_PG_TAMPER_59.json) |
| TC_PG_TAMPER_60 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T180055-8e3308`](runs/TC_PG_TAMPER_60.json) |
| TC_PG_TAMPER_61 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T180055-24dc17`](runs/TC_PG_TAMPER_61.json) |
| TC_PG_TAMPER_62 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T180055-79ed8a`](runs/TC_PG_TAMPER_62.json) |
| TC_PG_TAMPER_63 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T180056-751e64`](runs/TC_PG_TAMPER_63.json) |
| TC_PG_TAMPER_64 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T180056-e06a02`](runs/TC_PG_TAMPER_64.json) |
| TC_PG_PROBE_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T180056-a3845b`](runs/TC_PG_PROBE_01.json) |
| TC_PG_PROBE_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T180056-1c9cc1`](runs/TC_PG_PROBE_02.json) |
| TC_PG_PROBE_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T180057-d53f14`](runs/TC_PG_PROBE_03.json) |
| TC_PG_PROBE_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T180057-8e7666`](runs/TC_PG_PROBE_04.json) |
| TC_PG_PROBE_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T180057-60ea73`](runs/TC_PG_PROBE_05.json) |
| TC_PG_PROBE_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T180057-3bf476`](runs/TC_PG_PROBE_06.json) |
| TC_PG_PROBE_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T180058-e063e9`](runs/TC_PG_PROBE_07.json) |
| TC_PG_PROBE_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T180058-4527db`](runs/TC_PG_PROBE_08.json) |
| TC_PG_PROBE_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T180058-f22a3d`](runs/TC_PG_PROBE_09.json) |
| TC_PG_PROBE_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T180058-f0ae59`](runs/TC_PG_PROBE_10.json) |
| TC_PG_PROBE_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T180059-eaf78f`](runs/TC_PG_PROBE_11.json) |
| TC_PG_PROBE_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T180059-0f05a6`](runs/TC_PG_PROBE_12.json) |
| TC_PG_PROBE_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T180059-d307d5`](runs/TC_PG_PROBE_13.json) |
| TC_PG_PROBE_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T180100-24860e`](runs/TC_PG_PROBE_14.json) |
| TC_PG_PROBE_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T180100-3d43bf`](runs/TC_PG_PROBE_15.json) |
| TC_PG_PROBE_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T180100-d3644c`](runs/TC_PG_PROBE_16.json) |
| TC_PG_PROBE_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T180100-0cb600`](runs/TC_PG_PROBE_17.json) |
| TC_PG_PROBE_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T180101-f65bd3`](runs/TC_PG_PROBE_18.json) |
| TC_PG_DCAPI_01 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180101-5bef0c`](runs/TC_PG_DCAPI_01.json) |
| TC_PG_DCAPI_02 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180101-b5f3b6`](runs/TC_PG_DCAPI_02.json) |
| TC_PG_DCAPI_03 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180101-fbcdb1`](runs/TC_PG_DCAPI_03.json) |
| TC_PG_DCAPI_04 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180102-d9e7c3`](runs/TC_PG_DCAPI_04.json) |
| TC_PG_DCAPI_05 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180102-65d914`](runs/TC_PG_DCAPI_05.json) |
| TC_PG_NS_01 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T180102-644049`](runs/TC_PG_NS_01.json) |
| TC_PG_NS_02 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T180102-0182a1`](runs/TC_PG_NS_02.json) |
| TC_PG_NS_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-did-canonical | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T180102-7ee0d2`](runs/TC_PG_NS_03.json) |
| TC_PG_MDOC_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T180102-6d8ae6`](runs/TC_PG_MDOC_01.json) |
| TC_PG_MDOC_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T180102-1f58cf`](runs/TC_PG_MDOC_02.json) |
| TC_PG_MDOC_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180103-164b39`](runs/TC_PG_MDOC_03.json) |
| TC_PG_MDOC_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T180103-27fbdc`](runs/TC_PG_MDOC_04.json) |
| TC_PG_MDOC_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180103-f32cdd`](runs/TC_PG_MDOC_05.json) |
| TC_PG_MDOC_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T180104-d21545`](runs/TC_PG_MDOC_06.json) |
| TC_PG_MDOC_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180104-ce1f2c`](runs/TC_PG_MDOC_07.json) |
| TC_PG_MDOC_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T180104-014510`](runs/TC_PG_MDOC_08.json) |
| TC_PG_MDOC_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180104-d126f0`](runs/TC_PG_MDOC_09.json) |
| TC_PG_MDOC_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T180105-982530`](runs/TC_PG_MDOC_10.json) |
| TC_PG_MDOC_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180105-d7b4e2`](runs/TC_PG_MDOC_11.json) |
| TC_PG_MDOC_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180105-67e1b6`](runs/TC_PG_MDOC_12.json) |
| TC_PG_MDOC_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180105-41ac83`](runs/TC_PG_MDOC_13.json) |
| TC_PG_MDOC_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T180106-83da22`](runs/TC_PG_MDOC_14.json) |
| TC_PG_MDOC_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180106-371936`](runs/TC_PG_MDOC_15.json) |
| TC_PG_MDOC_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T180106-7b8e56`](runs/TC_PG_MDOC_16.json) |
| TC_PG_MDOC_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180106-799336`](runs/TC_PG_MDOC_17.json) |
| TC_PG_MDOC_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T180107-91d391`](runs/TC_PG_MDOC_18.json) |
| TC_PG_MDOC_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T180107-88480e`](runs/TC_PG_MDOC_19.json) |
| TC_PG_MDOC_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T180107-463d8b`](runs/TC_PG_MDOC_20.json) |
| TC_PG_MDOC_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T180107-e70948`](runs/TC_PG_MDOC_21.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Those files are not kept in git (about 5 MB per run of the reference matrix); the nightly workflow publishes them as a build artifact.

## Errors and reasons

- TC_PG_NS_01: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Bad issuer signature" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_02: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_03: `compatibility.scenario.issuer-unsupported` at playground.admin: The scenario "Probe: canonical did:jwk for a padded holder binding" needs the issuer inji-certify or inji-certify-ac; Reference issuer cannot produce it.
- TC_PG_MDOC_21: `compatibility.scenario.format-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" applies only to vc+sd-jwt, dc+sd-jwt.
