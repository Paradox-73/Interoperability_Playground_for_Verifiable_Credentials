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
