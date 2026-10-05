# Mimoto fails every later sign-in of a user whose first ID token lacked picture or phone_number (G21)

**Repository:** [inji/mimoto](https://github.com/inji/mimoto)

**Version:** 0.22.0

**Case:** TC_PG_WEB_03 (variant: the first ID token without `picture` and `phone_number`, then a second run)

**Date:** 2026-10-05

**Severity:** medium; **status:** new; no upstream issue found

## Summary

POST /v1/mimoto/auth/google/token-login works the first time for an ID token without the optional claims picture and phone_number, then answers HTTP 500 for the same user ever after: UserMetadataService.updateIfChanged dereferences the stored null values (NullPointerException). The user can sign in again only after the user_metadata row is deleted. OpenID Connect makes both claims optional.

## Steps

1. Point Mimoto 0.22.0's Google provider at an OpenID provider and sign in with `POST /v1/mimoto/auth/google/token-login` using an ID token that has `email` but no `picture` or `phone_number`.
2. Sign in again as the same user.

## Expected

Both sign-ins succeed; `picture` and `phone_number` are optional OpenID Connect claims.

## Actual

The first sign-in succeeds, every later one answers HTTP 500: `UserMetadataService.updateIfChanged` dereferences the stored null values (NullPointerException). The user can sign in again only after the `user_metadata` row is deleted.

## Suggested change

Null-safe comparison in `updateIfChanged`.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
