# Test data

Every identity, key and credential the playground uses is test data: invented, or copied from the public
Inji Certify farmer sample. Nothing here identifies a real person, and no key here protects anything real.
The rules for keys and recorded data are in [SECURITY.md](../SECURITY.md).

## Identities

The test authorization server (`/ref/as`) logs in one fixed identity without a login page
(`packages/oid4vci/src/as/identity.ts`). It uses the `id` of the first row of the upstream Inji Certify
farmer sample (`deploy/inji-stack/config/farmer_identity_data.csv`, imported from inji-certify@e54539a),
because Certify's CSV data provider looks the holder up by the access token's `sub`.

| Claim                               | Value                                                      | Source                                                            |
| ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `sub`                               | `2154189532`                                               | first row of the Certify farmer sample                            |
| `name`, `given_name`, `family_name` | `Gorge Cooper`, `Gorge`, `Cooper`                          | the same row                                                      |
| `birthdate`, `gender`               | `1990-05-25`, `Male`                                       | the same row                                                      |
| `email`                             | `farmer-2154189532@playground.ps02.test`                   | invented; Mimoto's sign-in needs an `email`                       |
| `picture`, `phone_number`           | `https://playground.ps02.test/avatar.png`, `+919876543210` | invented; Mimoto fails a returning sign-in without them (gap G21) |

`.test` is a reserved top-level domain: these names never resolve on the internet.

The Inji Web wallet the `inji-web` role signs in to is created with the PIN `246810`.

## Keys and DIDs

| Key                                 | Where it lives                                                       | DID or use                                                               |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Reference issuer, Ed25519 and P-256 | `$PLAYGROUND_RUN_DIR/keys/`, created on first start                  | `did:key` by default (`PLAYGROUND_REF_ISSUER_DID`: `did:jwk`, `did:web`) |
| Reference verifier                  | `$PLAYGROUND_RUN_DIR/keys/`                                          | its client id (`did:key`) and request object signatures                  |
| Test authorization server, RS256    | `$PLAYGROUND_RUN_DIR/keys/ref-as-rs256.jwk.json`                     | access and ID tokens; JWKS at `/ref/as/jwks.json`                        |
| Holder keys of the reference wallet | generated per run                                                    | `did:jwk` (P-256 for Inji Certify, which refuses EdDSA proofs, G9)       |
| Inji Certify, certify-ac            | the containers' key volumes, created on first start                  | `did:web:certify.ps02.test`, `did:web:certify-ac.ps02.test`              |
| Mimoto's OIDC client key            | `$PLAYGROUND_RUN_DIR/stack/mimoto/oidckeystore.p12`, random password | `private_key_jwt` client `ps02-mimoto` at the test authorization server  |
| Test CA and TLS certificate         | `$PLAYGROUND_RUN_DIR/stack/ca/`, `stack/tls/`                        | HTTPS for `*.ps02.test` on the TLS front                                 |

The run directory (`run/` by default) is outside git. A server on an in-memory database
(`PLAYGROUND_DB=:memory:`, as in tests) generates its keys in memory instead, so its DIDs change on every
start.

## Credentials

The farmer credential, in every format:

| Issuer                   | Configuration                | Format      | Proof                                           | Type / `vct`                                 |
| ------------------------ | ---------------------------- | ----------- | ----------------------------------------------- | -------------------------------------------- |
| Reference issuer         | `FarmerCredential_ldp_vc`    | `ldp_vc`    | Ed25519Signature2020 (W3C VC 1.1)               | `FarmerCredential`                           |
| Reference issuer         | `FarmerCredential_ldp_vc_v2` | `ldp_vc`    | DataIntegrityProof eddsa-rdfc-2022 (W3C VC 2.0) | `FarmerCredential`                           |
| Reference issuer         | `FarmerCredential_vc_sd_jwt` | `vc+sd-jwt` | EdDSA                                           | `https://playground.ps02.test/vct/farmer/v1` |
| Reference issuer         | `FarmerCredential_dc_sd_jwt` | `dc+sd-jwt` | ES256                                           | `https://playground.ps02.test/vct/farmer/v1` |
| Reference issuer         | `FarmerCredential_mso_mdoc`  | `mso_mdoc`  | ES256 (MSO in COSE_Sign1, `x5chain`)            | docType `test.ps02.playground.farmer.1`      |
| Inji Certify, certify-ac | `FarmerCredential`           | `ldp_vc`    | Ed25519Signature2020                            | `FarmerCredential`                           |
| Inji Certify, certify-ac | `FarmerSdJwt`                | `vc+sd-jwt` | EdDSA                                           | `urn:ps02:playground:FarmerCredential`       |

Claims of the reference credentials (`packages/oid4vci/src/issuer/configurations.ts`), copied from the same
sample row so a reference credential and a Certify credential for one farmer can be compared:

| Claim             | Value        |
| ----------------- | ------------ |
| `farmerId`        | `2154189532` |
| `givenName`       | `Gorge`      |
| `familyName`      | `Cooper`     |
| `birthDate`       | `1990-05-25` |
| `state`           | `Karnataka`  |
| `landArea`        | `3 hectares` |
| `primaryCropType` | `Maize`      |

In the `mso_mdoc` credential the claims are elements of the namespace `test.ps02.playground.farmer.1`, all as
text. Its MSO is signed by the reference issuer's P-256 key as a document signer, with a test certificate
(`CN=Reference Issuer mdoc Document Signer`) issued by a test IACA root (`CN=Playground Test IACA`). Both
certificates are made in memory when the server starts, and the reference verifier trusts that root; neither is
saved. The reference verifier asks an mdoc for `farmerId`, `givenName`, `familyName` and `state` only, so
`birthDate`, `landArea` and `primaryCropType` stay undisclosed.

Inji Certify takes the claims of a pre-authorized offer from the `inji-certify` role (only the claims the
configuration advertises; Certify refuses others) and certify-ac takes them from the farmer CSV row of the
token's `sub`. The JSON-LD context of the reference credentials is served by the playground at
`/contexts/v1.jsonld` and pinned in `packages/formats`; Certify's farmer credential uses a context on a
personal GitHub Pages site (gap G18), which live runs fetch and cache in `$PLAYGROUND_RUN_DIR/contexts/`.

Scenarios derive their test credentials from these: an expired credential is issued with a validity
window in the past, a tampered one is changed after issuance, and so on
([scenarios](../packages/scenarios/README.md)).

## Recorded fixtures

`packages/protocol/fixtures/*.recorded.json` and `packages/server/test/contract/inji/fixtures/*.recorded.json`
are runs recorded from the reference roles and from the Inji stack, redacted with the export rules (tokens,
codes, cookies, CSRF tokens and private keys replaced by `[redacted sha256:...]`). Tests replay them, so
contract tests need no containers. Regenerate the Inji fixtures with
`packages/server/scripts/capture-inji-fixtures.ts` against a server connected to the stack.
