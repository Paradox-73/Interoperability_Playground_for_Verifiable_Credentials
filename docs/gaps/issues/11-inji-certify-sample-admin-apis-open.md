# Inji Certify sample: credential-configuration and pre-authorized-data APIs are unauthenticated (G11)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (sample config)

**Case:** TC_PG_LIVE_01 (the `inji-certify` role creates offers with `POST /v1/certify/pre-authorized-data` and no credentials)

**Date:** 2026-10-04

**Severity:** medium; **status:** new; no upstream issue found

## Summary

In the sample configuration anyone who can reach Certify can create credential configurations and pre-authorized offers with arbitrary claims. Acceptable for a local sample; dangerous if the sample is exposed. The playground never publishes these ports.

## Steps

1. Start Inji Certify 0.14.0 with the sample configuration.
2. Call `POST /v1/certify/credential-configurations` or `POST /v1/certify/pre-authorized-data` without any authentication.

## Expected

The sample protects administrative APIs, or says clearly that it must never be reachable from another machine.

## Actual

Both calls succeed for anyone who can reach the port: new credential configurations and offers with arbitrary claims. Acceptable for a local sample; the playground never publishes these ports beyond localhost.

## Suggested change

Authentication on the admin APIs in the sample, or a warning in the sample's README.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
