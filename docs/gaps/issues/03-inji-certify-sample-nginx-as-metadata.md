# Authorization server metadata at the host root is not routed by the sample nginx (G3)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0 (sample nginx.conf)

**Case:** TC_PG_LIVE_01 (the reference wallet fetches the authorization server metadata)

**Date:** 2026-10-04

**Severity:** low; **status:** worked around in the playground stack; the upstream file still has it

## Summary

/.well-known/oauth-authorization-server at the host root returns 404 behind the sample nginx; wallets that look there (Mimoto) cannot find the token endpoint. Fixed in certify-nginx.conf (af9e36d).

## Steps

1. Start the sample Inji stack with its `nginx.conf` in front of Certify 0.14.0 in pre-authorized mode.
2. Read the issuer metadata: `authorization_servers` is `http://certify-nginx:80`.
3. Request `GET http://certify-nginx:80/.well-known/oauth-authorization-server` (RFC 8414 section 3).

## Expected

HTTP 200 with the authorization server metadata.

## Actual

HTTP 404: the sample nginx routes `/.well-known/` only under `/v1/certify`. Wallets that follow RFC 8414 (Mimoto, the playground wallet) cannot find the token endpoint.

## Suggested change

Route the root `/.well-known/oauth-authorization-server` to Certify, as `deploy/inji-stack/nginx/certify-nginx.conf` does (commit `af9e36d`).

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
