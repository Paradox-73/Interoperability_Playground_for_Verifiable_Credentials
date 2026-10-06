# Interoperability gaps

What the playground found when Inji modules met each other and the independent reference roles: places
where an Inji module does not follow a specification, cannot work with another Inji module, or needs a
change to its sample configuration. Each gap was found with a playground run and is tied to the matrix
cells it decides, so a fixed gap shows up as a cell whose verdict changes.

- Register (machine-readable, served at `GET /api/gaps` and on the Gaps page):
  [gaps.json](gaps.json): id, title, repository, version, severity, status, summary, matrix cells,
  evidence date.
- One issue draft per public gap, ready to file: [issues/](issues/), named `NN-<repository>-<slug>.md`,
  each with repository, version, the playground case that shows it, steps, expected and actual result
  and the date. `npm run docs:check` checks that every public gap has a complete draft.
- How the matrix cells use them: [live matrix](../interop-report/live/matrix.md); a cell blocked by a
  gap expects `verdict: fail` in its spec and names the gap.

The Inji repositories moved from `github.com/mosip/*` to `github.com/inji/*`; the links use the new names.

## Gaps

| Id  | Repository        | Version                                   | Severity | Status                        | Gap                                                                                                                                 | Evidence            | Draft                                                                     |
| --- | ----------------- | ----------------------------------------- | -------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| G1  | inji/inji-certify | 0.14.0 (sample docker-compose config)     | medium   | fixed in the playground stack | Pre-authorized issuance fails: credentialOfferCache missing from the sample cache names                                             | measured 2026-10-04 | [draft](issues/01-inji-certify-credential-offer-cache.md)                 |
| G2  | inji/inji-verify  | 0.18.2 (vc-verifier)                      | low      | known upstream                | Inji Verify resolves did:web only over https://                                                                                     | measured 2026-10-04 | [draft](issues/02-inji-verify-did-web-https-only.md)                      |
| G3  | inji/inji-certify | 0.14.0 (sample nginx.conf)                | low      | fixed in the playground stack | Authorization server metadata at the host root is not routed by the sample nginx                                                    | measured 2026-10-04 | [draft](issues/03-inji-certify-sample-nginx-as-metadata.md)               |
| G4  | inji/mimoto       | 0.22.0                                    | low      | new                           | Mimoto requires display logo, background_color and text_color on every credential configuration                                     | measured 2026-10-04 | [draft](issues/04-mimoto-display-fields-required.md)                      |
| G5  | inji/mimoto       | 0.22.0                                    | medium   | known upstream                | Mimoto and Inji Web cannot take a credential offer (no pre-authorized code flow)                                                    | code reading        | [draft](issues/05-mimoto-no-credential-offer.md)                          |
| G6  | inji/inji-certify | 0.14.0                                    | medium   | new                           | Inji Certify authorization-server metadata has no authorization_endpoint in the pre-authorized profile                              | measured 2026-10-04 | [draft](issues/06-inji-certify-preauth-without-authorization-endpoint.md) |
| G7  | inji/inji-verify  | -                                         | high     | reported privately            | Reported privately                                                                                                                  | -                   | -                                                                         |
| G8  | inji/inji-certify | 0.14.0                                    | low      | new                           | Inji Certify SD-JWT output: vc+sd-jwt typ, holder key as cnf.kid, no iat/exp unless templated                                       | measured 2026-10-04 | [draft](issues/08-inji-certify-sd-jwt-vc-shape.md)                        |
| G9  | inji/inji-certify | 0.14.0 (sample config)                    | medium   | fixed in the playground stack | Inji Certify accepts an Ed25519 holder proof only under the name Ed25519, and the sample lists it only for FarmerSdJwt              | measured 2026-10-06 | [draft](issues/09-inji-certify-eddsa-holder-proof.md)                     |
| G10 | inji/inji-verify  | 0.18.2 (docker-compose)                   | low      | fixed in the playground stack | Inji Verify compose: OVP_QR_HEADER value missing its $                                                                              | measured 2026-10-04 | [draft](issues/10-inji-verify-compose-ovp-qr-header.md)                   |
| G11 | inji/inji-certify | 0.14.0 (sample config)                    | medium   | new                           | Inji Certify sample: credential-configuration and pre-authorized-data APIs are unauthenticated                                      | measured 2026-10-04 | [draft](issues/11-inji-certify-sample-admin-apis-open.md)                 |
| G12 | inji/inji-certify | 0.14.0 (FarmerCredential sample template) | low      | new                           | Inji Certify ldp_vc keeps unfilled template placeholders such as ${primaryCropType}                                                 | measured 2026-10-05 | [draft](issues/12-inji-certify-template-placeholders-issued.md)           |
| G13 | inji/inji-certify | 0.14.0                                    | medium   | new                           | Inji Certify writes the holder's key id (did:jwk:...#0) as credentialSubject.id                                                     | measured 2026-10-05 | [draft](issues/13-inji-certify-subject-id-is-key-id.md)                   |
| G14 | inji/inji-certify | 0.14.0                                    | high     | new                           | Inji Certify did:web document lists the DID, not its key, under assertionMethod                                                     | measured 2026-10-05 | [draft](issues/14-inji-certify-did-document-assertion-method.md)          |
| G15 | inji/inji-verify  | 0.18.2                                    | medium   | new                           | Inji Verify rejects an ldp_vp with an ecdsa-rdfc-2019 holder proof                                                                  | measured 2026-10-06 | [draft](issues/15-inji-verify-ecdsa-holder-proof-rejected.md)             |
| G16 | inji/inji-verify  | 0.18.2                                    | medium   | new                           | Inji Verify verifies SD-JWT VCs only when the issuer key comes in an x5c header                                                     | measured 2026-10-05 | [draft](issues/16-inji-verify-sd-jwt-x5c-only.md)                         |
| G17 | inji/inji-verify  | 0.18.2                                    | medium   | new                           | Inji Verify drops Presentation Exchange filter keywords it does not model                                                           | measured 2026-10-05 | [draft](issues/17-inji-verify-filter-keywords-dropped.md)                 |
| G18 | inji/inji-certify | 0.14.0 (FarmerCredential sample)          | low      | new                           | Inji Certify farmer sample depends on a JSON-LD context on a personal GitHub Pages site                                             | measured 2026-10-05 | [draft](issues/18-inji-certify-context-on-personal-site.md)               |
| G19 | inji/inji-verify  | 0.18.2                                    | low      | new                           | Inji Verify answers HTTP 500 instead of a result for a presentation it cannot parse                                                 | measured 2026-10-05 | [draft](issues/19-inji-verify-http-500-for-unparsable-vp.md)              |
| G20 | inji/inji-verify  | -                                         | high     | reported privately            | Reported privately                                                                                                                  | -                   | -                                                                         |
| G21 | inji/mimoto       | 0.22.0                                    | medium   | new                           | Mimoto fails every later sign-in of a user whose first ID token lacked picture or phone_number                                      | measured 2026-10-05 | [draft](issues/21-mimoto-sign-in-npe-optional-claims.md)                  |
| G22 | inji/mimoto       | 0.22.0                                    | high     | fixed in the playground stack | Inji Web signs every ldp_vp with its Ed25519 key, whatever key the credential is bound to                                           | measured 2026-10-06 | [draft](issues/22-mimoto-ldp-vp-signed-with-other-key.md)                 |
| G23 | inji/mimoto       | 0.22.0 (inji-openid4vp library)           | medium   | new                           | Mimoto refuses Presentation Exchange field filters without a pattern                                                                | measured 2026-10-05 | [draft](issues/23-mimoto-filter-pattern-required.md)                      |
| G24 | inji/mimoto       | 0.22.0                                    | low      | new                           | Inji Web refuses an http response_uri, while the Inji Verify sample configuration hands one out                                     | measured 2026-10-05 | [draft](issues/24-mimoto-http-response-uri-refused.md)                    |
| G25 | inji/mimoto       | 0.22.0                                    | medium   | new                           | Inji Web cannot present SD-JWT VCs                                                                                                  | measured 2026-10-05 | [draft](issues/25-mimoto-no-sd-jwt-presentation.md)                       |
| G26 | inji/inji-certify | 0.14.0                                    | medium   | new                           | Inji Certify cannot fill an mso_mdoc in the pre-authorized profile: claims are checked per namespace, the template reads flat names | measured 2026-10-06 | [draft](issues/26-inji-certify-mdoc-preauth-placeholders.md)              |
| G27 | inji/inji-certify | 0.14.0                                    | medium   | new                           | Inji Certify mso_mdoc departs from ISO/IEC 18013-5: MSO not wrapped in tag 24, validity dates as text, no signed date               | measured 2026-10-06 | [draft](issues/27-inji-certify-mdoc-iso-structure.md)                     |
| G28 | inji/inji-verify  | 0.18.2                                    | medium   | new                           | Inji Verify accepts an mso_mdoc presentation request but refuses every DeviceResponse with INVALID_VP_TOKEN                         | measured 2026-10-06 | [draft](issues/28-inji-verify-mdoc-presentation-refused.md)               |
| G29 | inji/mimoto       | 0.22.0                                    | low      | new                           | Mimoto refuses to download an mso_mdoc: Unsupported credential format                                                               | measured 2026-10-06 | [draft](issues/29-mimoto-mdoc-download-unsupported.md)                    |

