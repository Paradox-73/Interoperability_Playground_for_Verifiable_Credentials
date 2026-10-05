# Demo

How to show the playground in about ten minutes, with the commands that prepare it. The cells are the ones
of [packages/cli/specs/demo.yaml](../../packages/cli/specs/demo.yaml), which `npm run demo` runs and checks
before anything is shown.

## Before recording

1. Docker Desktop (or Docker Engine with Compose 2.24 or newer) running, with at least 4 GB of memory; the
   stack with every profile used about 2.7 GiB (measured 2026-10-05).
2. Nothing else on ports 28000-28999; stop a development stack with `npm run stack:down`.
3. Check, start and run the demo cells:

   ```bash
   npm run demo -- --preflight   # Docker, Compose version, memory, free ports
   npm run demo                  # builds the playground image, starts the bundle, runs the cells, leaves it up
   ```

   It prints a table of the cells and `DEMO PASS` when every cell gave the verdict its spec expects.
   Measured on 2026-10-05 (Windows 11 laptop, images already pulled): bundle up in 73-90 s, the four cells
   in under 30 s, `DEMO PASS`.

4. Open <http://localhost:28100>. The history page already shows the four demo runs.
5. For the Inji Web part, run the holder-web cells against a host-mode server instead (the bundle's server
   uses `http://localhost:28100` as its public URL): see [set-up](../setup.md#local-inji-stack) and
   `npm run matrix:live -- --spec live-holder-web`.

Stop everything afterwards with `npm run down`.

## Script

| Time | Show                                                                                                                                        | Where                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 0:00 | What the playground is: pick an issuer, a wallet and a verifier; Inji modules and independent reference roles                               | Playground page                  |
| 0:45 | Reference issuer → reference wallet → reference verifier, SD-JWT VC: press Run, follow the timeline and the sequence diagram                | Playground page                  |
| 2:00 | Open a message in the protocol inspector: the credential request with its key proof, the decoded SD-JWT VC and its disclosures              | Inspector                        |
| 3:00 | Inji Certify → reference wallet → Inji Verify, SD-JWT VC: `VALID`, with Certify's pre-authorized offer and Inji Verify's request recorded   | Playground page                  |
| 4:15 | The same in `ldp_vc`: `INVALID`; the report names the failing check and gap G15 (with G9)                                                   | Run report                       |
| 5:15 | Tamper: flip the issuer signature (scenario "Bad issuer signature"); Inji Verify answers `INVALID`, as expected: verdict pass               | Run bar, scenario selector       |
| 6:15 | The Inji Verify web component as the verifier: its QR code, the reference wallet answering it, `VALID`                                      | Playground page                  |
| 7:15 | Matrix page: every cell run so far, with the not-supported cells and their reasons                                                          | Matrix                           |
| 8:00 | Gaps page: the interoperability gaps found, each with its evidence; two reported privately                                                  | Gaps                             |
| 8:45 | Inji Web through Mimoto: certify-ac → Inji Web → Inji Verify, Mimoto's own token and credential requests recorded; `INVALID` because of G22 | Live matrix report               |
| 9:30 | Headless: `npm run matrix:reference` and the live matrix reports                                                                            | Terminal, `docs/interop-report/` |

Talking points, all measured on 2026-10-05:

- The reference matrix: 82 of 82 cells as specified, without Docker
  ([matrix](../interop-report/reference/matrix.md)).
- Live: `live-core` 14 of 14 and `live-holder-web` 6 of 6 cells as specified
  ([live matrix](../interop-report/live/matrix.md)); the cells that fail are blocked by gaps the
  [gap register](../gaps/README.md) describes, each with an issue draft.
- Every HTTP message of every run is recorded; exports are redacted before they leave the server.

## Five-minute video

The submission asks for a 3-5 minute video of at least one full issue → hold → present → verify cycle
with the protocol inspector visible. This cut keeps that cycle on screen for the first half. Its runs are
the cells of `demo.yaml`, which `npm run demo` checked on 2026-10-06 (`DEMO PASS`); run it before
recording so the stack is warm.

| Time | Show                                                                                                                                                                                          | Where                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 0:00 | The problem in one sentence: Inji speaks OpenID4VCI and OpenID4VP, but does it work with code that is not Inji, and where does it break? The three columns answer it                          | Playground page          |
| 0:25 | Choose Inji Certify → reference wallet → Inji Verify, format SD-JWT VC, scenario happy path; press Run                                                                                        | Playground page          |
| 0:45 | Follow the timeline and the sequence diagram while the run streams in                                                                                                                         | Playground page          |
| 1:15 | Inspector, in order: credential offer, token response, credential request with its key proof, issued credential (decoded disclosures), presentation_definition, vp_token, verification result | Inspector                |
| 2:15 | Outcome `VALID`; open the run's report: issuer, wallet, verifier, format, proof type, outcome; download Markdown                                                                              | Run report               |
| 2:45 | Same roles, `ldp_vc`: `INVALID`; the report names the failing check and links gaps G15 and G9                                                                                                 | Run report, Gaps page    |
| 3:15 | Tamper: scenario "Bad issuer signature"; expected Invalid shown before the run, Inji Verify answers Invalid after it                                                                          | Run bar                  |
| 3:45 | Matrix page and history filters; then the live matrix report with Inji Web through Mimoto and the gaps it found (G22, G25)                                                                    | Matrix, History, `docs/` |
| 4:30 | Close: one command (`npm run up`), 82-cell reference matrix in CI, 23 public gap drafts for the Inji teams                                                                                    | Terminal, Gaps page      |

Record at 1280×720 or larger with the browser zoomed to 110 % so inspector text stays readable.

## Slide outline

For the pitch deck (problem, solution, technology stack, audience, impact), ten slides:

1. **Title:** Inji Interoperability Playground, team Badmosip, MOSIP Decode 2026 problem statement 02.
2. **Problem:** Inji modules claim OpenID4VCI, OpenID4VP, W3C VC and SD-JWT VC support; integrators have
   no way to see whether they interoperate with each other and with code outside MOSIP.
3. **Who it is for:** new integrators evaluating Inji, the Inji core teams (regression tracking), and
   national ID programmes comparing wallets and verifiers.
4. **Solution:** pick an issuer, a wallet and a verifier; run issue → hold → present → verify; inspect
   every HTTP message (screenshot `docs/ux/screenshots/2-timeline-and-inspector.png`).
5. **What runs:** Inji Certify (two modes), Inji Web through Mimoto, Inji Verify (API and the official
   web component), Inji Wallet mobile by QR, and independent reference issuer, wallet and verifier in two
   protocol profiles.
6. **Architecture:** diagram from [architecture.md](../architecture.md): server with recording at three
   capture points, local Inji stack in Docker Compose, TLS front for did:web.
7. **Evidence:** numbers from the [test report](../test-report/README.md): unit, browser and live test
   counts; reference matrix 82 of 82 cells as specified; live matrices; one-command bundle start time.
8. **Gaps found:** the [gap register](../gaps/README.md): 23 public gaps with issue drafts for Inji Certify,
   Inji Verify and Mimoto, two reported privately; pick three with the largest impact.
9. **Beyond the brief:** tamper scenarios with the specification text behind each expected outcome,
   playback of stored runs, headless matrix and nightly workflow, accessibility checks.
10. **Impact and next steps:** file the issue drafts, run the nightly matrix against Collab, add mso_mdoc
    when Certify's mock mDoc is available.
