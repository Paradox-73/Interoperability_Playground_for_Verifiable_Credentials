# Local Inji stack

Inji Certify, Mimoto with Inji Web, and Inji Verify on one machine, with no external service, for the
playground's live interoperability runs. Docker Compose project `ps02-inji`.

- Start, stop, check: [docs/setup.md](../../docs/setup.md#local-inji-stack) (commands, ports, memory, troubleshooting).
- What came from upstream and how it was checked: [UPSTREAM.md](UPSTREAM.md).
- This page: versions, services, profiles, and every change against upstream with its reason.

## Versions

| Component           | Image                                        | Notes                                                |
| ------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Inji Certify        | `injistack/inji-certify-with-plugins:0.14.0` | pre-authorized code mode (profile `preauth`)         |
| certify-ac          | `injistack/inji-certify-with-plugins:0.14.0` | authorization code mode, playground test AS          |
| Mimoto              | `injistack/mimoto:0.22.0`                    | backend of Inji Web                                  |
| Inji Web            | `injistack/inji-web:0.17.0`                  | browser wallet                                       |
| Inji Verify service | `injistack/inji-verify-service:0.18.2`       |                                                      |
| Inji Verify UI      | `injistack/inji-verify-ui:0.18.2`            |                                                      |
| Postgres            | `postgres:15`                                | Certify, Mimoto, Verify; a second one for certify-ac |
| nginx               | `nginx:stable`                               | certify-nginx, TLS front, and the one-shot helpers   |

This set ran together on 2026-10-04 (research trial). The upstream compose files pair Certify 0.14.0 with
Mimoto 0.21.0 and Inji Web 0.16.0; Mimoto 0.22.0 and Inji Web 0.17.0 are the pair of the inji-web compose
file, so the Mimoto configuration comes from the mimoto repository rather than the Certify sample.

## Services and profiles

`docker compose up` without `--profile` starts only services without a profile, so the core always runs and
the rest is opt-in.

| Service           | Profile      | Host port                    | What it does                                                                                                       |
| ----------------- | ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `init`            | core         | -                            | one-shot: test CA and TLS certificate ([scripts/stack-init.sh](scripts/stack-init.sh))                             |
| `database`        | core         | 28432 (host mode, 127.0.0.1) | Postgres; databases from [scripts/postgres-init.sh](scripts/postgres-init.sh)                                      |
| `certify`         | core         | 28090 (host mode, 127.0.0.1) | Inji Certify, its own authorization server                                                                         |
| `certify-nginx`   | core         | 28091                        | upstream sample nginx: issuer `.well-known`, Certify API, Mimoto config files                                      |
| `certify-seed`    | core         | -                            | one-shot: adds the SD-JWT credential configuration ([scripts/certify-seed.sh](scripts/certify-seed.sh))            |
| `tls-front`       | core         | 28443                        | HTTPS for `certify.ps02.test`, `certify-ac.ps02.test`, `verify.ps02.test`, `ref.ps02.test`, `playground.ps02.test` |
| `verify-service`  | core         | 28080                        | Inji Verify backend                                                                                                |
| `database-ac`     | `holder-web` | -                            | Postgres of certify-ac: the unchanged `certify_init.sql` plus [sql-team/certify-ac.sql](sql-team/certify-ac.sql)   |
| `certify-ac`      | `holder-web` | 28093 (127.0.0.1)            | second Inji Certify, authorization code mode; tokens from the playground's test authorization server               |
| `certify-ac-seed` | `holder-web` | -                            | one-shot: adds the SD-JWT configuration to certify-ac ([config/seed-ac/](config/seed-ac/))                         |
| `mimoto-service`  | `holder-web` | 28099                        | Mimoto; the name is fixed because the inji-web image proxies to it                                                 |
| `inji-web`        | `holder-web` | 28004                        | Inji Web                                                                                                           |
| `verify-ui`       | `verify-ui`  | 28030                        | Inji Verify UI                                                                                                     |

Health checks: Certify issuer metadata (its `/actuator/health` needs a token), Mimoto `/v1/mimoto/issuers`
(its health reports 503 without Redis although the APIs work), Inji Verify `/v1/verify/did.json`.

## Credentials Certify issues

| Configuration      | Format      | Proof / algorithm                                                                                                | Source                                                                                                                                         |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `FarmerCredential` | `ldp_vc`    | Ed25519Signature2020                                                                                             | upstream `sql/certify_init.sql`                                                                                                                |
| `FarmerSdJwt`      | `vc+sd-jwt` | EdDSA, `fullName` and `dateOfBirth` selectively disclosable                                                      | [config/seed/](config/seed/), added by `certify-seed`                                                                                          |
| `FarmerMdoc`       | `mso_mdoc`  | ES256 (`CERTIFY_VC_SIGN_EC_R1`, certificate in `x5chain`), docType and namespace `test.ps02.playground.farmer.1` | [config/seed/](config/seed/) and [config/seed-ac/](config/seed-ac/), added by `certify-seed` and `certify-ac-seed` (2026-10-06); gaps G26, G27 |

Both are signed by the issuer `did:web:certify.ps02.test`. Holder binding: `did:jwk` or `did:key`; the proof
JWT may use RS256 or ES256 for `FarmerCredential` (upstream seed row).

certify-ac issues the same two configurations under `did:web:certify-ac.ps02.test`, with scopes
`mock_identity_vc_ldp` (`FarmerCredential`) and `farmer_sd_jwt` (`FarmerSdJwt`).

## certify-ac and Inji Web (holder-web profile)

Mimoto 0.22.0 runs only the authorization code flow, and the core Certify runs in pre-authorized mode
without an authorization endpoint (gaps G5, G6). certify-ac is a second Certify 0.14.0 whose authorization
server is the playground's test authorization server, so Inji Web can download without eSignet or a phone:

- [config/certify-ac.properties](config/certify-ac.properties) (team file, loaded after the unchanged
  `certify-default.properties` and `certify-csvdp-farmer.properties`) points the authorization URL, issuer,
  JWKS URL and allowed audience at `https://ref.ps02.test/ref/as`, and its domain URL at
  `https://ref.ps02.test/proxy/certify-ac`, so Mimoto's calls to it pass the playground's recording proxy.
  The test server logs in the farmer CSV row `2154189532`, which the CSV data provider looks up by `sub`.
- Its own Postgres (`database-ac`) runs the unchanged `certify_init.sql`, then
  [sql-team/certify-ac.sql](sql-team/certify-ac.sql), which names `did:web:certify-ac.ps02.test` as issuer.
  `postgres-init.sh` takes the list of files from `PS02_INIT_SQL`.
- certify-ac runs the image's `__cacert_entrypoint.sh` before `configure_start.sh`, so it trusts the test CA
  (`USE_SYSTEM_CA_CERTS=1`) and can fetch the JWKS over HTTPS.
- Mimoto: [config/mimoto-issuers-config.json](config/mimoto-issuers-config.json) gains the issuers `FarmerAC`
  (certify-ac) and `PlaygroundReference` (the reference issuer at `/ref/issuer/draft13`), both with client
  `ps02-mimoto` (`private_key_jwt` with the key store Mimoto's wrapper creates; the playground registers its
  certificate at the test server) and redirect URI `http://localhost:28004/redirect`.
  [config/mimoto-trusted-verifiers.json](config/mimoto-trusted-verifiers.json) gains the client ids
  `ps02-playground` and `ps02-playground-sdk` with Inji Verify's response URIs.
- Mimoto's Google sign-in (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_ISSUER` and the provider's JWKS and userinfo URLs)
  points at the test server, so the playground signs in with a test ID token and uses a real wallet (create,
  unlock, store, present) with no Google account. The authorization and token URLs, a fixed redirect URI
  (`http://localhost:28004/v1/mimoto/oauth2/callback/google`) and public-client authentication make Inji Web's
  own "Continue With Google" button work in a browser too (the playground registers `ps02-mimoto-login`).
