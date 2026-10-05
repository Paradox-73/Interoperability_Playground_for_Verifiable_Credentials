# Inji Verify drops Presentation Exchange filter keywords it does not model (G17)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2

**Case:** TC_PG_LIVE_05 (the request Inji Verify stored and handed to the wallet)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

POST /v1/verify/vp-request with a field filter {"type": "array", "contains": {"const": "FarmerCredential"}} is stored and sent to the wallet as {"type": "array"}: the constraint that selects the credential type is lost, so the request asks for any credential.

## Steps

1. Call `POST /v1/verify/vp-request` with an input descriptor field filter `{"type": "array", "contains": {"const": "FarmerCredential"}}`.
2. Read the presentation definition in the answer, or the request the wallet receives.

## Expected

The filter as sent: Presentation Exchange 2.0 allows any JSON Schema in `filter`.

## Actual

It comes back as `{"type": "array"}`: keywords Inji Verify does not model (`contains`, `const`) are dropped, so the request asks for any credential.

## Suggested change

Store the filter as received.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
