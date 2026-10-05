# Local Inji stack

Inji Certify, Mimoto with Inji Web, and Inji Verify on one machine, with no external service, for the
playground's live interoperability runs. Docker Compose project `ps02-inji`.

- Start, stop, check: [docs/setup.md](../../docs/setup.md#local-inji-stack) (commands, ports, memory, troubleshooting).
- What came from upstream and how it was checked: [UPSTREAM.md](UPSTREAM.md).
- This page: versions, services, profiles, and every change against upstream with its reason.

## Versions

| Component           | Image                                        | Notes                                              |
| ------------------- | -------------------------------------------- | -------------------------------------------------- |
| Inji Certify        | `injistack/inji-certify-with-plugins:0.14.0` | pre-authorized code mode (profile `preauth`)       |
| Mimoto              | `injistack/mimoto:0.22.0`                    | backend of Inji Web                                |
| Inji Web            | `injistack/inji-web:0.17.0`                  | browser wallet                                     |
| Inji Verify service | `injistack/inji-verify-service:0.18.2`       |                                                    |
| Inji Verify UI      | `injistack/inji-verify-ui:0.18.2`            |                                                    |
| Postgres            | `postgres:15`                                | one server, databases for Certify, Mimoto, Verify  |
| nginx               | `nginx:stable`                               | certify-nginx, TLS front, and the one-shot helpers |

This set ran together on 2026-10-04 (research trial). The upstream compose files pair Certify 0.14.0 with
Mimoto 0.21.0 and Inji Web 0.16.0; Mimoto 0.22.0 and Inji Web 0.17.0 are the pair of the inji-web compose
file, so the Mimoto configuration comes from the mimoto repository rather than the Certify sample.

## Services and profiles

`docker compose up` without `--profile` starts only services without a profile, so the core always runs and
the rest is opt-in.

| Service          | Profile      | Host port                    | What it does                                                                                            |
| ---------------- | ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `init`           | core         | -                            | one-shot: test CA and TLS certificate ([scripts/stack-init.sh](scripts/stack-init.sh))                  |
| `database`       | core         | 28432 (host mode, 127.0.0.1) | Postgres; databases from [scripts/postgres-init.sh](scripts/postgres-init.sh)                           |
| `certify`        | core         | 28090 (host mode, 127.0.0.1) | Inji Certify, its own authorization server                                                              |
| `certify-nginx`  | core         | 28091                        | upstream sample nginx: issuer `.well-known`, Certify API, Mimoto config files                           |
| `certify-seed`   | core         | -                            | one-shot: adds the SD-JWT credential configuration ([scripts/certify-seed.sh](scripts/certify-seed.sh)) |
| `tls-front`      | core         | 28443                        | HTTPS for `certify.ps02.test`, `verify.ps02.test`, `ref.ps02.test`, `playground.ps02.test`              |
| `verify-service` | core         | 28080                        | Inji Verify backend                                                                                     |
| `mimoto-service` | `holder-web` | 28099                        | Mimoto; the name is fixed because the inji-web image proxies to it                                      |
| `inji-web`       | `holder-web` | 28004                        | Inji Web                                                                                                |
| `verify-ui`      | `verify-ui`  | 28030                        | Inji Verify UI                                                                                          |

Health checks: Certify issuer metadata (its `/actuator/health` needs a token), Mimoto `/v1/mimoto/issuers`
(its health reports 503 without Redis although the APIs work), Inji Verify `/v1/verify/did.json`.

## Credentials Certify issues

| Configuration      | Format      | Proof / algorithm                                           | Source                                                |
| ------------------ | ----------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `FarmerCredential` | `ldp_vc`    | Ed25519Signature2020                                        | upstream `sql/certify_init.sql`                       |
| `FarmerSdJwt`      | `vc+sd-jwt` | EdDSA, `fullName` and `dateOfBirth` selectively disclosable | [config/seed/](config/seed/), added by `certify-seed` |

Both are signed by the issuer `did:web:certify.ps02.test`. Holder binding: `did:jwk` or `did:key`; the proof
JWT may use RS256 or ES256 for `FarmerCredential` (upstream seed row).

## Issuer DID over HTTPS (gap G2)

Inji's verifier library resolves `did:web` only over `https://`
(`vc-verifier/.../DidWebPublicKeyResolver.kt:103`), so a credential from a locally hosted issuer was `INVALID`
in the research trial. The stack therefore:

1. names the issuer `did:web:certify.ps02.test` (`.test` is reserved, it never resolves on the internet);
2. gives the `tls-front` nginx that host name as a network alias and serves Certify's DID document at
   `https://certify.ps02.test/.well-known/did.json` with a certificate from a test CA made by `init`;
3. mounts the test CA at `/certificates` in `verify-service` and `mimoto-service` with `USE_SYSTEM_CA_CERTS=1`,
   which makes the images' own Temurin entrypoint add it to the JVM trust store (log line
   `Adding certificate with alias PS02 Playground Test CA (test only) to the JVM truststore`).

