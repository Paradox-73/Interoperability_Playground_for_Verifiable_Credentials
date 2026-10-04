# @inji-playground/scenarios

The scenarios a run can apply, each with the outcome a correct verifier must report and the specification text
that makes that outcome correct. Three categories:

- `happy`: a valid credential, presented unchanged.
- `tamper`: something is wrong with the credential or the presentation; a verifier must reject it (or, for
  `expired`, report it as expired).
- `probe`: a valid variant (another DID method, proof suite or format id) that a verifier should accept; a
  rejection shows an interoperability gap.

Expected outcomes follow the specifications, not what any implementation does. A cell whose actual outcome
differs from the expected one is a finding about the role under test.

## Catalogue

| Id                        | Category | Expected  | Formats                            | Roles needed                                                    | Specification                                                                                          |
| ------------------------- | -------- | --------- | ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `happy`                   | happy    | `VALID`   | any                                | any                                                             | -                                                                                                      |
| `expired`                 | tamper   | `EXPIRED` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | issuer `ref-issuer`                                             | VC Data Model 1.1 section 4.8; VC Data Model 2.0 section 4.9; RFC 9901 section 7.1 with RFC 7519 4.1.4 |
| `not-yet-valid`           | tamper   | `INVALID` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | issuer `ref-issuer`                                             | VC Data Model 1.1 section 4.6; VC Data Model 2.0 section 4.9; RFC 9901 section 7.1 with RFC 7519 4.1.5 |
| `wrong-type`              | tamper   | `INVALID` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | issuer `ref-issuer`, wallet `ref-wallet`                        | DIF Presentation Exchange 2.0 section 8; OpenID4VP 1.0 section 6 (DCQL `type_values`, `vct_values`)    |
| `bad-signature`           | tamper   | `INVALID` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | wallet `ref-wallet`                                             | VC Data Integrity 1.0 section 4.4; RFC 9901 section 7.1 step 2b                                        |
| `altered-disclosure`      | tamper   | `INVALID` | `vc+sd-jwt`, `dc+sd-jwt`           | wallet `ref-wallet`                                             | RFC 9901 section 7.1 step 3                                                                            |
| `unreferenced-disclosure` | tamper   | `INVALID` | `vc+sd-jwt`, `dc+sd-jwt`           | wallet `ref-wallet`                                             | RFC 9901 section 7.1 step 3                                                                            |
| `kb-wrong-nonce`          | tamper   | `INVALID` | `vc+sd-jwt`, `dc+sd-jwt`           | wallet `ref-wallet`                                             | RFC 9901 section 7.3 step 5f; OpenID4VP 1.0 Appendix B.3.6                                             |
| `kb-wrong-aud`            | tamper   | `INVALID` | `vc+sd-jwt`, `dc+sd-jwt`           | wallet `ref-wallet`                                             | RFC 9901 section 7.3 step 5f; OpenID4VP 1.0 Appendix B.3.6                                             |
| `vp-replay`               | tamper   | `INVALID` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | wallet `ref-wallet`                                             | OpenID4VP 1.0 section 14.1; Appendix B.1.3.2.5 and B.3.6                                               |
| `holder-mismatch`         | tamper   | `INVALID` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | wallet `ref-wallet`                                             | RFC 9901 section 7.3 step 5c; VC Data Model 1.1 section 5.8; OpenID4VP 1.0 Appendix B.1.3.2.5          |
| `forged-x5c`              | tamper   | `INVALID` | `vc+sd-jwt`, `dc+sd-jwt`           | wallet `ref-wallet`                                             | SD-JWT VC draft 19 section 2.5; RFC 7515 section 4.1.6 (gap G7)                                        |
| `issuer-did-key`          | probe    | `VALID`   | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | issuer `ref-issuer`                                             | did:key Method v0.7; DID Core 1.0 section 7.1                                                          |
| `issuer-did-jwk`          | probe    | `VALID`   | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` | issuer `ref-issuer`                                             | did:jwk method specification; DID Core 1.0 section 7.1                                                 |
| `vc2-eddsa-rdfc-2022`     | probe    | `VALID`   | `ldp_vc`                           | issuer `ref-issuer`                                             | VC Data Model 2.0; VC Data Integrity EdDSA Cryptosuites 1.0 section 3.3                                |
| `dc-sd-jwt`               | probe    | `VALID`   | `dc+sd-jwt`                        | any                                                             | SD-JWT VC draft 19 section 2.2.1; OpenID4VP 1.0 Appendix B.3                                           |
| `holder-did-canonical`    | probe    | `VALID`   | `ldp_vc`                           | issuer `inji-certify` or `inji-certify-ac`, wallet `ref-wallet` | did:jwk method specification (no padding; inji/inji-certify#1054)                                      |

`kb-wrong-nonce` and `kb-wrong-aud` are linked to inji/inji-verify#2059. The full text of each entry (title,
description, specification reference) is in [src/catalogue.ts](src/catalogue.ts) and is what
`GET /api/scenarios` serves.

## How a scenario is carried out

Each catalogue entry is a `ScenarioSpec` (the protocol shape, validated against `ScenarioSpecSchema` when the
module loads) plus instructions for the reference roles:

| Field                | Who acts on it   | What it does                                                                                  |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `issuer`             | reference issuer | validity window, type or `vct`, DID method, credential configuration, `x5c` (validly signed)  |
| `credentialTamper`   | reference wallet | changes the issued credential before it is presented (flip a signature byte, forge an `x5c`)  |
| `presentationTamper` | reference wallet | changes the encoded `vp_token` just before it is posted (disclosures, KB-JWT, replay, holder) |
| `wallet`             | reference wallet | holder DID form; present a credential the request did not ask for                             |

The tamper functions themselves are in `@inji-playground/formats/tamper`.

## API

| Export                                                                 | Use                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `listScenarios()`, `findScenario(id)`, `happy`                         | the `ScenarioSpec` view the API serves                                                  |
| `scenarioCatalog`, `findScenarioDefinition(id)`                        | the full definitions the roles act on                                                   |
| `scenarioHooks(definition)`                                            | orchestrator hooks (`beforeIssuance`, `beforeRequest`); pass to the server's `hooksFor` |
| `issuanceOptionsFor()`, `configurationIdFor()`, `issuerDidMethodFor()` | reference issuer input                                                                  |
| `walletClientOptions()`, `respondWithScenario()`                       | reference wallet behaviour                                                              |
| `tamperCredential()`, `tamperPresentation()`, `mapPresentations()`     | apply a tamper to a credential or an encoded `vp_token`                                 |
| `scenarioApplies(definition, cell)`                                    | whether a scenario can run on a cell, with the reasons when it cannot ("not supported") |

## Tests

```bash
npm test -w @inji-playground/scenarios
```

- `test/catalogue.test.ts`: ids, schema validation, expected outcomes, `requires`, hooks, issuer and wallet
  options, `vp_token` encodings.
- `test/reference-matrix.test.ts`: applies every scenario to the reference issuer, wallet and verifier for every
  applicable format and both OpenID4VP profiles (`inji-draft`, `final-1.0`) and checks the expected outcome.
