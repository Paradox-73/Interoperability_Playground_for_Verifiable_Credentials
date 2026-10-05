# Inji Certify farmer sample depends on a JSON-LD context on a personal GitHub Pages site (G18)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (FarmerCredential sample)

**Case:** TC_PG_LIVE_02 (the `ldp_vc` in the stored run)

**Date:** 2026-10-05

**Severity:** low; **status:** new; no upstream issue found

## Summary

FarmerCredential uses the context https://piyush7034.github.io/my-files/farmer.json. Every verifier must fetch it to verify the credential; if the page changes or disappears, every issued credential stops verifying or changes meaning.

## Steps

1. Issue `FarmerCredential` from the Certify sample.
2. Read its `@context`.

## Expected

Contexts from a stable, project-owned location (or bundled with verifiers).

## Actual

The sample uses `https://piyush7034.github.io/my-files/farmer.json`. Every verifier fetches it; if that page changes or disappears, every issued credential stops verifying or changes meaning.

## Suggested change

Host the context under an Inji-owned domain and pin its hash.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
