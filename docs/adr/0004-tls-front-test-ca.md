# 0004. Serve did:web over HTTPS through a TLS front with a test CA

- Status: Accepted
- Date: 2026-10-04

## Context

- Inji's verifier library resolves `did:web` only over `https://` (gap G2). Certify signs `ldp_vc` under a `did:web`, so a local issuer was `INVALID` at Inji Verify in the research trial.
- No public domain or certificate is available to a local stack, and nothing may depend on the internet.

## Decision

- Names under `.ps02.test` (reserved, never resolvable on the internet) for every service whose DID or URL must be HTTPS: `certify.ps02.test`, `certify-ac.ps02.test`, `verify.ps02.test`, `ref.ps02.test`, `playground.ps02.test`.
- An nginx TLS front with those names as network aliases, and a test CA created at first start by the `init` service (`$PLAYGROUND_RUN_DIR/stack/ca/`).
- The JVM-based services trust the CA through the images' own `USE_SYSTEM_CA_CERTS` entrypoint; the playground trusts it through `NODE_EXTRA_CA_CERTS` or `PLAYGROUND_EXTRA_CA`.

## Alternatives considered

- **Patch the verifier to allow http:** changes the module under test.
- **A public tunnel with a real certificate:** depends on the internet and an account, and exposes the stack.

## Consequences

- Inji Verify answered `SUCCESS` for a Certify `ldp_vc` under `did:web:certify.ps02.test` (measured 2026-10-04).
- Recreating a JVM container with `docker restart` fails once the CA is already imported (the entrypoint exits); the troubleshooting tables say to recreate it instead.