Measured result (2026-10-04, `npm run stack:smoke`, `SMOKE PASS`): Inji Verify 0.18.2 answered `SUCCESS` for
a fresh Certify `ldp_vc` signed by `did:web:certify.ps02.test` (2.9 s), so the TLS front and the trust import
remove gap G2 inside the local stack. Gap G2 itself (no `http` fallback in the resolver) remains upstream.

## Changes against upstream

Each change is its own commit on top of the unchanged import (`git log -p -- deploy/inji-stack/<file>`).

| Gap / change       | File                                                                    | Change                                                                                                                | Why                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1                 | `config/certify-default.properties`                                     | add `credentialOfferCache` to `mosip.certify.cache.names`; size and expiry for both pre-auth caches                   | `POST /pre-authorized-data` failed with `IllegalStateException: credentialOfferCache not available` (trial run 1). Without an entry, `SimpleCacheConfig` gives a cache 60 s and 100 entries, shorter than the default offer lifetime of 600 s (code reading). |
| preauth profile    | `config/certify-preauth.properties` (new)                               | `PreAuthDataProviderPlugin`, Certify as its own authorization server, issuer DID                                      | pre-authorized code issuance without eSignet                                                                                                                                                                                                                  |
| G3                 | `nginx/certify-nginx.conf`                                              | route `/.well-known/oauth-authorization-server` to Certify                                                            | the metadata names `http://certify-nginx:80` as authorization server; Mimoto and the smoke wallet append the RFC 8414 suffix at the host root, which returned 404                                                                                             |
| issuer DID         | `sql/certify_init.sql`                                                  | `did_url` `did:web:certify.ps02.test` instead of the sample's ngrok host                                              | an issuer DID the TLS front can serve                                                                                                                                                                                                                         |
| Verify schema      | `scripts/postgres-init.sh` (new)                                        | create `inji_verify` from `db_scripts/inji_verify/db.sql` + `ddl.sql`                                                 | the inji-verify compose sample uses `docker-compose/db-init/init.sql`, whose `vp_submission` lacks the `response_code*` columns that `VPSubmission` in verify-service 0.18.2 maps (code reading)                                                              |
| G10                | `compose.yaml`                                                          | `OVP_QR_HEADER=INJI_OVP://payload=`                                                                                   | the inji-verify compose sample writes `{OVP_QR_HEADER-INJI_OVP://payload=}` (no `$`), so the braces become the header                                                                                                                                         |
| cookie flag        | `compose.yaml`                                                          | `INJI_VERIFY_COOKIE_SECURE_VALUE=false`                                                                               | verify-service defaults to `Secure` cookies (`application.properties`), which browsers refuse over plain `http` on any host other than localhost (for example a LAN address when a phone takes part)                                                          |
| Mimoto 0.22 config | `config/mimoto-default.properties`, `config/mimoto-issuers-config.json` | Inji Web URL and CORS origin on port 28004; token endpoint on 28099 and Certify as token endpoint; mDL issuer removed | project port range; no eSignet; Mimoto 0.22.0 does not handle `mso_mdoc`                                                                                                                                                                                      |
| G4                 | `config/seed/farmer-sd-jwt.credential-configuration.json` (new)         | display with logo, background and text colour                                                                         | Mimoto rejects the whole issuer when one configuration lacks them (trial run 2, `RESIDENT-APP-041`)                                                                                                                                                           |

Settings that are not file edits, all in `compose.yaml`: Postgres trust authentication on the internal network
(no team password); Mimoto's `oidckeystore.p12` client key created at first start by
[scripts/mimoto-start.sh](scripts/mimoto-start.sh) instead of a key from client onboarding; Inji Verify's own
DID `did:web:verify.ps02.test:v1:verify` (served through the TLS front).

## Known limits

- Inji Web cannot download from this Certify: Mimoto 0.22.0 only runs the authorization code flow, and Certify
  in `preauth` mode is not an authorization-code server (gaps G5, G6). WP-14 adds a Certify in
  authorization-code mode behind a test authorization server.
- Admin APIs of Certify (`/credential-configurations`, `/pre-authorized-data`) need no authentication in the
  sample configuration (G11). Fine for a local playground; never expose these ports.
- `ref.ps02.test` points at `host.docker.internal:28100`, resolved by Docker Desktop's DNS. On Linux without
  Docker Desktop, set `PLAYGROUND_REF_UPSTREAM` to the host's bridge address, for example
  `http://172.17.0.1:28100`.
