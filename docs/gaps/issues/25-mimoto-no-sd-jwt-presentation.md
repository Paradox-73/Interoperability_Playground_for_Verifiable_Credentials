# Inji Web cannot present SD-JWT VCs (G25)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_04 (certify-ac -> Inji Web -> Inji Verify, `vc+sd-jwt`)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

Mimoto downloads and stores vc+sd-jwt credentials, but its credential matching for OpenID4VP (CredentialMatchingServiceImpl) throws UNSUPPORTED_FORMAT for vc+sd-jwt and dc+sd-jwt, so GET /wallets/{id}/presentations/{pid}/credentials answers availableCredentials [] with missingClaims ["vct"] and nothing can be submitted. Inji Verify accepts the same Certify SD-JWT VC from the reference wallet.

## Steps

1. Download a `vc+sd-jwt` credential into a signed-in Inji Web wallet (Mimoto 0.22.0); Mimoto stores it.
2. Pass a request for an SD-JWT VC to `POST /wallets/{id}/presentations`, then read `GET /wallets/{id}/presentations/{pid}/credentials`.

## Expected

The stored SD-JWT VC is offered and can be presented with a key binding JWT.

## Actual

`availableCredentials` is empty with `missingClaims: ["vct"]`. `CredentialMatchingServiceImpl.getCredentialData` throws `UNSUPPORTED_FORMAT` ("SD-JWT credential format (...) is not supported for credential matching") for `vc+sd-jwt` and `dc+sd-jwt`. Inji Verify accepts the same Certify SD-JWT VC from the playground wallet (TC_PG_WEB_01).

## Suggested change

SD-JWT VC matching and presentation in Mimoto.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
