# 0003. Run Inji Certify in pre-authorized mode for the core stack

- Status: Accepted
- Date: 2026-10-04

## Context

- Inji Certify issues through an authorization server. The sample stack uses eSignet for the authorization code flow, which needs its own services, an OIDC client and about 4 GB more memory, and a login page a headless run cannot pass.
- Certify 0.14.0 has a pre-authorized code profile in which it is its own authorization server, and the problem statement's core path (Certify issues, a wallet holds, Inji Verify verifies) does not require a login.

## Decision

- The core stack runs Certify with the pre-authorized profile (`config/certify-preauth.properties`): the `inji-certify` role creates an offer with `POST /v1/certify/pre-authorized-data`, and any wallet that takes offers redeems it.
- Wallets that only run the authorization code flow (Inji Web through Mimoto) get a second Certify in authorization code mode, see [0008](0008-test-authorization-server.md).

## Alternatives considered

- **eSignet with mock identity:** closer to a production deployment, but heavy, and every run would need a browser login.

## Consequences

- Three sample-configuration gaps had to be fixed to make the profile work (G1, G3) and are recorded with issue drafts; G6 records that one Certify cannot serve both kinds of wallet.
- The admin APIs this profile uses are unauthenticated in the sample (G11), so the stack never publishes Certify beyond localhost.
