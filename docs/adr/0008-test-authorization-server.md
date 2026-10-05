# 0008. Use the playground test authorization server in place of eSignet for certify-ac and Mimoto

- Status: Accepted
- Date: 2026-10-05

## Context

- Inji Web through Mimoto 0.22.0 runs only the authorization code flow (G5), and the core Certify has no authorization endpoint in pre-authorized mode (G6). Mimoto's logged-in wallet signs in through Google.
- Certify checks access tokens against a configured issuer, JWKS URL and audiences, and its CSV data provider looks the holder up by the token's `sub`. Whether it accepts tokens from another authorization server was not proven before this decision.

## Decision

- A second Certify 0.14.0, certify-ac, in authorization code mode, whose authorization server is the playground's test authorization server at `https://ref.ps02.test/ref/as` (`config/certify-ac.properties`).
- The test authorization server registers Mimoto as a `private_key_jwt` client with the certificate of the key store Mimoto's wrapper creates, gives certify-ac's scopes certify-ac's audience, and logs in the CSV row `2154189532` without a login page.
- Mimoto's Google provider settings point at the same server, so the playground signs in with a test ID token.

## Alternatives considered

- **eSignet 2.0 with the mock identity system:** the documented path, but about 4 GB more memory and a browser login per run.
- **A registered Google OAuth client:** a person's account and the internet in every run.

## Consequences

- Measured on 2026-10-05: certify-ac accepted the tokens; Mimoto downloaded from certify-ac and from the reference issuer; a signed-in wallet stored and presented. This also found G21-G25.
- The playground must run on 28100 with `PLAYGROUND_PUBLIC_URL=https://ref.ps02.test` for these runs, because certify-ac accepts only tokens issued there.
