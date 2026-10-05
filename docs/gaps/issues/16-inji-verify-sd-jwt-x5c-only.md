# Inji Verify verifies SD-JWT VCs only when the issuer key comes in an x5c header (G16)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2

**Case:** TC_PG_LIVE_06 (reference issuer -> reference wallet -> Inji Verify, `vc+sd-jwt`)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

An SD-JWT VC whose issuer key is named by a DID kid (did:key, did:jwk) fails with ERR_SIGNATURE_VERIFICATION_FAILED "getX509CertChain(...) must not be null". SD-JWT VC also allows issuer keys from JWT VC Issuer Metadata or a DID; only x5c works.

## Steps

1. Issue an SD-JWT VC whose issuer key is named by a DID `kid` (`did:key` or `did:jwk`), without an `x5c` header.
2. Present it to Inji Verify 0.18.2.

## Expected

The issuer key is resolved from the DID (or from JWT VC Issuer Metadata), as the SD-JWT VC draft allows.

## Actual

`ERR_SIGNATURE_VERIFICATION_FAILED` with "getX509CertChain(...) must not be null": only an `x5c` header works.

## Suggested change

Resolve DID `kid`s and JWT VC Issuer Metadata.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
