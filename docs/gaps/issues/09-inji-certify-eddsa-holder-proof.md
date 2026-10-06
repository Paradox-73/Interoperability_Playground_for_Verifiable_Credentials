# Inji Certify accepts an Ed25519 holder proof only under the name Ed25519, and the sample lists it only for FarmerSdJwt (G9)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (sample config)

**Case:** TC_PG_LIVE_01 and TC_PG_LIVE_02 (variant: the holder key proof signed with an Ed25519 `did:jwk` key and `alg` `EdDSA`)

**Date:** 2026-10-06 (first measured 2026-10-05)

**Severity:** medium; **status:** new upstream, sample configuration fixed in the playground stack; no upstream issue found

## Summary

`JwtProofValidator` compares the proof JWT's `alg` with the `proof_signing_alg_values_supported` of the requested
credential configuration by exact name. The sample `certify_init.sql` lists `RS256`, `ES256` for
`FarmerCredential` (`ldp_vc`) and `RS256`, `PS256`, `ES256`, `Ed25519` for `FarmerSdJwt`. A proof with `alg`
`EdDSA`, the name RFC 7518 registers and most wallets send, is therefore refused for both, and the answer names
the wrong cause. A proof with `alg` `Ed25519` (the fully specified name of RFC 9864) is accepted wherever the
configuration lists it.

## Steps

1. Run the pre-authorized code flow against Inji Certify 0.14.0 with the sample configuration.
2. Send the credential request with a `jwt` proof signed with an Ed25519 key, `kid` a `did:jwk` of that key, `alg` `EdDSA`, for `FarmerCredential` or `FarmerSdJwt`.
3. Send the same request with `alg` `Ed25519`.

## Expected

The `EdDSA` proof is accepted (it is the same signature algorithm), or the error says that the algorithm name is
not listed; the sample lists an Ed25519 option for every configuration.

## Actual

`alg` `EdDSA`: HTTP 400 `invalid_proof` "Error encountered during proof jwt parsing" (2026-10-05). `alg`
`Ed25519`: accepted for `FarmerSdJwt`, and for `FarmerCredential` once `Ed25519` is added to its list
(2026-10-06). With the sample list, an `ldp_vc` can only be bound to a P-256 or RSA key, which Inji Web
cannot present (G22) and for which Inji Verify refuses the `ecdsa-rdfc-2019` holder proof (G15).

## Suggested change

Treat `EdDSA` and `Ed25519` as the same algorithm for Ed25519 keys, name the algorithm in the error, and list
`Ed25519` for `FarmerCredential` in the sample.

## Work-around used by the playground

`deploy/inji-stack/sql/certify_init.sql` adds `Ed25519` to `FarmerCredential`; the reference wallet sends
`alg` `Ed25519` when an issuer lists that name and not `EdDSA`.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
