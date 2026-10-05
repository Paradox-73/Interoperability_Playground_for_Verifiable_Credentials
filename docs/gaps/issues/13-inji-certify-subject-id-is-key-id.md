# Inji Certify writes the holder's key id (did:jwk:...#0) as credentialSubject.id (G13)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0

**Case:** TC_PG_LIVE_02 and TC_PG_LIVE_04 (the `ldp_vc` in the stored runs)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

The ldp_vc credentialSubject.id is the kid of the holder's proof JWT, a DID URL with the fragment #0, instead of the holder DID. A presentation's holder is a DID, so verifiers that compare credentialSubject.id with the holder literally (VC Data Model holder binding) see a mismatch. Related to inji/inji-certify#1054 (padded did:jwk).

## Steps

1. Request `FarmerCredential` (`ldp_vc`) with a `jwt` key proof whose `kid` is `did:jwk:<key>#0`.
2. Read `credentialSubject.id`.

## Expected

`credentialSubject.id` is the holder DID, `did:jwk:<key>`, which the presentation's `holder` can equal.

## Actual

`credentialSubject.id` is the key id `did:jwk:<key>#0`. Verifiers that compare the subject with the presentation holder literally see a mismatch. Related: inji/inji-certify#1054 (padded did:jwk).

## Suggested change

Strip the fragment and write the DID.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
