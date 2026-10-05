# Inji Verify rejects an ldp_vp with an ecdsa-rdfc-2019 holder proof (G15)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2

**Case:** TC_PG_LIVE_02 (Certify -> reference wallet -> Inji Verify, `ldp_vc`)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

A presentation signed with DataIntegrityProof ecdsa-rdfc-2019 by the P-256 key the credential is bound to gets holderProofCheck ERR_SIGNATURE_VERIFICATION_FAILED, while the credential's own signature and expiry pass. Inji Verify advertises Ed25519Signature2018/2020 and RsaSignature2018 for ldp_vp. With G9 (Certify accepts only ES256 and RS256 holder proofs), a wallet with a P-256 key cannot present a Certify ldp_vc to Inji Verify; only RSA keys work across both.

## Steps

1. Obtain a Certify `ldp_vc` bound to a P-256 holder key (the key type Certify accepts, G9).
2. Present it to Inji Verify 0.18.2 in an `ldp_vp` signed with `DataIntegrityProof` / `ecdsa-rdfc-2019` by that key.
3. Read `POST /v1/verify/v2/vp-results/{transactionId}`.

## Expected

`holderProofCheck` valid: `ecdsa-rdfc-2019` is a W3C Data Integrity suite and the key is the one the credential is bound to.

## Actual

`holderProofCheck` fails with `ERR_SIGNATURE_VERIFICATION_FAILED`, while the credential's signature and expiry pass. Inji Verify advertises only Ed25519Signature2018/2020 and RsaSignature2018 for `ldp_vp`. With G9, only RSA holder keys work across Certify and Inji Verify.

## Suggested change

Support `ecdsa-rdfc-2019` (and `eddsa-rdfc-2022`) holder proofs, or accept EdDSA proofs at Certify (G9).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
