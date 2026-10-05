# Inji Verify answers HTTP 500 instead of a result for a presentation it cannot parse (G19)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2

**Case:** TC_PG_LIVE_05 (variant: the `ldp_vp` proof's `verificationMethod` is not a valid URI)

**Date:** 2026-10-05

**Severity:** low; **status:** new; no upstream issue found

## Summary

A presentation whose proof verificationMethod is not a valid URI makes POST /v1/verify/v2/vp-results answer 500 VP_VERIFICATION_FAILED (runtime exception) and GET /vp-result answer FAILED with no credential results, instead of an INVALID result that names the check.

## Steps

1. Create a request with `POST /v1/verify/vp-request`.
2. Submit an `ldp_vp` whose proof `verificationMethod` is not a valid DID URL (measured with a value with two fragments, `did:jwk:...#0#0`).
3. Call `POST /v1/verify/v2/vp-results/{transactionId}` and `GET /v1/verify/vp-result/{transactionId}`.

## Expected

A result of `INVALID` that names the failing check.

## Actual

`/v2/vp-results` answers HTTP 500 `VP_VERIFICATION_FAILED` (runtime exception) and `/vp-result` answers `FAILED` with no credential results. Measured on 2026-10-05 with an earlier build of the playground wallet that produced such a value; the wallet has since been fixed, so no stored matrix cell shows it.

## Suggested change

Catch the parse error and report the check as failed.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
