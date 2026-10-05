# 0002. Record traffic at three capture points and redact only on export

- Status: Accepted
- Date: 2026-10-05

## Context

- Problem statement 02 asks to see every protocol message of a run. Some messages are sent by the server's own roles; others come from outside the server: a phone wallet calling the hosted reference issuer, Mimoto (inside the Inji stack) calling an authorization server and certify-ac, the Inji Verify web component in the browser calling verify-service.
- Outside callers do not say which run they belong to.
- Recorded traffic contains access tokens, authorization codes, cookies and private keys of test identities. Runs are exported and attached to issues.

## Decision

- Three capture points write into the run's exchange log: the outbound client every role uses (`ctx.http.fetch`), an inbound recorder in front of the hosted reference roles (`/ref/*`), and a reverse proxy in front of the Inji services (`/proxy/<service>/*` and `/v1/verify/*`).
- Outside requests are attributed by claims: a role that hands a URL to an outside party claims the capture target for its run, and the newest active claim wins. Live runs on the stack are serialised, so they never compete for a claim.
- Exchanges are stored exactly as sent. Redaction (tokens, codes, cookies, CSRF tokens, private key members) happens on the way out: exports, reports, fixtures.

## Alternatives considered

- **A recording forward proxy (HTTP_PROXY) for every container:** Inji images do not all honour proxy variables, and TLS to the `*.ps02.test` names would need interception.
- **Packet capture:** no run attribution, and TLS traffic is opaque.
- **Redact before storing:** a stored run could no longer be replayed or debugged; the export is the only thing that leaves the machine.

## Consequences

- Services that should be observed must be reached through the playground: certify-ac's public URL is `https://ref.ps02.test/proxy/certify-ac`, and the test authorization server is hosted under `/ref/as`.
- The stored database holds secrets of test identities; `SECURITY.md` says so, and the run directory is outside git.