- verify-service hands wallets `https://verify.ps02.test/v1/verify/...` as `response_uri`: Mimoto refuses an
  `http` one (gap G24).

Measured on 2026-10-05: certify-ac accepted the test server's tokens; Mimoto downloaded from certify-ac (`ldp_vc`
and `vc+sd-jwt`) and from the reference issuer (`ldp_vc`); a signed-in Inji Web wallet stored and presented `ldp_vc`
credentials to Inji Verify, which reported `INVALID` because of gap G22. Inji Web cannot present SD-JWT VCs
(G25). Memory of the profile in steady state: Mimoto 762 MiB, certify-ac 647 MiB, `database-ac` 38 MiB,
Inji Web 13 MiB (`docker stats`, about 1.46 GiB).

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

| Gap / change       | File                                                                                          | Change                                                                                                                                                                                                                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1                 | `config/certify-default.properties`                                                           | add `credentialOfferCache` to `mosip.certify.cache.names`; size and expiry for both pre-auth caches                                                                                                                                                                 | `POST /pre-authorized-data` failed with `IllegalStateException: credentialOfferCache not available` (trial run 1). Without an entry, `SimpleCacheConfig` gives a cache 60 s and 100 entries, shorter than the default offer lifetime of 600 s (code reading).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| preauth profile    | `config/certify-preauth.properties` (new)                                                     | `PreAuthDataProviderPlugin`, Certify as its own authorization server, issuer DID                                                                                                                                                                                    | pre-authorized code issuance without eSignet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G3                 | `nginx/certify-nginx.conf`                                                                    | route `/.well-known/oauth-authorization-server` to Certify                                                                                                                                                                                                          | the metadata names `http://certify-nginx:80` as authorization server; Mimoto and the smoke wallet append the RFC 8414 suffix at the host root, which returned 404                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| issuer DID         | `sql/certify_init.sql`                                                                        | `did_url` `did:web:certify.ps02.test` instead of the sample's ngrok host                                                                                                                                                                                            | an issuer DID the TLS front can serve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Verify schema      | `scripts/postgres-init.sh` (new)                                                              | create `inji_verify` from `db_scripts/inji_verify/db.sql` + `ddl.sql`                                                                                                                                                                                               | the inji-verify compose sample uses `docker-compose/db-init/init.sql`, whose `vp_submission` lacks the `response_code*` columns that `VPSubmission` in verify-service 0.18.2 maps (code reading)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G10                | `compose.yaml`                                                                                | `OVP_QR_HEADER=INJI_OVP://payload=`                                                                                                                                                                                                                                 | the inji-verify compose sample writes `{OVP_QR_HEADER-INJI_OVP://payload=}` (no `$`), so the braces become the header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| cookie flag        | `compose.yaml`                                                                                | `INJI_VERIFY_COOKIE_SECURE_VALUE=false`                                                                                                                                                                                                                             | verify-service defaults to `Secure` cookies (`application.properties`), which browsers refuse over plain `http` on any host other than localhost (for example a LAN address when a phone takes part)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mimoto 0.22 config | `config/mimoto-default.properties`, `config/mimoto-issuers-config.json`                       | Inji Web URL and CORS origin on port 28004; token endpoint on 28099 and Certify as token endpoint; mDL issuer removed                                                                                                                                               | project port range; no eSignet; Mimoto 0.22.0 does not handle `mso_mdoc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G4                 | `config/seed/farmer-sd-jwt.credential-configuration.json` (new)                               | display with logo, background and text colour                                                                                                                                                                                                                       | Mimoto rejects the whole issuer when one configuration lacks them (trial run 2, `RESIDENT-APP-041`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| G5, G6             | `config/certify-ac.properties`, `sql-team/certify-ac.sql`, `config/seed-ac/` (new)            | certify-ac, a Certify in authorization code mode behind the test authorization server                                                                                                                                                                               | Inji Web needs the authorization code flow; see [certify-ac and Inji Web](#certify-ac-and-inji-web-holder-web-profile)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| holder-web issuers | `config/mimoto-issuers-config.json`, `config/mimoto-trusted-verifiers.json`                   | `FarmerAC`, `PlaygroundReference`; trusted verifiers `ps02-playground`, `ps02-playground-sdk`                                                                                                                                                                       | Inji Web downloads from certify-ac and the reference issuer and answers the playground's Inji Verify requests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| G9, G22            | `sql/certify_init.sql`                                                                        | `Ed25519` added to the key proof algorithms of `FarmerCredential` (the sample lists it for `FarmerSdJwt` only)                                                                                                                                                      | Mimoto 0.22.0 then binds the `ldp_vc` to the Ed25519 key it signs every `ldp_vp` with, and Inji Certify -> Inji Web -> Inji Verify is `VALID` (TC_PG_WEB_03, measured 2026-10-06); with the sample list the presentation is `INVALID` (G22)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| context cache      | `nginx/tls-front.conf.template`, `compose.yaml`, `scripts/stack-init.sh`, `scripts/stack.mjs` | the TLS front also answers for `www.w3.org`, `w3id.org` and `piyush7034.github.io` as a caching proxy (public DNS, one redirect followed, stale copy on HTTP 429); Certify trusts the test CA too; `stack:up` warms the cache with the 9 contexts the services load | GitHub Pages (behind `w3id.org` and the farmer sample context) answered HTTP 429 after a few dozen runs on 2026-10-06, and 5 to 7 of 20 live tests failed with `LOADING_REMOTE_CONTEXT_FAILED`; with the cache, 5 of 6 consecutive `npm run test:live` runs passed 20 of 20 and no context failed to load (the sixth had two 30 s step timeouts in certify-ac flows). Until 2026-10-19 a redirected document was cached under its GitHub Pages URL, so every `w3id.org` context still went to `w3id.org` for the redirect (2 to 4 s, measured); its timeouts failed 1 to 3 Inji Web ldp_vc live tests on a slow connection. It is now cached under the URL the service asked for (0.02 s) |
| G24                | `compose.yaml`                                                                                | `INJI_VP_SUBMISSION_BASE_URL` default `https://verify.ps02.test/v1/verify`                                                                                                                                                                                          | Mimoto refuses an `http` `response_uri`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Settings that are not file edits, all in `compose.yaml`: Postgres trust authentication on the internal network
(no team password); Mimoto's `oidckeystore.p12` client key created at first start by
[scripts/mimoto-start.sh](scripts/mimoto-start.sh) instead of a key from client onboarding; Inji Verify's own
DID `did:web:verify.ps02.test:v1:verify` (served through the TLS front).

## Known limits

- Inji Web cannot download from the core Certify: Mimoto 0.22.0 only runs the authorization code flow, and
  Certify in `preauth` mode is not an authorization-code server (gaps G5, G6). certify-ac fills that role.
- certify-ac and Mimoto reach the playground at `https://ref.ps02.test`, so the playground must run on 28100
  with `PLAYGROUND_PUBLIC_URL=https://ref.ps02.test` for holder-web runs.
- Admin APIs of Certify (`/credential-configurations`, `/pre-authorized-data`) need no authentication in the
  sample configuration (G11). Fine for a local playground; never expose these ports.
- `ref.ps02.test` points at `host.docker.internal:28100`, resolved by Docker Desktop's DNS. On Linux without
  Docker Desktop, set `PLAYGROUND_REF_UPSTREAM` to the host's bridge address, for example
  `http://172.17.0.1:28100`.
