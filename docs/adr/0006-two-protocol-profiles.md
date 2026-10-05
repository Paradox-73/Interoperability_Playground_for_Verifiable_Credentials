# 0006. Implement two protocol profiles in the reference roles

- Status: Accepted
- Date: 2026-10-04

## Context

- Inji Certify 0.14.0 speaks OpenID4VCI draft 13, Inji Verify 0.18.2 and Inji Wallet speak OpenID4VP drafts 21-23 with Presentation Exchange. The final specifications (OpenID4VCI 1.0, OpenID4VP 1.0 with DCQL) differ in nonce handling, response shapes, client id prefixes and the query language.
- Testing Inji only against the final specifications would fail every cell for version reasons; testing only against the drafts would say nothing about the final specifications.

## Decision

- The reference issuer, wallet and verifier implement both: OpenID4VCI `draft13` and `v1`, OpenID4VP `inji-draft` and `final-1.0`, chosen per run. The compatibility check pairs them with what each role declares.

## Alternatives considered

- **Only the drafts Inji speaks:** no value for implementations that follow the final specifications.

## Consequences

- Every reference test runs in both profiles, and the reference matrix covers both (82 cells, measured 2026-10-05).
- A cell whose roles share no profile is reported as not supported, with the reason, instead of failing.
