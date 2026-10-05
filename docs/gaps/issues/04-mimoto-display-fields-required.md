# Mimoto requires display logo, background_color and text_color on every credential configuration (G4)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_05 (`packages/cli/specs/live-holder-web.yaml`), with a credential configuration whose `display` lacks `logo`, `background_color` or `text_color`

**Date:** 2026-10-04

**Severity:** low; **status:** new; no upstream issue found

## Summary

Mimoto rejects issuer metadata (RESIDENT-APP-041) when a credential configuration lacks display fields that OpenID4VCI marks optional.

## Steps

1. Add an issuer to `mimoto-issuers-config.json` whose metadata has one credential configuration with `display: [{ "name": "...", "locale": "en" }]` and no logo or colours.
2. Open the issuer in Inji Web, or call `GET /v1/mimoto/issuers/{id}/well-known-proxy`.

## Expected

The issuer is listed. OpenID4VCI 1.0 section 12.2.4 makes `logo`, `background_color` and `text_color` optional.

## Actual

Mimoto rejects the whole issuer with `RESIDENT-APP-041`, also for its other, complete configurations.

## Suggested change

Treat the display fields as optional and fall back to defaults. The playground reference issuer and the Certify SD-JWT seed set all three.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
