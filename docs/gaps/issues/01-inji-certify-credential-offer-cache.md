# Pre-authorized issuance fails: credentialOfferCache missing from the sample cache names (G1)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (sample docker-compose config)

**Case:** TC_PG_LIVE_01 (`packages/cli/specs/live-core.yaml`); `npm run stack:smoke` step 3

**Date:** 2026-10-04

**Severity:** medium; **status:** worked around in the playground stack; the upstream file still has it

## Summary

mosip.certify.cache.names in the sample certify-default.properties does not list credentialOfferCache, so POST /v1/certify/pre-authorized-data fails with credentialOfferCache not available. Fixed in the imported config (ba25dc6).

## Steps

1. Start Inji Certify 0.14.0 with the sample `docker-compose/docker-compose-injistack/config/certify-default.properties` (inji-certify@e54539a) and a pre-authorized data provider profile.
2. Call `POST /v1/certify/pre-authorized-data` with a credential configuration id and its claims.

## Expected

HTTP 200 with a `credential_offer_uri`.

## Actual

The request fails with `IllegalStateException: credentialOfferCache not available`: `mosip.certify.cache.names` does not list `credentialOfferCache`. Without an entry, `SimpleCacheConfig` would also give the cache 60 s and 100 entries, shorter than the default offer lifetime of 600 s (code reading).

## Suggested change

Add `credentialOfferCache` (and its size and expiry) to the sample properties; the playground does this in `deploy/inji-stack/config/certify-default.properties` (commit `ba25dc6`).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
