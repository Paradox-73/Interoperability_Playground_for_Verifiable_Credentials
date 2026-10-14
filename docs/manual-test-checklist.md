# Manual test checklist

The checks that only a person can do: a fresh clone on macOS, Linux and Windows, the browser UI by eye and
by keyboard, Inji Wallet on a phone, and a dry run of the demo video. The automated tests cover the rest
([README, Current numbers](../README.md#current-numbers)).

Every step has a stable id, such as `CL-03` or `UI-07`. Record each result in a copy of
[manual-test-results-template.md](manual-test-results-template.md), which lists the same ids. Stop a section
at the first step that does not match its expected result, and note the id, the command and the output.
[Troubleshooting in docs/setup.md](setup.md#troubleshooting) lists the known causes.

| Section                                             | Ids                  | Time                                                    |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| [Fresh clone and start](#fresh-clone-and-start)     | `CL-01` to `CL-07`   | 10 minutes with a fast network, longer on Apple silicon |
| [Browser UI walk-through](#browser-ui-walk-through) | `UI-01` to `UI-21`   | 30 minutes                                              |
| [Video recording dry run](#video-recording-dry-run) | `VID-01` to `VID-20` | 20 minutes                                              |
| [Developer checks](#developer-checks)               | `DEV-01` to `DEV-14` | 25 minutes                                              |
| [Inji Wallet on a phone](#inji-wallet-on-a-phone)   | `PH-01` to `PH-06`   | 30 minutes                                              |

Run the sections in this order. `UI` and `VID` use the bundle that `CL-06` leaves running. `DEV` needs the
bundle stopped.

## Before you start

| Need                                       | macOS                            | Linux                                 | Windows 11                                          |
| ------------------------------------------ | -------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Shell for the commands below               | Terminal, zsh or bash            | any shell                             | Git Bash (not cmd.exe or PowerShell)                |
| Node.js 24.21 or newer, npm 11.19 or newer | `node -v`, `npm -v`              | the same                              | the same                                            |
| Docker with Compose 2.24 or newer          | Docker Desktop, 6 to 8 GB memory | Docker Engine with the Compose plugin | Docker Desktop (Linux containers), 6 to 8 GB memory |
| Git                                        | preinstalled                     | `git --version`                       | Git for Windows                                     |
| Free ports                                 | 28000 to 28999                   | 28000 to 28999                        | 28000 to 28999                                      |
| Browser                                    | Chrome or Edge                   | Chrome or Chromium                    | Chrome or Edge                                      |

Docker memory: give Docker Desktop 6 to 8 GB (Settings, Resources, Memory). On 2026-10-14 the stack used about
2.9 GiB idle with every profile running, and image builds and the first Inji calls need more on top. A Docker
VM with 4 GB is not enough to be sure Mimoto starts. On Linux, Docker Engine uses the host memory directly, so
keep 6 GB of it free.

Platform notes:

- macOS on Apple silicon (M1 and later): the Inji images are built for amd64, so Docker runs them under
  emulation. Everything is slower. A Mac with a 4 GB Docker VM took 969 s for `npm run stack:up` on
  2026-10-13. In Docker Desktop, turn on Rosetta for x86 emulation if your version offers it.
- Linux: your user must run `docker ps` without `sudo`. If the reference server is not reachable from the
  containers as `ref.ps02.test`, set `PLAYGROUND_REF_UPSTREAM` to the host bridge address. See the
  troubleshooting table.
- Windows: if Git Bash rewrites a path in a `docker` command you type by hand, prefix it with
  `MSYS_NO_PATHCONV=1`. The npm commands do this already.
- Stop other Docker projects that use the ports above. Containers that do not start with `ps02-` are not
  touched by any command here.

## Fresh clone and start

Run these on each operating system you test, in a new folder. The commands are the same on macOS, Linux and
Windows (Git Bash). The repository is private until the submission, so you need read access to it and a
signed-in Git (for example `gh auth login`).

1. **`CL-01` Check the tools.** Run `node -v`, `npm -v`, `docker version`, `docker compose version` and
   `git --version`. Expected: the versions in the table above, and `docker version` prints a `Server:` part
   (Docker is running).
2. **`CL-02` Check Docker memory.** Run `docker info --format '{{.MemTotal}}'`. Expected: about
   6000000000 (6 GB) or more. Time: 5 s.
3. **`CL-03` Get the code.** Run:

   ```bash
   git clone https://github.com/Paradox-73/Interoperability_Playground_for_Verifiable_Credentials.git inji-interop-playground
   cd inji-interop-playground
   git log --oneline -1
   ```

   Expected: the newest commit is the one you were told to test. Time: 30 s.

4. **`CL-04` Install.** Run `npm ci`. Expected: it ends with `found 0 vulnerabilities` and no `npm ERR!`.
   Warnings that `esbuild` and `cbor-extract` install scripts are not allowed are harmless. Time: 45 s.
5. **`CL-05` Preflight.** Run `npm run demo -- --preflight`. Expected: `[demo] Docker memory ... GiB`,
   `[demo] ports free: ...` with all eight ports, and the last line `[demo] preflight passed`. Time: 5 s.
6. **`CL-06` One-command demo.** Run `npm run demo`. Expected: a table of five cells, all `pass`, then
   `DEMO PASS`, and the line `[demo] the bundle stays up: open http://localhost:28100; stop it with npm run down`.
   Time: about 6 to 7 minutes from a clean checkout on Windows (image pulls and build, 90 to 180 s for the
   bundle to start, 30 s for the cells). On Apple silicon it can take three times as long. Leave the bundle
   running for the `UI` and `VID` sections.
7. **`CL-07` Stop the bundle.** After the `UI` and `VID` sections, run `npm run down`, then `docker ps`.
   Expected: no container whose name starts with `ps02-`. Time: 15 s.

## Browser UI walk-through

Open <http://localhost:28100> in Chrome or Edge with the bundle from `CL-06` running. Button, link and field
names below are the exact labels on screen. The first Inji Certify call after the bundle starts can take about
a minute. Later runs take seconds.

1. **`UI-01` Playground page.** Open `/`. Expected: the header shows the app name, the navigation Playground,
   History, Matrix, Gaps and About, and the mode `Live`. Three columns Issuer, Wallet and Verifier show one card
   per role. The text under the heading reads `Healthy Inji modules were selected in every column.` and an Inji
   module is selected in each column. If it reads `The Inji modules are not all healthy, ...` instead, note
   which card shows a health problem.
2. **`UI-02` Role cards.** Read the cards. Expected: each card says whether it is an Inji module, a reference
   role or an external wallet, and shows its version, health and supported formats. The issuer column has
   `Inji Certify`, `Inji Certify (authorization code)` and `Reference issuer`. The wallet column has
   `Inji Web (through Mimoto)`, `Reference wallet (headless)`, `Browser wallet (Digital Credentials API)` and
   `Phone wallet (Inji Wallet or any OpenID4VC app)`. The verifier column has `Inji Verify (API)`,
   `Inji Verify (web component)`, `Reference verifier` and `Reference verifier (Digital Credentials API)`.
3. **`UI-03` Incompatible cards.** Select `Inji Certify` and `Inji Web (through Mimoto)`. Expected: a card that
   cannot work with the other two selections stays visible and says why. **Run** is disabled, and the run bar
   gives the reason.
4. **`UI-04` Scenario picker.** Select `Inji Certify`, `Reference wallet (headless)` and `Inji Verify (API)`.
   Set **Credential format** to SD-JWT VC (`vc+sd-jwt`). Open **Scenario**. Expected: only formats and
   protocol versions that all three roles support are offered. Choosing a scenario shows, before the run, the
   outcome a correct verifier must give and the specification text behind it. Set **Scenario** back to Happy
   path.
5. **`UI-05` Run with Inji.** Press **Run**. Expected: the timeline fills row by row, and the run result shows
   `Pass` and `Valid`.
6. **`UI-06` Timeline.** Read the timeline rows. Expected: each row has the plain-language label first and the
   protocol term second, a status as an icon and a word, a duration, and a specification section link that
   opens in a new tab.
7. **`UI-07` Sequence diagram.** Look at the diagram under the timeline, then select one arrow. Expected: one
   arrow per recorded HTTP message, and selecting an arrow opens that message in the inspector.
8. **`UI-08` Protocol inspector.** In **Protocol inspector**, open in turn the credential offer, the token
   response, the credential request, the issued credential, the `vp_token`, the presentation request with its
   `presentation_definition`, and the verification result. Switch between **Raw** and **Decoded**. Expected:
   every message shows its request and response, the SD-JWT disclosures are decoded, and the note
   `Tokens, codes, cookies and keys in this message were replaced by placeholders.` shows where values were
   hidden.
9. **`UI-09` Second format.** Set **Credential format** to `ldp_vc` and press **Run**. Expected: `Pass` and
   `Valid`. The run bar names the format.
10. **`UI-10` All-Inji path.** Select `Inji Certify (authorization code)`, `Inji Web (through Mimoto)` and
    `Inji Verify (API)`, format `ldp_vc`, and press **Run**. Expected: `Pass` and `Valid`. The timeline shows
    an authorization code flow, with no credential offer.
11. **`UI-11` Report page.** Select **Open this run on its own page**, then **Interoperability report of this
    run**. Expected: the heading `Interoperability report of run <id>`, with issuer, wallet, verifier, format,
    proof type, outcome, expected and actual outcome, and the steps with timings. **Download Markdown**,
    **Download JSON** and **Download redacted export** each save a file.
12. **`UI-12` Tamper replay.** On the report page, under **Replay with tamper**, set **Tamper scenario** to
    `Bad issuer signature` and press **Replay with this scenario**. Expected: a new run starts. When it ends,
    the run bar shows the expected outcome `Invalid` next to the verifier's actual answer, with a sentence that
    explains the result.
13. **`UI-13` Revoked credential.** On the Playground page select `Reference issuer`,
    `Reference wallet (headless)` and `Reference verifier`, format `vc+sd-jwt`, scenario `Revoked credential`,
    and press **Run**. Expected: outcome `Invalid`. The sequence diagram shows an extra request for the status
    list, and the verification result in the inspector has a `status` check that fails with `STATUS_REVOKED`.
14. **`UI-14` History and filters.** Open **History**. Expected: the heading `Run history`, the metric tiles,
    and every run you started, newest first. Set **Credential format**, then **Verifier outcome**, then
    **Module version** to `0.18.2`. Expected: the list shrinks to matching runs and the page address changes
    with each filter. Reload the page: the filters stay. Press **Clear filters**: every run shows again.
15. **`UI-15` Matrix.** Open **Matrix**. Expected: the heading `Compatibility matrix`. Each cell shows a
    verdict as an icon and a word and links to the report of its newest run. A combination that cannot run
    says why. **Hide combinations that cannot run** hides those.
16. **`UI-16` Playback.** Open a finished run's page and select **Play back this run step by step**. Expected:
    the heading `Playback of run <id> ...` and the notice that it is a recording and nothing is sent again.
    **Play**, **Pause**, **Step forward**, **Step back**, **Restart** and **Speed** work. After **Go to end**,
    **Step forward** is disabled.
17. **`UI-17` Inji Verify web component.** Select `Inji Certify`, `Reference wallet (headless)` and
    `Inji Verify (web component)`, format `vc+sd-jwt`, and press **Run**. Expected: the Inji Verify panel
    shows the component's own QR code, then the run result shows `Pass` and `Valid`. Time: up to 2.5 minutes.
18. **`UI-18` Digital Credentials API.** Select `Reference issuer`, `Browser wallet (Digital Credentials API)`
    and `Reference verifier (Digital Credentials API)`, format `vc+sd-jwt`, **Presentation protocol**
    `OpenID4VP 1.0 (DCQL)`, and press **Run**. Expected: the dialog `Present through the browser's Digital Credentials API`.
    Press **Answer with the playground wallet**. Expected: the dialog closes and the run passes.
19. **`UI-19` Keyboard only.** Reload `/` and put the mouse away. Press Tab once. Expected: a
    `Skip to main content` link. Tab to **Run** and press Enter, Tab to **Open this run on its own page** and
    press Enter, Tab to **Interoperability report of this run** and press Enter. Expected: the report opens, the
    focus outline is visible at every step, and you never get stuck. In the inspector, Tab reaches a message
    body and the arrow keys scroll it.
20. **`UI-20` Other pages and the console.** Open **Gaps**, **About** and `/no-such-page`, with the browser
    console open (F12). Expected: the headings `Interoperability gaps`, `About the playground` and
    `Page not found`. The console shows no red error other than one `Content Security Policy` line about
    `eval` (the schema library's feature test, harmless). Optional: in the browser's device toolbar at 390 by
    844, no page scrolls sideways.
21. **`UI-21` Inji Web's own pages.** Close Chrome, then start it from a terminal with
    `--host-resolver-rules="MAP ref.ps02.test:443 127.0.0.1:28443" --ignore-certificate-errors --user-data-dir=<empty folder>`
    (the test authorization server and certify-ac sit behind the stack's TLS front with a test certificate).
    Open <http://localhost:28004>, press **Continue With Google**, and set the passcode `246810`. Press
    **Inji Certify AC (playground)**, then **Farmer Verifiable Credential**. Expected: you are back on
    **Stored Cards** with a **Farmer Verifiable Credential** card, with no Google page in between. Screenshot
    `UI-21-inji-web-stored-cards.png`. The live test `inji-web-ui.spec.ts` does the same and also shares the
    card with Inji Verify.

## Video recording dry run

Walk [video-script.md](video-script.md) shot by shot against the running bundle, with a stopwatch and without
recording. The video must be 3 to 5 minutes long and show the protocol inspector. The script ends at 4:50.
Note each wait over 3 seconds, because it is cut in editing.

1. **`VID-01` Screen set-up.** Set up the screen as the script's "Setup of the screen" says: Chrome or Edge at
   1280 by 720 or larger, zoom 110 %, light theme, tabs Playground, History, Matrix and Gaps. Expected: every
   tab loads and the inspector text is readable at that size.
2. **`VID-02` Warm-up.** Run one Inji Certify to Inji Verify run before you start the stopwatch. Expected:
   `Pass`. Later Inji Certify runs then take seconds, not a minute.
3. **`VID-03` to `VID-16` One step per shot.** Do each shot from the script's "Shots" table, reading the "Say"
   text aloud. Expected for each: the screen shows what "On screen" names, every run ends with the result the
   script names, and the shot fits its time slot after waits are cut.

   | Id       | Shot | Slot        | Check                                                                  |
   | -------- | ---- | ----------- | ---------------------------------------------------------------------- |
   | `VID-03` | 1    | 0:00 - 0:20 | Playground page with the three columns                                 |
   | `VID-04` | 2    | 0:20 - 0:40 | Cards show version, health and formats                                 |
   | `VID-05` | 3    | 0:40 - 1:15 | Timeline fills, diagram draws arrows                                   |
   | `VID-06` | 4    | 1:15 - 1:55 | Inspector visible: offer, token, proof, credential, `vp_token`, result |
   | `VID-07` | 5    | 1:55 - 2:15 | `Valid`, report fields visible                                         |
   | `VID-08` | 6    | 2:15 - 2:35 | `ldp_vc` `Valid`, then the all-Inji Inji Web run `Valid`               |
   | `VID-09` | 7    | 2:35 - 2:50 | `presentation_definition` in one run, `dcql_query` in the other        |
   | `VID-10` | 8    | 2:50 - 3:05 | `Bad issuer signature`: expected and actual `Invalid`                  |
   | `VID-11` | 9    | 3:05 - 3:30 | Both forged-issuer scenarios `Invalid`, issuer check visible           |
   | `VID-12` | 10   | 3:30 - 3:50 | `Revoked credential`: status list request, `STATUS_REVOKED`            |
   | `VID-13` | 11   | 3:50 - 4:05 | Matrix, then History filtered by format                                |
   | `VID-14` | 12   | 4:05 - 4:20 | Gaps page with one gap and its issue draft                             |
   | `VID-15` | 13   | 4:20 - 4:30 | Digital Credentials API run passes                                     |
   | `VID-16` | 14   | 4:30 - 4:50 | Terminal output ending in `DEMO PASS` and the reference matrix line    |

4. **`VID-17` Total length.** Add up the shot times after cuts. Expected: between 3:00 and 5:00.
5. **`VID-18` Inspector on screen.** Expected: the protocol inspector is visible and readable in shots 4, 9 and
   10 at least (problem statement: "inspector visible").
6. **`VID-19` Test recording.** Record 20 seconds of shot 4 with the microphone and play it back. Expected:
   the payload text is readable and the voice is clear.
7. **`VID-20` Fallback.** Read "If a live run fails while recording" in the script. Expected: you know how to
   restart the bundle and how to fall back to playback of a stored run.

## Developer checks

The deeper checks a contributor runs. They need the bundle stopped (`CL-07`) and take about 25 minutes. Where a
step expects a count, the current counts are in [README, Current numbers](../README.md#current-numbers).

1. **`DEV-01` Static checks.** Run `npm run lint && npm run format:check && npm run typecheck`. Expected: all
   three exit 0 with no warnings. Time: 90 s.
2. **`DEV-02` Unit tests.** Run `npm test`. Expected: `Test Files ... passed` and `Tests ... passed` with the
   README counts and no failure. Time: 80 s. A test that fails under CPU load passes on a second `npm test`;
   report it only if it fails twice.
3. **`DEV-03` Reference matrix, no Docker.** Run `npm run matrix:reference`. Expected: the last lines read
   `N of N cells as specified` with `fail 0, error 0`, and the counts match the README. Time: 40 s.
4. **`DEV-04` Browser tests.** Run `npm run e2e`. Do not run anything else that builds the UI at the same
   time. Expected: every test passed. Time: 60 s.
5. **`DEV-05` Reference mode in the browser.** Run `npm run build && npm start`, open
   <http://localhost:28100>. Expected: the Playground page with `Inji stack not configured: reference roles only`
   in the header and the reference roles selected. Choose SD-JWT VC, Happy path and press **Run**. Expected:
   `Pass` within 5 s, and the inspector lists the exchanges. Stop the server with Ctrl+C.
6. **`DEV-06` Stack smoke test.** Run `npm run stack:smoke`. Expected: twelve `check ok` lines, then
   `SMOKE PASS`, and no `ps02-` container left in `docker ps`. Time: about 3 minutes with the images present.
7. **`DEV-07` Start the stack.** Run `npm run stack:up`. Expected: `stack is up`. Time: 90 to 130 s.
8. **`DEV-08` Live tests.** Run `npm run test:live`. Expected: every test passed, with the README count.
   Time: 60 s.
9. **`DEV-09` Host-mode server.** In a second terminal run
   `PLAYGROUND_STACK=host PLAYGROUND_PUBLIC_URL=https://ref.ps02.test npm start`. Expected: the server answers
   on <http://localhost:28100>.
10. **`DEV-10` Live matrix, `live-core`.** In the first terminal run `npm run matrix:live`. Expected: every
    cell as specified, with the README counts. The `fail` cells are gaps in Inji modules, so they are
    expected. A cell that differs from its spec is the failure to report. Time: about 80 s.
11. **`DEV-11` Live matrix, `live-holder-web`.** Run `npm run matrix:live -- --spec live-holder-web`.
    Expected: every cell as specified, with the README counts. Time: about 45 s.
12. **`DEV-12` Live browser test.** Run `npm run e2e:live`. Expected: `3 passed` (the all-Inji run in the
    playground, the Inji Verify web component run, and Inji Web's own pages), all `Valid`. Time: 3 min.
13. **`DEV-13` Pages by eye in host mode.** Open `/`, `/runs`, `/matrix`, `/gaps` and `/about`. Expected: every
    page renders, with the same console result as `UI-20`. Time: 3 min.
14. **`DEV-14` Stop everything.** Press Ctrl+C in the second terminal, then run `npm run stack:down`. Expected:
    no `ps02-` container in `docker ps`. Time: 15 s.

## Inji Wallet on a phone

No run with Inji Wallet on a phone is recorded yet. This section records one. Follow
[phone-wallet-guide.md](phone-wallet-guide.md) for the set-up: how the phone reaches the playground, the
public URL, and the test certificate. If the guide's steps differ from the ids below, follow the guide and
write its step numbers in the notes column.

1. **`PH-01` Set-up.** Complete the guide's set-up. Expected: the phone's browser opens the playground's
   public URL.
2. **`PH-02` Install the wallet.** Install Inji Wallet as the guide says. Expected: the app opens and is ready
   to add a credential.
3. **`PH-03` Issue to the phone.** Select an issuer, `Phone wallet (Inji Wallet or any OpenID4VC app)` and a
   verifier as the guide says, and press **Run**. Expected: the dialog `Scan the credential offer with the
wallet app` with a QR code. Scan it with the app. Expected: the credential appears in the app, and the run
   moves on by itself or after you press **Done**.
4. **`PH-04` Present from the phone.** Expected: the dialog `Share the credential with the verifier` with a
   QR code. Scan it and share the credential. Expected: the dialog closes and the run ends with the result the
   guide names.
5. **`PH-05` Evidence.** Open the run's report and the inspector. Expected: the messages from the phone are
   recorded. Take a screenshot of the phone and of the report, and save the report with **Download Markdown**.
6. **`PH-06` Clean up.** Stop what the guide started, then run `npm run down`. Expected: no `ps02-` container
   in `docker ps`.

## What this checklist does not cover

- The hosted GitHub Actions workflows, which cannot start until the account billing problem is fixed.
- A real screen reader, and a real platform wallet for the Digital Credentials API.
