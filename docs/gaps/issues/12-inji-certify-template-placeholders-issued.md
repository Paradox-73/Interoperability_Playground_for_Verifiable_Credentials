# Inji Certify ldp_vc keeps unfilled template placeholders such as ${primaryCropType} (G12)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (FarmerCredential sample template)

**Case:** TC_PG_LIVE_02 (the `ldp_vc` in the stored run)

**Date:** 2026-10-05

**Severity:** low; **status:** new; no upstream issue found

## Summary

Claims that the pre-authorized data did not provide are issued as the literal template text ("primaryCropType": "${primaryCropType}") instead of being left out, so the signed credential asserts placeholder values.

## Steps

1. Create a pre-authorized offer for `FarmerCredential` with only the claims the configuration marks as advertised.
2. Redeem it and read `credentialSubject`.

## Expected

Claims without a value are left out of the credential.

## Actual

They are issued as the literal template text, for example `"primaryCropType": "${primaryCropType}"`, so the signed credential asserts placeholder values.

## Suggested change

Drop claims whose template variable has no value, or fail issuance.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