Public gaps by repository: inji/inji-certify 12, inji/inji-verify 7, inji/mimoto 8.

## What decides the live matrix

- All-Inji SD-JWT VC works: Inji Certify → playground wallet → Inji Verify is `VALID` (TC_PG_LIVE_01), also
  from certify-ac (TC_PG_WEB_01).
- All-Inji `ldp_vc` works since 2026-10-06: Inji Certify → Inji Web (Mimoto) → Inji Verify is `VALID`
  (TC_PG_WEB_03), and Inji Certify → reference wallet → Inji Verify too (TC_PG_LIVE_02, TC_PG_WEB_02). Two
  changes made it: the stack lists the RFC 9864 name `Ed25519` for `FarmerCredential` key proofs (G9), and the
  reference issuer lists it too, so Mimoto binds the credential to the Ed25519 key it signs every `ldp_vp`
  with (G22). The probe `holder-proof-es256` keeps G22 and G15 visible with an issuer that takes only ES256
  (TC_PG_WEB_07, TC_PG_WEB_08).
- An independent Data Integrity verifier rejects every Certify `ldp_vc` because of its DID document (G14).
- Inji Web cannot take an offer (G5) and cannot reach the pre-authorized Certify (G6); with certify-ac it
  downloads, but cannot present SD-JWT VCs (G25) and refuses specification-conformant requests (G23).
