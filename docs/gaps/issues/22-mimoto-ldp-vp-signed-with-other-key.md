# Inji Web binds the credential to a P-256 key but signs the ldp_vp with an Ed25519 key (G22)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_03 (certify-ac) and TC_PG_WEB_05 (reference issuer) in `packages/cli/specs/live-holder-web.yaml`

**Date:** 2026-10-05

**Severity:** high; **status:** new; no upstream issue found

## Summary

Mimoto requests the credential with an ES256 proof (holder key P-256), then signs the presentation for OpenID4VP with an Ed25519Signature2020 proof under a different key. Inji Verify answers INVALID with holderProofCheck ERR_HOLDER_BINDING_CHECK_FAILED; any verifier that checks holder binding must reject it. Measured with Inji Certify (certify-ac) and with the reference issuer, so no Inji Web presentation of an ldp_vc verifies.

## Steps

1. Download an `ldp_vc` into a signed-in Inji Web wallet (Mimoto 0.22.0) from Inji Certify or the playground reference issuer.
2. Present it to Inji Verify 0.18.2 through `POST /wallets/{id}/presentations` and `PATCH` with the credential selected.
3. Read the Inji Verify result.

## Expected

`VALID`: the presentation is signed by the key the credential is bound to.

## Actual

Mimoto requests the credential with an ES256 proof (holder key P-256), then signs the `ldp_vp` with an Ed25519Signature2020 proof under a different key. Inji Verify answers `INVALID` with `holderProofCheck` `ERR_HOLDER_BINDING_CHECK_FAILED`. No Inji Web presentation of an `ldp_vc` verifies.

## Suggested change

Sign the presentation with the key used in the credential request (or bind the credential to the key used for presentations).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
