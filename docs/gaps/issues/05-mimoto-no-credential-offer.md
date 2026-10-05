# Mimoto and Inji Web cannot take a credential offer (no pre-authorized code flow) (G5)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** `GET /api/compatibility?issuer=inji-certify&wallet=inji-web&verifier=inji-verify&format=ldp_vc` (answers not supported)

**Date:** 2026-10-04

**Severity:** medium; **status:** known upstream behaviour

## Summary

Inji Web through Mimoto starts issuance only from its issuer list with the authorization code flow; an OpenID4VCI credential offer (pre-authorized code) has no entry point. From code reading.

## Steps

1. Create a pre-authorized credential offer at Inji Certify (`POST /v1/certify/pre-authorized-data`).
2. Try to hand the `openid-credential-offer://` link to Inji Web 0.17.0 / Mimoto 0.22.0.

## Expected

The wallet accepts a credential offer, as OpenID4VCI 1.0 section 4.1 describes, including the pre-authorized code grant.

## Actual

Neither Inji Web nor Mimoto has an entry point for a credential offer; issuance starts only from Mimoto's issuer list with the authorization code flow. Found by code reading of both repositories and confirmed by the playground runs: the `inji-web` role can only use wallet-initiated issuance.

## Suggested change

An offer route in Inji Web that passes the offer to Mimoto, with the pre-authorized code grant.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
