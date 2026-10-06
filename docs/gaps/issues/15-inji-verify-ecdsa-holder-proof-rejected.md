# Inji Verify rejects an ldp_vp with an ecdsa-rdfc-2019 holder proof (G15)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2

**Case:** TC_PG_WEB_08 (reference issuer that lists only ES256 for key proofs -> reference wallet -> Inji Verify, `ldp_vc`, scenario `holder-proof-es256`); until 2026-10-05 also TC_PG_LIVE_02

**Date:** 2026-10-06 (first measured 2026-10-05)

**Severity:** medium; **status:** new; no upstream issue found

## Summary

A presentation signed with DataIntegrityProof ecdsa-rdfc-2019 by the P-256 key the credential is bound to gets holderProofCheck ERR_SIGNATURE_VERIFICATION_FAILED, while the credential's own signature and expiry pass. Inji Verify advertises Ed25519Signature2018/2020 and RsaSignature2018 for ldp_vp. A wallet whose issuer takes no Ed25519 key proof (the Inji Certify sample for FarmerCredential, G9) cannot present an ldp_vc to Inji Verify.

## Steps

1. Obtain an `ldp_vc` bound to a P-256 holder key (from Inji Certify with the sample configuration, G9, or from the reference issuer's `FarmerCredential_ldp_vc_es256_proof`).
2. Present it to Inji Verify 0.18.2 in an `ldp_vp` signed with `DataIntegrityProof` / `ecdsa-rdfc-2019` by that key.
3. Read `POST /v1/verify/v2/vp-results/{transactionId}`.

## Expected

`holderProofCheck` valid: `ecdsa-rdfc-2019` is a W3C Data Integrity suite and the key is the one the credential is bound to.

## Actual

`holderProofCheck` fails with `ERR_SIGNATURE_VERIFICATION_FAILED`, while the credential's signature and expiry pass. Inji Verify advertises only Ed25519Signature2018/2020 and RsaSignature2018 for `ldp_vp`. With the Inji Certify sample configuration (G9), only RSA holder keys work across Certify and Inji Verify; with `Ed25519` added to `FarmerCredential` (the playground stack), an Ed25519 holder key works (TC_PG_LIVE_02 `VALID`, 2026-10-06).

## Suggested change

Support `ecdsa-rdfc-2019` (and `eddsa-rdfc-2022`) holder proofs, or accept EdDSA proofs at Certify (G9).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
