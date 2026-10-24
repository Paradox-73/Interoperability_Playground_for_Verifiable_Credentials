# Project status

What is done for each task of problem statement 02, and what people must still do. Updated 2026-10-25.

- Project: Inji Interoperability Playground for Verifiable Credentials, MOSIP Decode 2026, team Badmosip.
- Submission deadline: 2026-10-26 23:59 IST.
- Repository: <https://github.com/Paradox-73/Interoperability_Playground_for_Verifiable_Credentials>, public.
- Test counts, matrix results and timings: [README, Current numbers](../README.md#current-numbers). This page
  does not repeat them.
- The dated record of every work pass, review and branch until 2026-10-14:
  [history/STATUS-history.md](history/STATUS-history.md).

## Tasks of the problem statement

DONE means the code exists and a run record or test shows it working. PARTIAL means part of the task is done
and the rest is blocked or not started; the note says which part. Task ids are the ones in the
[README task table](../README.md#where-each-task-of-the-problem-statement-is-shown).

| Task                                            | State   | Note                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 Inji stack running end to end                | DONE    | Inji Certify, Mimoto, Inji Web and Inji Verify in the local stack ([setup](setup.md#local-inji-stack)). Local, not the Collab sandbox.                                                                                                                                                                                               |
| M2 Three-column selector, starting with Inji    | DONE    | Healthy Inji modules are preselected in every column ([UX](ux/README.md)).                                                                                                                                                                                                                                                           |
| M3 Live issue flow                              | DONE    | Inji Certify issues to the reference wallet with an offer and a pre-authorized code. The Inji Web path is an authorization code flow through Mimoto's API in runs; a live browser test also uses Inji Web's own pages, from login to a VALID share at Inji Verify ([flows](flows.md#inji-webs-own-pages)). The phone path never ran. |
| M4 Present and verify: Valid, Invalid, Expired  | DONE    | Against Inji Verify ([live matrix](interop-report/live/matrix.md)). The expired credential comes from the reference issuer, because Inji Certify cannot issue one.                                                                                                                                                                   |
| M5 Protocol inspector                           | DONE    | On every run page ([screenshot](ux/screenshots/2-timeline-and-inspector.png)).                                                                                                                                                                                                                                                       |
| M6 Two formats end to end                       | DONE    | `ldp_vc` and `vc+sd-jwt` from Inji Certify to Inji Verify. Through Inji Web only `ldp_vc` works (gap G25).                                                                                                                                                                                                                           |
| M7 Pass/fail report per run                     | DONE    | `/runs/<id>/report` ([screenshot](ux/screenshots/3-report.png)).                                                                                                                                                                                                                                                                     |
| G1 Non-Inji mock in the matrix                  | DONE    | Reference issuer, wallet and verifier ([reference matrix](interop-report/reference/matrix.md)).                                                                                                                                                                                                                                      |
| G2 mDoc as third format                         | PARTIAL | Reference roles pass. Inji Certify issues `FarmerMdoc`, but Inji Verify and Mimoto refuse it (gaps G26 to G29).                                                                                                                                                                                                                      |
| G3 Animated sequence diagram                    | DONE    | Run page and playback page.                                                                                                                                                                                                                                                                                                          |
| G4 Replay and tamper                            | DONE    | Scenario picker and "Replay with tamper" on the report page.                                                                                                                                                                                                                                                                         |
| G5 History with filters                         | DONE    | History page, filters by role, module version, format, scenario and outcome.                                                                                                                                                                                                                                                         |
| G6 Same-device flow and Digital Credentials API | DONE    | With a stand-in browser wallet; no real platform wallet. mdoc over the Digital Credentials API is not done.                                                                                                                                                                                                                          |
| B1 CI-style suite with nightly matrix           | PARTIAL | `.github/workflows/interop-nightly.yml` runs the reference and live matrices on a hosted runner and passed every night from 2026-10-14 to 2026-10-23 ([CI](../README.md#continuous-integration)). It can target Collab through repository variables, but has not run against Collab.                                                 |
| B2 Gaps filed as issues                         | PARTIAL | Issue drafts are in [gaps/issues](gaps/issues/). None is filed yet.                                                                                                                                                                                                                                                                  |
| B3 Telemetry                                    | DONE    | `GET /metrics` (Prometheus), metric tiles, and Obsrv events with a Druid ingestion spec ([telemetry-obsrv.md](telemetry-obsrv.md)). Not run against a real Obsrv.                                                                                                                                                                    |
| B4 One-command Docker Compose bundle            | DONE    | `npm run up`, `npm run demo` ([setup](setup.md#one-command-bundle)).                                                                                                                                                                                                                                                                 |

## Deliverables

| Deliverable                                   | State | Note                                                                                                                                                     |
| --------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working app, runnable with Docker Compose     | DONE  | Local only, which the statement allows.                                                                                                                  |
| Public repository with README                 | DONE  | [README](../README.md), [setup](setup.md), [architecture](architecture.md) and [flows](flows.md).                                                        |
| Demo video, 3 to 5 minutes, inspector visible | DONE  | Recorded; the link is added before submission. Shot list in [video-script.md](video-script.md).                                                          |
| Pitch deck                                    | READY | Ready, and submitted with the other deliverables (it is not kept in this repository). Slide outline in [video-script.md](video-script.md#slide-outline). |
| Interoperability report and matrix            | DONE  | [Reference matrix](interop-report/reference/matrix.md), [live matrix](interop-report/live/matrix.md).                                                    |
| Gap write-up                                  | DONE  | [Gap register](gaps/README.md). Filing upstream is a person task below.                                                                                  |

## Left for people

None of these can be done from the code. Each needs a person, a phone or an account.

| Task                                 | Who                                           | How                                                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record the demo video                | One team member, with the bundle running      | Dry run first ([checklist, section VID](manual-test-checklist.md#video-recording-dry-run)), then [video-script.md](video-script.md). Put the link in the README task table, this page and deck slide 7. |
| Present the pitch deck               | One team member                               | The deck is ready; the [slide outline](video-script.md#slide-outline) is the talking order.                                                                                                             |
| Run the manual test checklist        | One tester per OS: macOS, Linux, Windows      | [manual-test-checklist.md](manual-test-checklist.md), results in [the template](manual-test-results-template.md).                                                                                       |
| Test Inji Wallet on a phone          | A team member with an Android phone or iPhone | [phone-wallet-guide.md](phone-wallet-guide.md); the emulator cannot run the app.                                                                                                                        |
| File the gap issues upstream         | Any team member                               | One issue per draft in [gaps/issues](gaps/issues/). G7 and G20 go privately ([gap register](gaps/README.md#reported-privately)).                                                                        |
| College IDs and the submission email | Every team member; one sends the email        | Email decode@mosip.io with the links.                                                                                                                                                                   |

## Open in the code

These are written up in [README, Known limits](../README.md#known-limits):

- Inji Wallet mobile never ran with a phone.
- mdoc status is not checked, and revocation is not tested against Inji.
- A holder can make the server send a GET to a public address (its own `did:web`, a context that is not
  pinned); private addresses and DNS rebinding are blocked.

## Evidence

- [Test report](test-report/README.md), generated by `npm run test:report`.
- [Live matrix](interop-report/live/matrix.md) and its run records, against the real Inji images.
- [Reference matrix](interop-report/reference/matrix.md), without Docker.
- [Nightly replay](test-report/nightly-replay.md), the nightly workflow run locally.
- [UX walk-through with screenshots](ux/README.md).
- [Gap register](gaps/README.md) and [issue drafts](gaps/issues/).
- [Architecture decisions](adr/README.md).
