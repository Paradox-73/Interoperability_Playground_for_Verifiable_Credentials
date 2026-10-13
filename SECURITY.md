# Security

## What this project is

The playground is a test and demonstration tool. It runs local Inji containers and reference roles
with **test keys only** and is not meant to hold real personal data or to face the internet.

- Every key, certificate and password it needs is generated at run time into the run directory
  (`PLAYGROUND_RUN_DIR`, default `./run`), which is git-ignored. Delete that folder to start fresh.
- The recording proxy stores full request and response bodies, including access tokens and codes, in
  the local SQLite database inside the run directory. Exports (reports, fixtures, matrix files) replace
  tokens, codes, cookies and private keys with placeholders.
- Configuration files imported from upstream Inji repositories contain the upstream sample passwords.
  They are listed in `.gitguardian.yaml` and only work against throw-away local containers.
- The server listens on 127.0.0.1 by default. The container image listens on all interfaces inside the
  container; publish its port only on a trusted network.

## What the playground protects against

The reference verifier and issuer parse data from outside, so these limits exist and each has a test.

| Area                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser headers         | Every answer except `/proxy/*` carries `Content-Security-Policy` (scripts only from the server, no inline script, no plugins, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. Proxied Inji answers keep their own headers. The only CSP report in Chrome is the schema library's `Function('')` test, which falls back by itself. |
| Server-side fetches     | A `did:web` document or a status list is fetched only from a public address. Private, loopback and link-local addresses (10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, `::1`, `fc00::/7`, `fe80::/10`, and IPv6 forms that carry one of them) are refused, as are redirects and answers over 100 KB. The timeout is 10 s.                                                                                 |
| Fetch allow-list        | `*.ps02.test` (the local Inji stack), the server's own public host and port, and the hosts in `PLAYGROUND_FETCH_ALLOWED_HOSTS` (comma-separated `name`, `name:port` or `*.name`) skip the address check. `localhost` is not allowed, except the server's own port.                                                                                                                                          |
| Known fetch limit       | The name is resolved again when the request is made, so DNS rebinding is not blocked. Remote JSON-LD contexts (live mode only) have no address or size limit.                                                                                                                                                                                                                                               |
| Credential status       | The reference verifier reads Token Status Lists (SD-JWT VC) and Bitstring Status Lists (`ldp_vc`), signed by the credential's own issuer. A revoked or suspended credential is `INVALID`. At most 8 status entries per presentation. Every report has a `status` check that says `pass`, or `skipped` with the reason. Not checked: `mso_mdoc`, StatusList2021, multi-bit entries.                          |
| Issuer trust            | An SD-JWT VC or `ldp_vc` from a DID issuer is accepted only if the issuer is a reference issuer or listed in `PLAYGROUND_TRUSTED_ISSUERS`. A DID key speaks only for its own DID, so a self-made key claiming another issuer's name is `INVALID` (scenarios `self-issued`, `issuer-name-borrowed`).                                                                                                         |
| Holder binding          | An `ldp_vp` whose credential names no DID holder reports `holder-binding: skipped` with the reason, not `pass`.                                                                                                                                                                                                                                                                                             |
| Digital Credentials API | An answer posted without an `Origin` header is refused with HTTP 400.                                                                                                                                                                                                                                                                                                                                       |
| Presentation submission | A `descriptor_map` entry that matches no input descriptor is refused (`SUBMISSION_INVALID`).                                                                                                                                                                                                                                                                                                                |
| `tx_code` guessing      | The reference issuer revokes a pre-authorized code after 5 wrong `tx_code` values and compares the code in constant time.                                                                                                                                                                                                                                                                                   |
| Dependencies            | `npm audit` reports 0 vulnerabilities (2026-10-14). The earlier `katex` advisory GHSA-238p-pmpm-9mq7 is gone with `mermaid` 12.2.0.                                                                                                                                                                                                                                                                         |

## What it does not protect against

- The API has no login. Anyone who can reach port 28100 can start runs, read stored runs and use `/proxy/*`
  to reach the Inji services. Keep the default bind to 127.0.0.1 unless a phone must reach the server.
- DNS rebinding and remote JSON-LD contexts, as listed above.

## Reporting a vulnerability in this playground

Use the repository's private vulnerability reporting (GitHub: **Security → Report a vulnerability**).
Please do not open a public issue. We aim to answer within 7 days.

## Vulnerabilities found in Inji modules

Interoperability problems found with the playground are written up in `docs/gaps/`. A problem with a
security impact (for example a forged credential being accepted) is not published there; it is
reported privately to MOSIP through the channel MOSIP names, and listed publicly only as "reported
privately" until MOSIP agrees otherwise.
