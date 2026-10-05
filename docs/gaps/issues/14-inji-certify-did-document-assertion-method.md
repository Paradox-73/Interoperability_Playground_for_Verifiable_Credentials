# Inji Certify did:web document lists the DID, not its key, under assertionMethod (G14)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0

**Case:** TC_PG_LIVE_04 (Certify `ldp_vc` checked by the reference verifier)

**Date:** 2026-10-05

**Severity:** high; **status:** new; no upstream issue found

## Summary

did:web:certify.ps02.test has "assertionMethod": ["did:web:certify.ps02.test"] and the same under authentication, while the Ed25519 key is did:web:certify.ps02.test#<key id>. DID Core requires verification relationships to name verification methods, so a conformant Data Integrity verifier (the playground's reference verifier, built on @digitalbazaar/vc) rejects every Certify ldp_vc: verification method not authorized for proof purpose assertionMethod. Inji Verify does not check proof purpose and accepts it.

## Steps

1. Resolve the issuer DID of a Certify `ldp_vc`, `did:web:certify.ps02.test`.
2. Read `assertionMethod` in the DID document, and the proof's `verificationMethod` in the credential.

## Expected

`assertionMethod` lists the verification method that signs (DID Core 1.0 section 5.3.2), for example `did:web:certify.ps02.test#<key id>`.

## Actual

`assertionMethod` (and `authentication`) list the DID itself, `did:web:certify.ps02.test`. A conformant Data Integrity verifier rejects every Certify `ldp_vc`: verification method not authorized for proof purpose `assertionMethod`. Inji Verify does not check the proof purpose and accepts it.

## Suggested change

List the key's DID URL under `assertionMethod`.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
