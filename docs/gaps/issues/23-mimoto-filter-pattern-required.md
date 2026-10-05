# Mimoto refuses Presentation Exchange field filters without a pattern (G23)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0 (inji-openid4vp library)

**Case:** TC_PG_WEB_06 (reference issuer -> Inji Web -> reference verifier, `ldp_vc`)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

POST /v1/mimoto/wallets/{id}/presentations answers HTTP 400 "Missing Input: filter->pattern param is required" for an input descriptor whose field filter is {"type": "array", "contains": {"const": "FarmerCredential"}} or {"type": "string", "const": ...}. DIF Presentation Exchange 2.0 makes filter any JSON Schema; pattern is optional. The playground's Inji Verify requests add a pattern to every filter to get past this; requests from the reference verifier, which follow the specification, are refused.

## Steps

1. Create an OpenID4VP request whose input descriptor field filter is `{"type": "array", "contains": {"const": "FarmerCredential"}}` or `{"type": "string", "const": "..."}`.
2. Pass it to Mimoto with `POST /v1/mimoto/wallets/{id}/presentations`.

## Expected

The request is accepted: Presentation Exchange 2.0 makes `filter` any JSON Schema, and `pattern` is optional.

## Actual

HTTP 400 `"Missing Input: filter->pattern param is required"` (inji-openid4vp library). The playground adds a `pattern` to every filter it sends through Inji Verify to get past this; requests from the reference verifier, which follow the specification, are refused.

## Suggested change

Accept filters without `pattern`.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
