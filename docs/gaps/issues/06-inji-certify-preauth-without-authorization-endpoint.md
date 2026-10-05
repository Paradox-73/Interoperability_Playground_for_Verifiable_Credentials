# Inji Certify authorization-server metadata has no authorization_endpoint in the pre-authorized profile (G6)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0

**Case:** `GET /api/compatibility?issuer=inji-certify&wallet=inji-web&verifier=inji-verify&format=ldp_vc`; TC_PG_WEB_03 uses certify-ac instead

**Date:** 2026-10-04

**Severity:** medium; **status:** new; no upstream issue found

## Summary

In the pre-authorized code profile Certify acts as its own authorization server without an authorization endpoint, so wallets that only run the authorization code flow (Inji Web through Mimoto) cannot obtain credentials from it.

## Steps

1. Run Inji Certify 0.14.0 with the pre-authorized profile, where Certify is its own authorization server.
2. Read `GET /.well-known/oauth-authorization-server`.

## Expected

One Certify deployment can serve both pre-authorized offers and wallets that run the authorization code flow (Inji's own Inji Web).

## Actual

The metadata has no `authorization_endpoint`, so Inji Web through Mimoto cannot obtain credentials from it. The playground runs a second Certify (certify-ac) in authorization code mode behind its test authorization server to connect Inji Web.

## Suggested change

Allow the pre-authorized grant and an external authorization server (or Certify's own authorization endpoint) in one deployment, or document that two deployments are needed.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
