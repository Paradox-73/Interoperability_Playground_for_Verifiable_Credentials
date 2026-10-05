# Inji Verify resolves did:web only over https:// (G2)

**Repository:** [inji/inji-verify](https://github.com/inji/inji-verify)

**Version:** 0.18.2 (vc-verifier)

**Case:** `npm run stack:smoke` step 4 (Inji Verify `vc-verification` of a Certify `ldp_vc` signed by `did:web:certify.ps02.test`)

**Date:** 2026-10-04

**Severity:** low; **status:** known upstream behaviour

## Summary

did:web resolution in vc-verifier always uses https, so a local issuer DID needs a TLS front with a CA the verifier trusts. Worked around by the stack's TLS front and test CA (e19cb30).

## Steps

1. Issue an `ldp_vc` from Inji Certify under a `did:web` whose host is only reachable inside a local network over plain HTTP.
2. Verify it with `POST /v1/verify/vc-verification` on verify-service 0.18.2.

## Expected

The did:web method specification resolves over HTTPS, so this is conformant. For local and test deployments a way to trust a private CA, or an explicit HTTP option for test, would let a local issuer be verified.

## Actual

Verification fails until the DID document is served over HTTPS with a certificate the JVM trusts (`DidWebPublicKeyResolver.kt:103` builds an `https://` URL). The playground stack serves `did:web` documents through a TLS front with a test CA imported into the JVM trust store.

## Suggested change

Documented trust-store import for test deployments (the Temurin images already support `USE_SYSTEM_CA_CERTS`).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
