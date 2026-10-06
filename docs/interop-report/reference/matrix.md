# Compatibility matrix: reference

Run on 2026-10-06, 12:46:28 to 12:46:54 UTC (26 s), from `reference.yaml` in reference mode, against playground server 0.1.0 started in-process with the reference roles.

Reference issuer, wallet and verifier against the scenario catalogue; no Inji module takes part.

**84 of 84 cells gave the verdict their spec expects**. Verdicts: 80 pass, 0 fail, 0 error, 4 not supported.

## Versions

| Role | Name | Ecosystem | Version |
| ---- | ---- | --------- | ------- |
| `mobile-wallet` | Phone wallet (Inji Wallet or any OpenID4VC app) | external | any |
| `ref-issuer` | Reference issuer | reference | 0.1.0 |
| `ref-verifier` | Reference verifier | reference | 0.1.0 |
| `ref-wallet` | Reference wallet (headless) | reference | 0.1.0 |

## Cells

| Case | Issuer → wallet → verifier | Format | Profiles | Scenario | Expected | Actual | Verdict | Matches spec | Run |
| ---- | -------------------------- | ------ | -------- | -------- | -------- | ------ | ------- | ------------ | --- |
| TC_PG_HAPPY_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124628-c41af4`](runs/TC_PG_HAPPY_01.json) |
| TC_PG_HAPPY_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261006T124629-6f7a08`](runs/TC_PG_HAPPY_02.json) |
| TC_PG_HAPPY_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124629-eec9e2`](runs/TC_PG_HAPPY_03.json) |
| TC_PG_HAPPY_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261006T124629-d67201`](runs/TC_PG_HAPPY_04.json) |
| TC_PG_HAPPY_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | happy | VALID | VALID | Pass | yes | [`20261006T124630-d4f958`](runs/TC_PG_HAPPY_05.json) |
| TC_PG_HAPPY_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | happy | VALID | VALID | Pass | yes | [`20261006T124630-6e4cc4`](runs/TC_PG_HAPPY_06.json) |
| TC_PG_TAMPER_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124630-53002c`](runs/TC_PG_TAMPER_01.json) |
| TC_PG_TAMPER_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124631-77b4e4`](runs/TC_PG_TAMPER_02.json) |
| TC_PG_TAMPER_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124631-6d118d`](runs/TC_PG_TAMPER_03.json) |
| TC_PG_TAMPER_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124631-44c984`](runs/TC_PG_TAMPER_04.json) |
| TC_PG_TAMPER_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124632-c725c9`](runs/TC_PG_TAMPER_05.json) |
| TC_PG_TAMPER_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | expired | EXPIRED | EXPIRED | Pass | yes | [`20261006T124632-80221a`](runs/TC_PG_TAMPER_06.json) |
| TC_PG_TAMPER_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261006T124632-27e226`](runs/TC_PG_TAMPER_07.json) |
| TC_PG_TAMPER_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261006T124633-81e9d2`](runs/TC_PG_TAMPER_08.json) |
| TC_PG_TAMPER_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261006T124633-1cfd92`](runs/TC_PG_TAMPER_09.json) |
| TC_PG_TAMPER_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261006T124633-f53847`](runs/TC_PG_TAMPER_10.json) |
| TC_PG_TAMPER_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261006T124634-16087a`](runs/TC_PG_TAMPER_11.json) |
| TC_PG_TAMPER_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | not-yet-valid | INVALID | INVALID | Pass | yes | [`20261006T124634-ffefaa`](runs/TC_PG_TAMPER_12.json) |
| TC_PG_TAMPER_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261006T124634-6c44f4`](runs/TC_PG_TAMPER_13.json) |
| TC_PG_TAMPER_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261006T124635-9e47fd`](runs/TC_PG_TAMPER_14.json) |
| TC_PG_TAMPER_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261006T124635-1fc5cc`](runs/TC_PG_TAMPER_15.json) |
| TC_PG_TAMPER_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261006T124635-1af6e1`](runs/TC_PG_TAMPER_16.json) |
| TC_PG_TAMPER_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | wrong-type | INVALID | INVALID | Pass | yes | [`20261006T124636-73e6e1`](runs/TC_PG_TAMPER_17.json) |
| TC_PG_TAMPER_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | wrong-type | INVALID | INVALID | Pass | yes | [`20261006T124636-3c05a9`](runs/TC_PG_TAMPER_18.json) |
| TC_PG_TAMPER_19 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124636-c640ed`](runs/TC_PG_TAMPER_19.json) |
| TC_PG_TAMPER_20 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124637-77a02b`](runs/TC_PG_TAMPER_20.json) |
| TC_PG_TAMPER_21 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124637-ff8f4e`](runs/TC_PG_TAMPER_21.json) |
| TC_PG_TAMPER_22 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124637-b2fafa`](runs/TC_PG_TAMPER_22.json) |
| TC_PG_TAMPER_23 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124637-a6d6cb`](runs/TC_PG_TAMPER_23.json) |
| TC_PG_TAMPER_24 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | bad-signature | INVALID | INVALID | Pass | yes | [`20261006T124638-984d06`](runs/TC_PG_TAMPER_24.json) |
| TC_PG_TAMPER_25 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124638-307628`](runs/TC_PG_TAMPER_25.json) |
| TC_PG_TAMPER_26 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124638-df3ebd`](runs/TC_PG_TAMPER_26.json) |
| TC_PG_TAMPER_27 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124639-58ae48`](runs/TC_PG_TAMPER_27.json) |
| TC_PG_TAMPER_28 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | altered-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124639-cfa283`](runs/TC_PG_TAMPER_28.json) |
| TC_PG_TAMPER_29 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124639-b0edcc`](runs/TC_PG_TAMPER_29.json) |
| TC_PG_TAMPER_30 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124640-150cce`](runs/TC_PG_TAMPER_30.json) |
| TC_PG_TAMPER_31 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124640-6eb29f`](runs/TC_PG_TAMPER_31.json) |
| TC_PG_TAMPER_32 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | unreferenced-disclosure | INVALID | INVALID | Pass | yes | [`20261006T124640-e77a4c`](runs/TC_PG_TAMPER_32.json) |
| TC_PG_TAMPER_33 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261006T124641-bb6175`](runs/TC_PG_TAMPER_33.json) |
| TC_PG_TAMPER_34 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261006T124641-cd59b2`](runs/TC_PG_TAMPER_34.json) |
| TC_PG_TAMPER_35 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261006T124641-b5a10c`](runs/TC_PG_TAMPER_35.json) |
| TC_PG_TAMPER_36 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-nonce | INVALID | INVALID | Pass | yes | [`20261006T124641-4a605d`](runs/TC_PG_TAMPER_36.json) |
| TC_PG_TAMPER_37 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261006T124642-216c16`](runs/TC_PG_TAMPER_37.json) |
| TC_PG_TAMPER_38 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261006T124642-892080`](runs/TC_PG_TAMPER_38.json) |
| TC_PG_TAMPER_39 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261006T124642-0553fb`](runs/TC_PG_TAMPER_39.json) |
| TC_PG_TAMPER_40 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes | [`20261006T124643-ae59ca`](runs/TC_PG_TAMPER_40.json) |
| TC_PG_TAMPER_41 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261006T124643-55f085`](runs/TC_PG_TAMPER_41.json) |
| TC_PG_TAMPER_42 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261006T124643-f6cfb5`](runs/TC_PG_TAMPER_42.json) |
| TC_PG_TAMPER_43 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261006T124644-e3f394`](runs/TC_PG_TAMPER_43.json) |
| TC_PG_TAMPER_44 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261006T124644-06869d`](runs/TC_PG_TAMPER_44.json) |
| TC_PG_TAMPER_45 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | vp-replay | INVALID | INVALID | Pass | yes | [`20261006T124644-aa6aa4`](runs/TC_PG_TAMPER_45.json) |
| TC_PG_TAMPER_46 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | vp-replay | INVALID | INVALID | Pass | yes | [`20261006T124645-87f665`](runs/TC_PG_TAMPER_46.json) |
| TC_PG_TAMPER_47 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124645-7fccaa`](runs/TC_PG_TAMPER_47.json) |
| TC_PG_TAMPER_48 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124645-3bac6a`](runs/TC_PG_TAMPER_48.json) |
| TC_PG_TAMPER_49 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124645-d6c1c1`](runs/TC_PG_TAMPER_49.json) |
| TC_PG_TAMPER_50 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124646-b1e676`](runs/TC_PG_TAMPER_50.json) |
| TC_PG_TAMPER_51 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124646-3e576b`](runs/TC_PG_TAMPER_51.json) |
| TC_PG_TAMPER_52 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | holder-mismatch | INVALID | INVALID | Pass | yes | [`20261006T124647-9129c4`](runs/TC_PG_TAMPER_52.json) |
| TC_PG_TAMPER_53 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261006T124647-c4fee5`](runs/TC_PG_TAMPER_53.json) |
| TC_PG_TAMPER_54 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261006T124647-51ab54`](runs/TC_PG_TAMPER_54.json) |
| TC_PG_TAMPER_55 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | forged-x5c | INVALID | INVALID | Pass | yes | [`20261006T124647-b99f9e`](runs/TC_PG_TAMPER_55.json) |
| TC_PG_TAMPER_56 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | forged-x5c | INVALID | INVALID | Pass | yes | [`20261006T124648-ba6f6b`](runs/TC_PG_TAMPER_56.json) |
| TC_PG_PROBE_01 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261006T124648-7fc6de`](runs/TC_PG_PROBE_01.json) |
| TC_PG_PROBE_02 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261006T124648-375933`](runs/TC_PG_PROBE_02.json) |
| TC_PG_PROBE_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261006T124649-1c5e50`](runs/TC_PG_PROBE_03.json) |
| TC_PG_PROBE_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261006T124649-a1b286`](runs/TC_PG_PROBE_04.json) |
| TC_PG_PROBE_05 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-key | VALID | VALID | Pass | yes | [`20261006T124649-2d3ce2`](runs/TC_PG_PROBE_05.json) |
| TC_PG_PROBE_06 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-key | VALID | VALID | Pass | yes | [`20261006T124650-900bbf`](runs/TC_PG_PROBE_06.json) |
| TC_PG_PROBE_07 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261006T124650-937db0`](runs/TC_PG_PROBE_07.json) |
| TC_PG_PROBE_08 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261006T124650-5d849b`](runs/TC_PG_PROBE_08.json) |
| TC_PG_PROBE_09 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261006T124651-79553b`](runs/TC_PG_PROBE_09.json) |
| TC_PG_PROBE_10 | `ref-issuer` → `ref-wallet` → `ref-verifier` | vc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261006T124651-9cdecc`](runs/TC_PG_PROBE_10.json) |
| TC_PG_PROBE_11 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261006T124651-d336c1`](runs/TC_PG_PROBE_11.json) |
| TC_PG_PROBE_12 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | issuer-did-jwk | VALID | VALID | Pass | yes | [`20261006T124652-f84504`](runs/TC_PG_PROBE_12.json) |
| TC_PG_PROBE_13 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261006T124652-5f2a33`](runs/TC_PG_PROBE_13.json) |
| TC_PG_PROBE_14 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | vc2-eddsa-rdfc-2022 | VALID | VALID | Pass | yes | [`20261006T124652-f1b213`](runs/TC_PG_PROBE_14.json) |
| TC_PG_PROBE_15 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | draft13 / inji-draft | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261006T124653-ed2abb`](runs/TC_PG_PROBE_15.json) |
| TC_PG_PROBE_16 | `ref-issuer` → `ref-wallet` → `ref-verifier` | dc+sd-jwt | v1 / final-1.0 | dc-sd-jwt | VALID | VALID | Pass | yes | [`20261006T124653-f71094`](runs/TC_PG_PROBE_16.json) |
| TC_PG_PROBE_17 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261006T124653-a22902`](runs/TC_PG_PROBE_17.json) |
| TC_PG_PROBE_18 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | v1 / final-1.0 | holder-proof-es256 | VALID | VALID | Pass | yes | [`20261006T124653-82a855`](runs/TC_PG_PROBE_18.json) |
| TC_PG_NS_01 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | bad-signature | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261006T124654-d9cfcc`](runs/TC_PG_NS_01.json) |
| TC_PG_NS_02 | `ref-issuer` → `mobile-wallet` → `ref-verifier` | vc+sd-jwt | draft13 / inji-draft | kb-wrong-nonce | INVALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261006T124654-16d565`](runs/TC_PG_NS_02.json) |
| TC_PG_NS_03 | `ref-issuer` → `ref-wallet` → `ref-verifier` | ldp_vc | draft13 / inji-draft | holder-did-canonical | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261006T124654-7ee194`](runs/TC_PG_NS_03.json) |
| TC_PG_NS_04 | `ref-issuer` → `ref-wallet` → `ref-verifier` | mso_mdoc | draft13 / inji-draft | happy | VALID | NOT_RUN | Not supported (spec: Not supported) | yes | [`20261006T124654-6f6194`](runs/TC_PG_NS_04.json) |

The redacted record of each run (configuration, events, every HTTP exchange) is written to `runs/<case id>.json` next to this file. Those files are not kept in git (about 5 MB per run of the reference matrix); the nightly workflow publishes them as a build artifact.

## Errors and reasons

- TC_PG_NS_01: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Bad issuer signature" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_02: `compatibility.scenario.wallet-unsupported` at playground.admin: The scenario "Key binding with the wrong nonce" needs the wallet ref-wallet; Phone wallet (Inji Wallet or any OpenID4VC app) cannot produce it.
- TC_PG_NS_03: `compatibility.scenario.issuer-unsupported` at playground.admin: The scenario "Probe: canonical did:jwk for a padded holder binding" needs the issuer inji-certify or inji-certify-ac; Reference issuer cannot produce it.
- TC_PG_NS_04: `compatibility.issuer.format-unsupported` at playground.admin: Reference issuer does not support the format mso_mdoc (it supports ldp_vc, vc+sd-jwt, dc+sd-jwt). Reference wallet (headless) does not support the format mso_mdoc (it supports ldp_vc, vc+sd-jwt, dc+sd-jwt). Reference verifier does not support the format mso_mdoc (it supports ldp_vc, vc+sd-jwt, dc+sd-jwt).
