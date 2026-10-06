# Inji Web signs every ldp_vp with its Ed25519 key, whatever key the credential is bound to (G22)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_07 (reference issuer that lists only ES256 for key proofs -> Inji Web -> Inji Verify, scenario `holder-proof-es256`) in `packages/cli/specs/live-holder-web.yaml`

**Date:** 2026-10-06 (first measured 2026-10-05)

**Severity:** high; **status:** new upstream, worked around in the playground stack; no upstream issue found

## Summary

Mimoto chooses the key of the credential request from the issuer's `proof_signing_alg_values_supported`
(`signing.algorithms.priority.order` ED25519, ES256K, ES256, RS256 in `CredentialRequestServiceImpl`), but
`WalletPresentationServiceImpl.submitPresentation` always signs the presentation with the wallet's ED25519 key
(`DEFAULT_SIGNING_ALGORITHM_NAME = "ED25519"`). When the issuer does not list `Ed25519`, as the Inji Certify
sample for `FarmerCredential` (RS256, ES256), the credential is bound to a P-256 key and the `ldp_vp` is signed by
another key, so every verifier that checks holder binding must reject it.

## Steps

1. Configure an issuer whose credential configuration lists only `ES256` (or `RS256`) in
   `proof_types_supported.jwt.proof_signing_alg_values_supported`.
2. Download an `ldp_vc` into a signed-in Inji Web wallet (Mimoto 0.22.0): the proof JWT has `alg` `ES256`
   and a P-256 `jwk`; the credential subject is the did:jwk of that key.
3. Present it to Inji Verify 0.18.2 through `POST /wallets/{id}/presentations` and `PATCH` with the credential selected.
4. Read `POST /v1/verify/v2/vp-results/{transactionId}`.

## Expected

`VALID`: the presentation is signed by the key the credential is bound to.

## Actual

`holderProofCheck` fails with `ERR_HOLDER_BINDING_CHECK_FAILED`, "Holder mismatch in VP: VP holder:
did:jwk:{"kty":"OKP","crv":"Ed25519",...}#0, VC subject: did:jwk:{"crv":"P-256","kty":"EC",...}". The
credential's own signature and expiry pass.

When the issuer lists `Ed25519` (the fully specified name of RFC 9864), Mimoto requests the credential with
its Ed25519 key and the same presentation is `VALID`: measured with the reference issuer (TC_PG_WEB_05) and with
Inji Certify once `Ed25519` was added to `FarmerCredential` (TC_PG_WEB_03), 2026-10-06.

## Suggested change

Sign the presentation with the key the selected credential is bound to (the key used in its credential
request), or always request credentials with the key used for presentations.

## Work-around used by the playground

The reference issuer lists `Ed25519` next to `ES256` and `EdDSA`; the stack's `sql/certify_init.sql` adds
`Ed25519` to `FarmerCredential` (the sample already lists it for `FarmerSdJwt`). Mimoto then binds the
credential to its Ed25519 key, and Inji Certify -> Inji Web -> Inji Verify verifies.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
