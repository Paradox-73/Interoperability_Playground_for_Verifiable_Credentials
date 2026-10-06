# Inji Certify cannot fill an mso_mdoc in the pre-authorized profile (G26)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0

**Case:** TC_PG_LIVE_15 (Inji Certify -> reference wallet -> reference verifier, `mso_mdoc`) in `packages/cli/specs/live-core.yaml`

**Date:** 2026-10-06

**Severity:** medium; **status:** new; no upstream issue found

## Summary

`POST /v1/certify/pre-authorized-data` checks the claims of an `mso_mdoc` configuration against the top-level
keys of its `claims`, which for an mdoc are namespaces (`PreAuthorizedCodeService.validateClaimsWithMandatory`).
Flat claims are refused with `unknown_claims`; only `{"<namespace>": {...}}` is accepted. The mdoc template
reads flat names such as `${farmerID}`, so the credential is issued with every element value left as the
literal placeholder.

## Steps

1. Add an `mso_mdoc` configuration whose template fills elements from `${farmerID}`, `${fullName}`, ... (the
   playground's `deploy/inji-stack/config/seed/farmer-mdoc.credential-configuration.json`).
2. `POST /v1/certify/pre-authorized-data` with `claims: {"farmerID": "..."}`: HTTP 200 with error `unknown_claims`.
3. Post `claims: {"test.ps02.playground.farmer.1": {"farmerID": "...", ...}}` instead, redeem the offer and
   read the credential's IssuerSignedItems.

## Expected

The element values are the pre-authorized claims (the same template filled by the CSV data provider of
certify-ac is correct).

## Actual

Every `elementValue` is the unfilled placeholder: `"${farmerID}"`, `"${fullName}"`, `"${dateOfBirth}"`, ...
The recorded credential is `packages/formats/test/fixtures/inji-certify-mdoc.recorded.json`.

## Suggested change

Check mdoc pre-authorized claims against the element names inside each namespace and pass them to the template
flat (or under the namespace in a form the template engine can address).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
