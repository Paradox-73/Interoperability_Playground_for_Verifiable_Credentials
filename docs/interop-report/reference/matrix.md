# Compatibility matrix: reference

Run on 2026-10-13, 22:08:13 to 22:08:49 UTC (36 s), from `reference.yaml` in reference mode, against playground server 0.1.0 started in-process with the reference roles.

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
| TC_PG_HAPPY_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T220813-268afc`](runs/TC_PG_HAPPY_01.json) |
| TC_PG_HAPPY_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220813-2a93e5`](runs/TC_PG_HAPPY_02.json) |
| TC_PG_HAPPY_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T220814-f42f12`](runs/TC_PG_HAPPY_03.json) |
| TC_PG_HAPPY_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220814-176b38`](runs/TC_PG_HAPPY_04.json) |
| TC_PG_HAPPY_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T220814-7b770a`](runs/TC_PG_HAPPY_05.json) |
| TC_PG_HAPPY_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220815-a059d3`](runs/TC_PG_HAPPY_06.json) |
| TC_PG_TAMPER_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220815-3bc42b`](runs/TC_PG_TAMPER_01.json) |
| TC_PG_TAMPER_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220815-9fc062`](runs/TC_PG_TAMPER_02.json) |
| TC_PG_TAMPER_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220816-8f3977`](runs/TC_PG_TAMPER_03.json) |
| TC_PG_TAMPER_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220816-ff1877`](runs/TC_PG_TAMPER_04.json) |
| TC_PG_TAMPER_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220816-c8da13`](runs/TC_PG_TAMPER_05.json) |
| TC_PG_TAMPER_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220817-34922c`](runs/TC_PG_TAMPER_06.json) |
| TC_PG_TAMPER_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220817-99a3de`](runs/TC_PG_TAMPER_07.json) |
| TC_PG_TAMPER_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220817-f8c27b`](runs/TC_PG_TAMPER_08.json) |
| TC_PG_TAMPER_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220817-acd446`](runs/TC_PG_TAMPER_09.json) |
| TC_PG_TAMPER_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220818-0a0b34`](runs/TC_PG_TAMPER_10.json) |
| TC_PG_TAMPER_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220818-ea6d33`](runs/TC_PG_TAMPER_11.json) |
| TC_PG_TAMPER_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220818-35eaf3`](runs/TC_PG_TAMPER_12.json) |
| TC_PG_TAMPER_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220819-c3dc9d`](runs/TC_PG_TAMPER_13.json) |
| TC_PG_TAMPER_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220819-cc811d`](runs/TC_PG_TAMPER_14.json) |
| TC_PG_TAMPER_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220819-1f69fb`](runs/TC_PG_TAMPER_15.json) |
| TC_PG_TAMPER_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220820-c0b14d`](runs/TC_PG_TAMPER_16.json) |
| TC_PG_TAMPER_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220820-a64e0b`](runs/TC_PG_TAMPER_17.json) |
| TC_PG_TAMPER_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220820-90a112`](runs/TC_PG_TAMPER_18.json) |
| TC_PG_TAMPER_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220820-e7f1e1`](runs/TC_PG_TAMPER_19.json) |
| TC_PG_TAMPER_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220821-626a0d`](runs/TC_PG_TAMPER_20.json) |
| TC_PG_TAMPER_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220821-f29ce1`](runs/TC_PG_TAMPER_21.json) |
| TC_PG_TAMPER_22 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220821-984913`](runs/TC_PG_TAMPER_22.json) |
| TC_PG_TAMPER_23 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220822-08a476`](runs/TC_PG_TAMPER_23.json) |
| TC_PG_TAMPER_24 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220822-c4965f`](runs/TC_PG_TAMPER_24.json) |
| TC_PG_TAMPER_25 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220822-16c136`](runs/TC_PG_TAMPER_25.json) |
| TC_PG_TAMPER_26 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220823-bc47c6`](runs/TC_PG_TAMPER_26.json) |
| TC_PG_TAMPER_27 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220823-99d306`](runs/TC_PG_TAMPER_27.json) |
| TC_PG_TAMPER_28 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220823-3e75c4`](runs/TC_PG_TAMPER_28.json) |
| TC_PG_TAMPER_29 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220823-076fdf`](runs/TC_PG_TAMPER_29.json) |
| TC_PG_TAMPER_30 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220824-6399d0`](runs/TC_PG_TAMPER_30.json) |
| TC_PG_TAMPER_31 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220824-c669ac`](runs/TC_PG_TAMPER_31.json) |
| TC_PG_TAMPER_32 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220824-ee43f0`](runs/TC_PG_TAMPER_32.json) |
| TC_PG_TAMPER_33 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T220825-e88501`](runs/TC_PG_TAMPER_33.json) |
| TC_PG_TAMPER_34 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T220825-e998e6`](runs/TC_PG_TAMPER_34.json) |
| TC_PG_TAMPER_35 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T220825-197ac9`](runs/TC_PG_TAMPER_35.json) |
| TC_PG_TAMPER_36 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261013T220826-38574e`](runs/TC_PG_TAMPER_36.json) |
| TC_PG_TAMPER_37 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T220826-235488`](runs/TC_PG_TAMPER_37.json) |
| TC_PG_TAMPER_38 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T220826-a91d7e`](runs/TC_PG_TAMPER_38.json) |
| TC_PG_TAMPER_39 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T220826-0dd7b1`](runs/TC_PG_TAMPER_39.json) |
| TC_PG_TAMPER_40 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261013T220827-012dae`](runs/TC_PG_TAMPER_40.json) |
| TC_PG_TAMPER_41 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220827-5cd1c4`](runs/TC_PG_TAMPER_41.json) |
| TC_PG_TAMPER_42 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220827-262ac7`](runs/TC_PG_TAMPER_42.json) |
| TC_PG_TAMPER_43 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220828-eedcf0`](runs/TC_PG_TAMPER_43.json) |
| TC_PG_TAMPER_44 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220828-44c935`](runs/TC_PG_TAMPER_44.json) |
| TC_PG_TAMPER_45 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220828-a4c8af`](runs/TC_PG_TAMPER_45.json) |
| TC_PG_TAMPER_46 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220828-c66391`](runs/TC_PG_TAMPER_46.json) |
| TC_PG_TAMPER_47 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220829-eedef3`](runs/TC_PG_TAMPER_47.json) |
| TC_PG_TAMPER_48 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220829-327994`](runs/TC_PG_TAMPER_48.json) |
| TC_PG_TAMPER_49 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220829-69b04d`](runs/TC_PG_TAMPER_49.json) |
| TC_PG_TAMPER_50 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220830-02a1c5`](runs/TC_PG_TAMPER_50.json) |
| TC_PG_TAMPER_51 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220830-fdc338`](runs/TC_PG_TAMPER_51.json) |
| TC_PG_TAMPER_52 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220830-0d8b46`](runs/TC_PG_TAMPER_52.json) |
| TC_PG_TAMPER_53 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T220830-314a1e`](runs/TC_PG_TAMPER_53.json) |
| TC_PG_TAMPER_54 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T220831-25c39d`](runs/TC_PG_TAMPER_54.json) |
| TC_PG_TAMPER_55 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T220831-c7201b`](runs/TC_PG_TAMPER_55.json) |
| TC_PG_TAMPER_56 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T220831-c44bcd`](runs/TC_PG_TAMPER_56.json) |
| TC_PG_TAMPER_57 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T220832-6e0039`](runs/TC_PG_TAMPER_57.json) |
| TC_PG_TAMPER_58 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T220832-ca79ba`](runs/TC_PG_TAMPER_58.json) |
| TC_PG_TAMPER_59 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | self-issued | INVALID | INVALID | Pass | yes | [`20261013T220832-e8506d`](runs/TC_PG_TAMPER_59.json) |
| TC_PG_TAMPER_60 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | self-issued | INVALID | INVALID | Pass | yes | [`20261013T220833-3d6a06`](runs/TC_PG_TAMPER_60.json) |
| TC_PG_TAMPER_61 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T220833-1d027c`](runs/TC_PG_TAMPER_61.json) |
| TC_PG_TAMPER_62 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T220833-bf6d63`](runs/TC_PG_TAMPER_62.json) |
| TC_PG_TAMPER_63 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T220833-31877b`](runs/TC_PG_TAMPER_63.json) |
| TC_PG_TAMPER_64 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-name-borrowed | INVALID | INVALID | Pass | yes | [`20261013T220834-e267bf`](runs/TC_PG_TAMPER_64.json) |
| TC_PG_TAMPER_65 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T220834-313cce`](runs/TC_PG_TAMPER_65.json) |
| TC_PG_TAMPER_66 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T220834-15c863`](runs/TC_PG_TAMPER_66.json) |
| TC_PG_TAMPER_67 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T220835-732f24`](runs/TC_PG_TAMPER_67.json) |
| TC_PG_TAMPER_68 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T220835-e27525`](runs/TC_PG_TAMPER_68.json) |
| TC_PG_TAMPER_69 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | revoked | INVALID | INVALID | Pass | yes | [`20261013T220835-cdf0db`](runs/TC_PG_TAMPER_69.json) |
| TC_PG_TAMPER_70 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | revoked | INVALID | INVALID | Pass | yes | [`20261013T220836-a5fef7`](runs/TC_PG_TAMPER_70.json) |
| TC_PG_PROBE_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T220836-a915d5`](runs/TC_PG_PROBE_01.json) |
| TC_PG_PROBE_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T220836-fae673`](runs/TC_PG_PROBE_02.json) |
| TC_PG_PROBE_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T220836-92a9fb`](runs/TC_PG_PROBE_03.json) |
| TC_PG_PROBE_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T220837-b558cc`](runs/TC_PG_PROBE_04.json) |
| TC_PG_PROBE_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T220837-5959f9`](runs/TC_PG_PROBE_05.json) |
| TC_PG_PROBE_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261013T220837-32eb55`](runs/TC_PG_PROBE_06.json) |
| TC_PG_PROBE_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T220838-78b15d`](runs/TC_PG_PROBE_07.json) |
| TC_PG_PROBE_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T220838-536dfe`](runs/TC_PG_PROBE_08.json) |
| TC_PG_PROBE_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T220838-9dda1a`](runs/TC_PG_PROBE_09.json) |
| TC_PG_PROBE_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T220838-8f08db`](runs/TC_PG_PROBE_10.json) |
| TC_PG_PROBE_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T220839-d53965`](runs/TC_PG_PROBE_11.json) |
| TC_PG_PROBE_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261013T220839-f5208e`](runs/TC_PG_PROBE_12.json) |
| TC_PG_PROBE_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T220839-7dc45c`](runs/TC_PG_PROBE_13.json) |
| TC_PG_PROBE_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261013T220840-0b28aa`](runs/TC_PG_PROBE_14.json) |
| TC_PG_PROBE_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T220840-0b811a`](runs/TC_PG_PROBE_15.json) |
| TC_PG_PROBE_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261013T220840-525ea9`](runs/TC_PG_PROBE_16.json) |
| TC_PG_PROBE_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T220841-a0cd15`](runs/TC_PG_PROBE_17.json) |
| TC_PG_PROBE_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261013T220841-2c073d`](runs/TC_PG_PROBE_18.json) |
| TC_PG_DCAPI_01 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220841-ffb2ad`](runs/TC_PG_DCAPI_01.json) |
| TC_PG_DCAPI_02 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220842-134ab5`](runs/TC_PG_DCAPI_02.json) |
| TC_PG_DCAPI_03 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220842-01b40a`](runs/TC_PG_DCAPI_03.json) |
| TC_PG_DCAPI_04 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220842-359277`](runs/TC_PG_DCAPI_04.json) |
| TC_PG_DCAPI_05 | `ref-issuer` → `ref-wallet` → `ref-verifier-dc-api` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220842-aee5a0`](runs/TC_PG_DCAPI_05.json) |
| TC_PG_NS_01 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T220843-2561ad`](runs/TC_PG_NS_01.json) |
| TC_PG_NS_02 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T220843-fcc2ea`](runs/TC_PG_NS_02.json) |
| TC_PG_NS_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-did-canonical | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T220843-0819f4`](runs/TC_PG_NS_03.json) |
| TC_PG_MDOC_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261013T220843-586307`](runs/TC_PG_MDOC_01.json) |
| TC_PG_MDOC_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261013T220843-a53dfa`](runs/TC_PG_MDOC_02.json) |
| TC_PG_MDOC_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220843-de2341`](runs/TC_PG_MDOC_03.json) |
| TC_PG_MDOC_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261013T220844-e9b237`](runs/TC_PG_MDOC_04.json) |
| TC_PG_MDOC_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220844-c1a54e`](runs/TC_PG_MDOC_05.json) |
| TC_PG_MDOC_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261013T220844-61ca7d`](runs/TC_PG_MDOC_06.json) |
| TC_PG_MDOC_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220845-0e0a5c`](runs/TC_PG_MDOC_07.json) |
| TC_PG_MDOC_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261013T220845-b3118b`](runs/TC_PG_MDOC_08.json) |
| TC_PG_MDOC_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220845-f34969`](runs/TC_PG_MDOC_09.json) |
| TC_PG_MDOC_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261013T220845-d28910`](runs/TC_PG_MDOC_10.json) |
| TC_PG_MDOC_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220846-30b342`](runs/TC_PG_MDOC_11.json) |
| TC_PG_MDOC_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220846-cb8df2`](runs/TC_PG_MDOC_12.json) |
| TC_PG_MDOC_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220846-42ba1b`](runs/TC_PG_MDOC_13.json) |
| TC_PG_MDOC_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261013T220847-ae3497`](runs/TC_PG_MDOC_14.json) |
| TC_PG_MDOC_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220847-2b773c`](runs/TC_PG_MDOC_15.json) |
| TC_PG_MDOC_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261013T220847-d23ab2`](runs/TC_PG_MDOC_16.json) |
| TC_PG_MDOC_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220848-57d4e0`](runs/TC_PG_MDOC_17.json) |
| TC_PG_MDOC_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261013T220848-a5f97e`](runs/TC_PG_MDOC_18.json) |
| TC_PG_MDOC_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T220848-7caadc`](runs/TC_PG_MDOC_19.json) |
| TC_PG_MDOC_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261013T220848-274b68`](runs/TC_PG_MDOC_20.json) |
| TC_PG_MDOC_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261013T220849-1edcd1`](runs/TC_PG_MDOC_21.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Those files are not kept in git (about 5 MB per run of the reference matrix); the nightly workflow publishes them as a build artifact.

## Errors and reasons

- TC_PG_NS_01: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Bad issuer signature" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_02: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_03: `compatibility.scenario.issuer-unsupported` at playground.admin: The scenario "Probe: canonical did:jwk for a padded holder binding" needs the issuer inji-certify or inji-certify-ac; Reference issuer cannot produce it.
- TC_PG_MDOC_21: `compatibility.scenario.format-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" applies only to vc+sd-jwt, dc+sd-jwt.