- Inji Verify accepts SD-JWT VCs only with an `x5c` issuer key (G16) and changes the filters of the
  requests it stores (G17).
- mso_mdoc (2026-10-06): Inji Certify issues it (FarmerMdoc, added by the stack's seed) with a correct issuer
  signature and device key, but outside the ISO/IEC 18013-5 structure (G27), and unfilled in the pre-authorized
  profile (G26); Inji Verify cannot verify an mdoc presentation (G28) and Mimoto cannot download one (G29). The
  reference issuer, wallet and verifier run mso_mdoc end to end (reference matrix, TC_PG_MDOC_*).

## Other observations

Seen while building the stack and the UI, worked around, and not tied to a matrix cell, so they are not in
the register and have no draft yet. Each needs a playground case before it is filed.

| Repository                 | Observation                                                                                                                                                | How the playground deals with it                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| inji/inji-verify (compose) | The compose sample's `init.sql` does not match the 0.18.x schema (`vp_submission` lacks the `response_code*` columns), so status and submission answer 500 | The database is created from `db_scripts/inji_verify/` instead (commit `d4b9a35`)     |
| inji/inji-verify           | verify-service answers no CORS headers, so a web page on another origin cannot call it                                                                     | The UI calls `/v1/verify` on its own origin through the playground's proxy            |
| inji/inji-verify (SDK)     | The npm `latest` tag of `@injistack/react-inji-verify-sdk` is a 1.0 pre-release that calls endpoints verify-service 0.18.2 lacks                           | The SDK is pinned at 0.18.1 ([ADR 0007](../adr/0007-react-18-for-inji-verify-sdk.md)) |
| inji/inji-verify (SDK)     | The SDK's TypeScript type for the presentation definition allows only `ldp_vc`                                                                             | The SD-JWT definition is cast                                                         |
| inji/inji-verify (SDK)     | The QR upload component rejects files under 10 KB                                                                                                          | Not used by the playground's flows                                                    |

## Reported privately

Two findings may weaken credential verification. They are recorded in the register only as "Reported
privately", with no details, no cells and no draft in this repository, and their probe results are kept
out of the published matrices. The team reports them to the Inji maintainers privately, not as public
issues ([SECURITY.md](../../SECURITY.md) describes how the team handles such findings).
