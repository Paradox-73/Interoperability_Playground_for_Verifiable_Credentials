# Inji Certify refuses an EdDSA holder proof (G9)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (sample config)

**Case:** TC_PG_LIVE_01 (variant: the holder key proof signed with an Ed25519 `did:jwk` key)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

A credential request whose jwt proof is signed with EdDSA (did:jwk Ed25519 key) is answered 400 invalid_proof "Error encountered during proof jwt parsing" for both FarmerCredential and FarmerSdJwt; ES256 works. Wallets with Ed25519 keys cannot receive credentials, and the ldp_vc is bound to a P-256 key, which limits the ldp_vp proof suites a holder can use (see G15).

## Steps

1. Run the pre-authorized code flow against Inji Certify 0.14.0 with the sample configuration.
2. Send the credential request with a `jwt` proof signed with EdDSA, `kid` a `did:jwk` of an Ed25519 key, for `FarmerCredential` or `FarmerSdJwt`.

## Expected

The proof is accepted, or the metadata does not advertise Ed25519 for proofs.

## Actual

HTTP 400 `invalid_proof` "Error encountered during proof jwt parsing". ES256 works. The sample lists `Ed25519` where the rest of the configuration uses `EdDSA`. Wallets with Ed25519 keys cannot receive credentials, and the `ldp_vc` is then bound to a P-256 key, which limits the `ldp_vp` proof suites a holder can use (see G15).

## Suggested change

Accept EdDSA proofs and use one algorithm name in the configuration.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
