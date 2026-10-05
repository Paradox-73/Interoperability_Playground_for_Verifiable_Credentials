# Inji Verify compose: OVP_QR_HEADER value missing its $ (G10)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2 (docker-compose)

**Case:** `npm run stack:up` with the `verify-ui` profile (compose configuration)

**Date:** 2026-10-04

**Severity:** low; **status:** worked around in the playground stack; the upstream file still has it

## Summary

The sample compose sets the Inji Verify UI's OVP_QR_HEADER without the leading $ of the variable reference, so the QR header is a literal string. Fixed in the playground compose (76f2b67).

## Steps

1. Start the Inji Verify UI from the sample `docker-compose` of inji-verify 0.18.2.
2. Read the container environment of the UI.

## Expected

`OVP_QR_HEADER=INJI_OVP://payload=` (the variable reference resolved, or the plain default).

## Actual

The sample writes `{OVP_QR_HEADER-INJI_OVP://payload=}` without the `$`, so the braces and text become the QR header.

## Suggested change

Write `${OVP_QR_HEADER:-INJI_OVP://payload=}`; the playground compose sets the value directly (commit `76f2b67`).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
