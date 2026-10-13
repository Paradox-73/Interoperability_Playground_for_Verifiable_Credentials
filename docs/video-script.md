# Video script

A shot-by-shot script for the demo video, 4 minutes 50 seconds. The problem statement asks for 3 to 5
minutes and the submission guidelines for 2 to 5. Each shot names what is on screen, the line to say, and the
rubric criterion and problem-statement task it proves. Task ids (M1 to M7 mandatory, G1 to G6 good-to-have,
B1 to B4 bonus) are the ones in the [README task table](../README.md#where-each-task-of-the-problem-statement-is-shown).
Rubric criteria: **F** Functionality (40 %), **Q** Quality of deliverable (40 %), **UX** User experience and
design (10 %), **P** Presentation (10 %).

Before recording, follow [manual-test-checklist.md](manual-test-checklist.md). It leaves the bundle running on
<http://localhost:28100> with the Inji stack warm, so no shot waits for Inji Certify's first slow call.

## Setup of the screen

- Chrome or Edge at 1280 by 720 or larger, browser zoom 110 %, light theme, one window with these tabs open
  in order: Playground (`/`), History (`/runs`), Matrix (`/matrix`), Gaps (`/gaps`).
- A terminal at the repository root with a large font. Run `npm run demo` once beforehand (the video shows its
  recorded output, shot 14).
- Record the screen and the microphone. Cut every wait of more than 3 seconds in editing, and keep the
  timestamps of the on-screen clock out of the frame.

## Shots

| #   | Time        | On screen                                                                                                                                                                                                     | Say                                                                                                                                                                                                                                                                                            | Proves                                                                               |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | 0:00 - 0:20 | Playground page, the three columns Issuer, Wallet, Verifier                                                                                                                                                   | "Inji Certify, Inji Web and Inji Verify each claim to speak OpenID4VCI, OpenID4VP and the W3C credential formats. This playground answers two questions. Do they work together, and do they work with software that is not Inji?"                                                              | P: problem and value; M2                                                             |
| 2   | 0:20 - 0:40 | Pick Inji Certify, Reference wallet, Inji Verify (API). Set format SD-JWT VC, scenario Happy path. Point at the cards: version, health, formats each role supports                                            | "Each column lists the Inji modules and my independent reference roles, with their versions and the formats they support. A card that cannot work with the other two says why."                                                                                                                | F: M2; UX: role cards with reasons                                                   |
| 3   | 0:40 - 1:15 | Press **Run**. The timeline fills row by row, the sequence diagram draws arrows                                                                                                                               | "Run. Inji Certify issues a credential over OpenID4VCI with a pre-authorized code. The wallet presents it over OpenID4VP. Inji Verify checks it. Every row is one protocol step, and every arrow in the diagram is one recorded HTTP message."                                                 | F: M3, M4, G3 (animated sequence diagram)                                            |
| 4   | 1:15 - 1:55 | Protocol inspector, in order: credential offer, token response, credential request with its key proof, issued credential (disclosures decoded), vp_token, verification result                                 | "The inspector shows the raw messages and decodes them. The offer, the token response, the key proof, the SD-JWT with its disclosures, the presentation, and Inji Verify's result."                                                                                                            | F: M3, M5 (offer, token exchange, credential, vp_token, result)                      |
| 5   | 1:55 - 2:15 | Run result `Valid`. Open **Report**: issuer, wallet, verifier, format, proof type, outcome, error detail                                                                                                      | "The result is Valid. The report names the issuer, wallet, verifier, format, proof type and outcome. It exports as Markdown or JSON."                                                                                                                                                          | F: M4, M6 (format labelled), M7                                                      |
| 6   | 2:15 - 2:35 | Same roles, format `ldp_vc`, press Run, show `Valid`. Then pick Inji Certify (authorization code), Inji Web (through Mimoto), Inji Verify, `ldp_vc` and show the finished run                                 | "Second format: a W3C credential with a JSON-LD proof, also Valid at Inji Verify. And here the wallet is Inji Web through Mimoto, so the whole path is Inji from issuance to verification. Valid."                                                                                             | F: M1, M6 (two formats), M3 with Inji Web                                            |
| 7   | 2:35 - 2:50 | Run settings: switch Presentation protocol between OpenID4VP drafts 21-23 and 1.0 against the reference verifier. Show `presentation_definition` in one run and `dcql_query` in the other                     | "Two OpenID4VP profiles. Inji speaks drafts 21 to 23 with Presentation Exchange. The final 1.0 specification uses DCQL. The playground runs both, so you see which one a verifier understands."                                                                                                | F: profile coverage, standards compliance (High complexity)                          |
| 8   | 2:50 - 3:05 | Scenario **Bad issuer signature**, Inji Certify to Inji Verify. The expected outcome shows before the run, the actual outcome after                                                                           | "Replay and tamper. I flip the issuer signature. The scenario says what a correct verifier must answer, here Invalid. Inji Verify answers Invalid, so the verdict is pass."                                                                                                                    | F: G4 (replay and tamper); Q: tests of negative paths                                |
| 9   | 3:05 - 3:30 | Reference verifier, SD-JWT VC. Run **Credential the holder issued itself**, then **Issuer's name kept, signed with the holder's own did:key**. Show `Invalid` and the issuer check in the verification result | "These two are forged issuers. A holder signs a credential with its own key, once under its own name and once borrowing Inji Certify's name. The verifier refuses both, because a key speaks only for its own identity and the issuer must be trusted."                                        | F: security of the reference verifier; Q: review findings fixed                      |
| 10  | 3:30 - 3:50 | Scenario **Revoked credential**. Show the sequence diagram's extra request for the status list, then the verification result with the `status` check failed `STATUS_REVOKED`                                  | "Revocation. The credential carries a status entry and the issuer has revoked it. The verifier fetches the status list, checks that the issuer signed it, and refuses the credential. The `status` check in the result says why."                                                              | F: credential status; Q: [screenshot 16](ux/screenshots/16-revoked-status-check.png) |
| 11  | 3:50 - 4:05 | Matrix page, then History page with a filter on format. Point at a `Not supported` cell and its reason                                                                                                        | "The matrix keeps the newest verdict for every combination of roles, format and profile. History keeps every run, filtered by format and outcome, for regression tracking across Inji releases."                                                                                               | F: G5, M7; UX: navigation and filters                                                |
| 12  | 4:05 - 4:20 | Gaps page: open G22 or G25 and its issue draft                                                                                                                                                                | "Where something fails, the playground records why. There are 29 findings, 27 with an issue draft ready for the Inji repositories. For example, Inji Web cannot present an SD-JWT credential."                                                                                                 | F: goal b of the problem statement, B2                                               |
| 13  | 4:20 - 4:30 | Browser wallet with the Reference verifier (Digital Credentials API), run page, press **Answer with the playground wallet**                                                                                   | "The same presentation also works on the same device, through the browser's Digital Credentials API, bound to the page's origin."                                                                                                                                                              | F: G6                                                                                |
| 14  | 4:30 - 4:50 | Terminal: the recorded `npm run demo` output ending in `DEMO PASS`, then `npm run matrix:reference` ending in `123 of 123 cells as specified`                                                                 | "One command starts the whole stack in Docker and runs five live cells, and the reference matrix runs 123 cells without Docker. 1203 unit tests, 12 browser tests and 20 live tests back it, and the Inji results are in the repository. Inji Wallet mobile is the one piece I could not run." | Q: tests, docs; B1, B4; honesty about limits; P: close                               |

## Rules for the narration

- Say only what the screen shows. The limits below are part of the video, not a footnote.
- Name the format and the verifier before every run, so each result is traceable to one report.
- Do not call hosted CI green. If asked: the last green hosted run was 2026-10-06, and the local commands
  replace it while the GitHub billing problem lasts.

## Limits to state in the video or the pitch

- Inji Wallet mobile was not run with a phone.
- The reference verifier does not check the status of an `mso_mdoc`, and revocation was not tested against
  Inji Verify.
- Server-side fetches are not protected against DNS rebinding.

## If a live run fails while recording

1. Stop the bundle with `npm run down` and start it again with `npm run up`. The first Inji Certify call after
   a start takes about a minute.
2. Run the failing cell headless to see its error: `npm run matrix:live -- --spec demo`.
3. Fall back to the stored runs. Every cell of the last matrix has a run file under
   [interop-report/live](interop-report/live/matrix.md), and the playback page replays a stored run event by
   event without sending anything.

## Slide outline

For the pitch deck (problem, solution, technology stack, audience, impact), ten slides.

1. **Title.** Inji Interoperability Playground, team Badmosip, MOSIP Decode 2026, problem statement 02.
2. **Problem.** Inji modules claim OpenID4VCI, OpenID4VP, W3C VC and SD-JWT VC support. Integrators cannot see
   whether they work with each other and with code outside MOSIP.
3. **Who it is for.** New integrators evaluating Inji, the Inji core teams (regression tracking), and national
   ID programmes comparing wallets and verifiers.
4. **Solution.** Pick an issuer, a wallet and a verifier, run issue → hold → present → verify, inspect every
   HTTP message ([screenshot](ux/screenshots/2-timeline-and-inspector.png)).
5. **What runs.** Inji Certify in two modes, Inji Web through Mimoto, Inji Verify (API and web component),
   Inji Wallet mobile by QR code (not run with a phone), and an independent reference issuer, wallet and
   verifier in two protocol profiles.
6. **Architecture.** The diagram in [architecture.md](architecture.md): the server with three capture points,
   the local Inji stack in Docker Compose, the TLS front for `did:web`.
7. **Evidence.** The [test report](test-report/README.md) and the [README numbers](../README.md#current-numbers):
   1203 unit tests, 123 reference cells, 16 and 10 live cells, five demo cells, 0 audit advisories.
8. **Gaps found.** The [gap register](gaps/README.md): 29 findings, 27 public with issue drafts for Inji
   Certify, Inji Verify and Mimoto, 2 reported privately. Pick the three with the largest impact.
9. **Beyond the brief.** Tamper scenarios with the specification text behind each expected outcome, forged-issuer
   and revocation checks, playback of stored runs, the headless matrix and nightly workflow, accessibility checks.
10. **Impact and next steps.** File the issue drafts, run the nightly matrix against the Collab sandbox, run
    Inji Wallet mobile with a phone, check mdoc status.
