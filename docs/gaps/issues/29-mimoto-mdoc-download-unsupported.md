# Mimoto refuses to download an mso_mdoc: Unsupported credential format (G29)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_10 (certify-ac -> Inji Web -> Inji Verify, `mso_mdoc`) in `packages/cli/specs/live-holder-web.yaml`

**Date:** 2026-10-06

**Severity:** low; **status:** new; no upstream issue found

## Summary

`POST /v1/mimoto/credentials/download` for an `mso_mdoc` configuration answers HTTP 500 `RESIDENT-APP-028`
"Unsupported credential format: mso_mdoc", for Inji Certify's `FarmerMdoc` and for the reference issuer's
`FarmerCredential_mso_mdoc`. Mimoto's issuer metadata validator lists `mso_mdoc`, and the issuer stays usable for
its other configurations.

## Steps

1. Add an `mso_mdoc` configuration to an issuer Mimoto knows (certify-ac `FarmerMdoc`).
2. Run Inji Web's download for it (authorization code flow, then `POST /v1/mimoto/credentials/download`).

## Expected

The mdoc is downloaded (and can be stored in a wallet).

## Actual

HTTP 500 `{"errors":[{"errorCode":"RESIDENT-APP-028","errorMessage":"Unsupported credential format: mso_mdoc"}]}`.

## Suggested change

Support `mso_mdoc` in the download and wallet storage, or leave `mso_mdoc` configurations out of what Inji Web
offers.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
