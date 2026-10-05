# Inji Certify SD-JWT output: vc+sd-jwt typ, holder key as cnf.kid, no iat/exp unless templated (G8)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0

**Case:** TC_PG_LIVE_01 (the credential response in the stored run)

**Date:** 2026-10-04

**Severity:** low; **status:** new; no upstream issue found

## Summary

The SD-JWT VC uses the older typ vc+sd-jwt (SD-JWT VC draft 19 and OpenID4VCI 1.0 use dc+sd-jwt), binds the holder by cnf.kid rather than cnf.jwk, and carries no iat or exp unless the template adds them.

## Steps

1. Issue `FarmerSdJwt` (`vc+sd-jwt`) from Inji Certify 0.14.0 with a holder key proof.
2. Decode the issuer-signed JWT of the SD-JWT VC.

## Expected

The header `typ` that current SD-JWT VC drafts and OpenID4VCI 1.0 (Appendix A.3) use, `dc+sd-jwt`; an `iat` claim; a key binding that a verifier can resolve without Certify-specific knowledge.

## Actual

`typ` is `vc+sd-jwt`, the holder key is referenced as `cnf.kid` (a DID URL) instead of carried as `cnf.jwk`, and there is no `iat` or `exp` unless the credential template adds them.

## Suggested change

Offer `dc+sd-jwt`, include `iat`, and carry the holder key as `cnf.jwk` (or document how `cnf.kid` is resolved).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
