# Inji Web refuses an http response_uri, while the Inji Verify sample configuration hands one out (G24)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_03 with `INJI_VERIFY_SUBMISSION_BASE_URL=http://verify-service:8080/v1/verify` (the Inji Verify sample value)

**Date:** 2026-10-05

**Severity:** low; **status:** new; no upstream issue found

## Summary

Mimoto rejects an authorization request whose response_uri is http ("response_uri data is not valid"). The verify-service sample setting INJI_VP_SUBMISSION_BASE_URL is http://verify-service:8080/v1/verify, so an Inji Web wallet cannot answer an Inji Verify deployed with the sample values; the playground stack serves Inji Verify at https://verify.ps02.test instead.

## Steps

1. Run verify-service 0.18.2 with the sample `INJI_VP_SUBMISSION_BASE_URL` `http://verify-service:8080/v1/verify`.
2. Create a request and pass it to Mimoto 0.22.0 (`POST /wallets/{id}/presentations`).

## Expected

Inji's own wallet and verifier work together with the sample settings.

## Actual

Mimoto refuses the request: "response_uri data is not valid" (only `https` is accepted). Requiring HTTPS is reasonable; the gap is that the Inji Verify sample hands out an `http` URI, so the two samples do not work together. The playground stack serves Inji Verify at `https://verify.ps02.test`.

## Suggested change

Change the Inji Verify sample default to an HTTPS URI, or document the requirement next to it.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
