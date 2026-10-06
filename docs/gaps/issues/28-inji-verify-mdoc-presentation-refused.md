# Inji Verify accepts an mso_mdoc presentation request but refuses every DeviceResponse (G28)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2

**Case:** TC_PG_LIVE_16 (reference issuer -> reference wallet -> Inji Verify, `mso_mdoc`) in `packages/cli/specs/live-core.yaml`

**Date:** 2026-10-06

**Severity:** medium; **status:** new; no upstream issue found

## Summary

`POST /v1/verify/vp-request` with an `mso_mdoc` input descriptor (ISO/IEC 18013-7 Annex B form: descriptor id =
docType, fields `$['namespace']['element']`) answers 201, but the `direct_post` of a DeviceResponse is answered
HTTP 400 `INVALID_VP_TOKEN` and the request stays `ACTIVE`. verify-service's presentation verification handles
`ldp_vc` and SD-JWT only, although its vc-verifier library verifies single mdoc credentials.

## Steps

1. Create a request with the presentation definition of `farmerPresentationDefinition('mso_mdoc')`
   (`packages/server/src/adapters/inji/common.ts`).
2. Answer it with a DeviceResponse that the playground's reference verifier accepts for the same request.
3. Read the `direct_post` answer and `GET /vp-request/{id}/status`.

## Expected

The presentation is verified, or the request is refused when it is created.

## Actual

`direct_post`: HTTP 400 `{"errorCode":"INVALID_VP_TOKEN","errorMessage":"Verifiable presentation failed due to invalid VP token"}`;
status stays `ACTIVE`, so a page waiting for the result waits until the request expires.

## Suggested change

Verify `mso_mdoc` DeviceResponses (session transcript of ISO/IEC 18013-7 Annex B), or refuse `mso_mdoc`
descriptors in `/vp-request` and finish the transaction with an error when a submission is refused.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
