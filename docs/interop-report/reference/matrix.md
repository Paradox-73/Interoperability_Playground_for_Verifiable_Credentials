# Compatibility matrix: reference

Run on 2026-10-13, 23:58:38 to 23:59:14 UTC (36 s), from `reference.yaml` in reference mode, against playground server 0.1.0 started in-process with the reference roles.

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
| TC_PG_HAPPY_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T235838-9404e9`](runs/TC_PG_HAPPY_01.json) |
| TC_PG_HAPPY_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235838-60fb16`](runs/TC_PG_HAPPY_02.json) |
| TC_PG_HAPPY_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T235838-fb83f5`](runs/TC_PG_HAPPY_03.json) |
| TC_PG_HAPPY_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235839-d1b21d`](runs/TC_PG_HAPPY_04.json) |
| TC_PG_HAPPY_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T235839-fab306`](runs/TC_PG_HAPPY_05.json) |
| TC_PG_HAPPY_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235839-3fca52`](runs/TC_PG_HAPPY_06.json) |
| TC_PG_TAMPER_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235840-0bae05`](runs/TC_PG_TAMPER_01.json) |
| TC_PG_TAMPER_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235840-9c8f03`](runs/TC_PG_TAMPER_02.json) |
| TC_PG_TAMPER_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235840-89d0c2`](runs/TC_PG_TAMPER_03.json) |
| TC_PG_TAMPER_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235841-32509b`](runs/TC_PG_TAMPER_04.json) |
| TC_PG_TAMPER_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235841-b031df`](runs/TC_PG_TAMPER_05.json) |
| TC_PG_TAMPER_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235841-3af3b5`](runs/TC_PG_TAMPER_06.json) |
| TC_PG_TAMPER_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235842-6d83e7`](runs/TC_PG_TAMPER_07.json) |
| TC_PG_TAMPER_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235842-840ec5`](runs/TC_PG_TAMPER_08.json) |
| TC_PG_TAMPER_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235842-b78aa5`](runs/TC_PG_TAMPER_09.json) |
| TC_PG_TAMPER_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235842-4a08bf`](runs/TC_PG_TAMPER_10.json) |
| TC_PG_TAMPER_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235843-d108bf`](runs/TC_PG_TAMPER_11.json) |
| TC_PG_TAMPER_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235843-432606`](runs/TC_PG_TAMPER_12.json) |
| TC_PG_TAMPER_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235843-7794b9`](runs/TC_PG_TAMPER_13.json) |
| TC_PG_TAMPER_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235844-97b925`](runs/TC_PG_TAMPER_14.json) |
| TC_PG_TAMPER_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235844-996bee`](runs/TC_PG_TAMPER_15.json) |
| TC_PG_TAMPER_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235844-a99ad8`](runs/TC_PG_TAMPER_16.json) |
| TC_PG_TAMPER_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235845-f810ff`](runs/TC_PG_TAMPER_17.json) |
| TC_PG_TAMPER_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235845-4d5957`](runs/TC_PG_TAMPER_18.json) |
| TC_PG_TAMPER_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235845-fc246f`](runs/TC_PG_TAMPER_19.json) |
| TC_PG_TAMPER_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235846-82ea6c`](runs/TC_PG_TAMPER_20.json) |
| TC_PG_TAMPER_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235846-b79d17`](runs/TC_PG_TAMPER_21.json) |
| TC_PG_TAMPER_22 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235846-fc9545`](runs/TC_PG_TAMPER_22.json) |
| TC_PG_TAMPER_23 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235846-7c546c`](runs/TC_PG_TAMPER_23.json) |
| TC_PG_TAMPER_24 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235847-f93503`](runs/TC_PG_TAMPER_24.json) |
| TC_PG_TAMPER_25 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235847-152be6`](runs/TC_PG_TAMPER_25.json) |
| TC_PG_TAMPER_26 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235847-47d59d`](runs/TC_PG_TAMPER_26.json) |
| TC_PG_TAMPER_27 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235848-8038e1`](runs/TC_PG_TAMPER_27.json) |
| TC_PG_TAMPER_28 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235848-71365e`](runs/TC_PG_TAMPER_28.json) |
| TC_PG_TAMPER_29 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235848-7a3543`](runs/TC_PG_TAMPER_29.json) |
| TC_PG_TAMPER_30 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235849-1f0a44`](runs/TC_PG_TAMPER_30.json) |
| TC_PG_TAMPER_31 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235849-68c9b5`](runs/TC_PG_TAMPER_31.json) |
| TC_PG_TAMPER_32 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235849-0dc274`](runs/TC_PG_TAMPER_32.json) |
| TC_PG_TAMPER_33 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T235849-d4b840`](runs/TC_PG_TAMPER_33.json) |
| TC_PG_TAMPER_34 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T235850-2f4c52`](runs/TC_PG_TAMPER_34.json) |
| TC_PG_TAMPER_35 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T235850-01f3d3`](runs/TC_PG_TAMPER_35.json) |
| TC_PG_TAMPER_36 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T235850-3bc527`](runs/TC_PG_TAMPER_36.json) |
| TC_PG_TAMPER_37 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T235851-f47ff0`](runs/TC_PG_TAMPER_37.json) |
| TC_PG_TAMPER_38 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T235851-c6636c`](runs/TC_PG_TAMPER_38.json) |
| TC_PG_TAMPER_39 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T235851-2b6d6b`](runs/TC_PG_TAMPER_39.json) |
| TC_PG_TAMPER_40 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T235852-c12ebb`](runs/TC_PG_TAMPER_40.json) |
| TC_PG_TAMPER_41 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235852-2cdece`](runs/TC_PG_TAMPER_41.json) |
| TC_PG_TAMPER_42 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235852-ea0e41`](runs/TC_PG_TAMPER_42.json) |
| TC_PG_TAMPER_43 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235852-a092b5`](runs/TC_PG_TAMPER_43.json) |
| TC_PG_TAMPER_44 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235853-c6a0ad`](runs/TC_PG_TAMPER_44.json) |
| TC_PG_TAMPER_45 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235853-52a762`](runs/TC_PG_TAMPER_45.json) |
| TC_PG_TAMPER_46 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235853-541820`](runs/TC_PG_TAMPER_46.json) |
| TC_PG_TAMPER_47 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235854-03b066`](runs/TC_PG_TAMPER_47.json) |
| TC_PG_TAMPER_48 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235854-f046cc`](runs/TC_PG_TAMPER_48.json) |
| TC_PG_TAMPER_49 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235854-c210b9`](runs/TC_PG_TAMPER_49.json) |
| TC_PG_TAMPER_50 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235855-fc5913`](runs/TC_PG_TAMPER_50.json) |
| TC_PG_TAMPER_51 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235855-03a960`](runs/TC_PG_TAMPER_51.json) |
| TC_PG_TAMPER_52 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235855-b66cf6`](runs/TC_PG_TAMPER_52.json) |
| TC_PG_TAMPER_53 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T235856-3b5ab8`](runs/TC_PG_TAMPER_53.json) |
| TC_PG_TAMPER_54 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T235856-cc84a4`](runs/TC_PG_TAMPER_54.json) |
| TC_PG_TAMPER_55 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T235856-a0f241`](runs/TC_PG_TAMPER_55.json) |
| TC_PG_TAMPER_56 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T235856-6078fb`](runs/TC_PG_TAMPER_56.json) |
| TC_PG_TAMPER_57 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T235857-1da151`](runs/TC_PG_TAMPER_57.json) |
| TC_PG_TAMPER_58 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T235857-1f2255`](runs/TC_PG_TAMPER_58.json) |
| TC_PG_TAMPER_59 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T235857-482ccf`](runs/TC_PG_TAMPER_59.json) |
| TC_PG_TAMPER_60 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T235858-05d974`](runs/TC_PG_TAMPER_60.json) |
| TC_PG_TAMPER_61 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T235858-cd4bf5`](runs/TC_PG_TAMPER_61.json) |
| TC_PG_TAMPER_62 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T235858-c0b8d4`](runs/TC_PG_TAMPER_62.json) |
| TC_PG_TAMPER_63 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T235859-7f9bb3`](runs/TC_PG_TAMPER_63.json) |
| TC_PG_TAMPER_64 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T235859-2befd4`](runs/TC_PG_TAMPER_64.json) |
| TC_PG_TAMPER_65 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T235859-6cc752`](runs/TC_PG_TAMPER_65.json) |
| TC_PG_TAMPER_66 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T235859-b2b046`](runs/TC_PG_TAMPER_66.json) |
| TC_PG_TAMPER_67 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T235900-68de0a`](runs/TC_PG_TAMPER_67.json) |
| TC_PG_TAMPER_68 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T235900-5e9e21`](runs/TC_PG_TAMPER_68.json) |
| TC_PG_TAMPER_69 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T235900-0db5bc`](runs/TC_PG_TAMPER_69.json) |
| TC_PG_TAMPER_70 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T235901-f784f7`](runs/TC_PG_TAMPER_70.json) |
| TC_PG_PROBE_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T235901-341a04`](runs/TC_PG_PROBE_01.json) |
| TC_PG_PROBE_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T235901-b6fc10`](runs/TC_PG_PROBE_02.json) |
| TC_PG_PROBE_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T235902-45716f`](runs/TC_PG_PROBE_03.json) |
| TC_PG_PROBE_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T235902-e7dd86`](runs/TC_PG_PROBE_04.json) |
| TC_PG_PROBE_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T235902-208b73`](runs/TC_PG_PROBE_05.json) |
| TC_PG_PROBE_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T235902-391fc8`](runs/TC_PG_PROBE_06.json) |
| TC_PG_PROBE_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T235903-50aba3`](runs/TC_PG_PROBE_07.json) |
| TC_PG_PROBE_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T235903-146506`](runs/TC_PG_PROBE_08.json) |
| TC_PG_PROBE_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T235903-e18fff`](runs/TC_PG_PROBE_09.json) |
| TC_PG_PROBE_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T235904-5e73af`](runs/TC_PG_PROBE_10.json) |
| TC_PG_PROBE_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T235904-e66881`](runs/TC_PG_PROBE_11.json) |
| TC_PG_PROBE_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T235904-602f35`](runs/TC_PG_PROBE_12.json) |
| TC_PG_PROBE_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T235905-dd0508`](runs/TC_PG_PROBE_13.json) |
| TC_PG_PROBE_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T235905-2a1a86`](runs/TC_PG_PROBE_14.json) |
| TC_PG_PROBE_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T235905-0da2d3`](runs/TC_PG_PROBE_15.json) |
| TC_PG_PROBE_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T235905-683530`](runs/TC_PG_PROBE_16.json) |
| TC_PG_PROBE_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T235906-a2fd72`](runs/TC_PG_PROBE_17.json) |
| TC_PG_PROBE_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T235906-da26d0`](runs/TC_PG_PROBE_18.json) |
| TC_PG_DCAPI_01 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235906-6a7f89`](runs/TC_PG_DCAPI_01.json) |
| TC_PG_DCAPI_02 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235907-beb282`](runs/TC_PG_DCAPI_02.json) |
| TC_PG_DCAPI_03 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235907-054c6a`](runs/TC_PG_DCAPI_03.json) |
| TC_PG_DCAPI_04 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235907-bab8a3`](runs/TC_PG_DCAPI_04.json) |
| TC_PG_DCAPI_05 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235908-3868d1`](runs/TC_PG_DCAPI_05.json) |
| TC_PG_NS_01 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T235908-8d889f`](runs/TC_PG_NS_01.json) |
| TC_PG_NS_02 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T235908-0640b8`](runs/TC_PG_NS_02.json) |
| TC_PG_NS_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-did-canonical | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T235908-693f85`](runs/TC_PG_NS_03.json) |
| TC_PG_MDOC_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T235908-b7b78f`](runs/TC_PG_MDOC_01.json) |
| TC_PG_MDOC_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T235908-b59dbf`](runs/TC_PG_MDOC_02.json) |
| TC_PG_MDOC_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235908-bbd396`](runs/TC_PG_MDOC_03.json) |
| TC_PG_MDOC_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T235909-8ac512`](runs/TC_PG_MDOC_04.json) |
| TC_PG_MDOC_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235909-17a6b6`](runs/TC_PG_MDOC_05.json) |
| TC_PG_MDOC_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T235909-8a1dbf`](runs/TC_PG_MDOC_06.json) |
| TC_PG_MDOC_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235910-9b5d75`](runs/TC_PG_MDOC_07.json) |
| TC_PG_MDOC_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T235910-dbdda7`](runs/TC_PG_MDOC_08.json) |
| TC_PG_MDOC_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235910-85e852`](runs/TC_PG_MDOC_09.json) |
| TC_PG_MDOC_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T235911-835853`](runs/TC_PG_MDOC_10.json) |
| TC_PG_MDOC_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235911-9fc1c5`](runs/TC_PG_MDOC_11.json) |
| TC_PG_MDOC_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235911-e53b01`](runs/TC_PG_MDOC_12.json) |
| TC_PG_MDOC_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235911-3e3593`](runs/TC_PG_MDOC_13.json) |
| TC_PG_MDOC_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T235912-152544`](runs/TC_PG_MDOC_14.json) |
| TC_PG_MDOC_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235912-6ab780`](runs/TC_PG_MDOC_15.json) |
| TC_PG_MDOC_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T235912-cd4b6f`](runs/TC_PG_MDOC_16.json) |
| TC_PG_MDOC_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235913-18f44e`](runs/TC_PG_MDOC_17.json) |
| TC_PG_MDOC_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T235913-d65810`](runs/TC_PG_MDOC_18.json) |
| TC_PG_MDOC_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T235913-219a14`](runs/TC_PG_MDOC_19.json) |
| TC_PG_MDOC_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T235913-d7f4a5`](runs/TC_PG_MDOC_20.json) |
| TC_PG_MDOC_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T235914-4dde64`](runs/TC_PG_MDOC_21.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Those files are not kept in git (about 5 MB per run of the reference matrix); the nightly workflow publishes them as a build artifact.

## Errors and reasons

- TC_PG_NS_01: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Bad issuer signature" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_02: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_03: `compatibility.scenario.issuer-unsupported` at playground.admin: The scenario "Probe: canonical did:jwk for a padded holder binding" needs the issuer inji-certify or inji-certify-ac; Reference issuer cannot produce it.
- TC_PG_MDOC_21: `compatibility.scenario.format-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" applies only to vc+sd-jwt, dc+sd-jwt.
