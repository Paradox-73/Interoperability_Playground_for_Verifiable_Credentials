# Documentation

Start with the [README](../README.md) for what the playground is and how to run it.

## Documents

| Document                                                        | Contents                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Set-up](setup.md)                                              | Reference mode, the local Inji stack, the one-command bundle, ports, memory, troubleshooting                  |
| [Architecture](architecture.md)                                 | Components, one run end to end, where traffic is recorded                                                     |
| [Flows](flows.md)                                               | Issuance, presentation, Inji Web through Mimoto, phone wallets, message by message                            |
| [API](api.md)                                                   | REST endpoints, WebSocket events, hosted reference endpoints, recording proxy                                 |
| [Reports and matrix API](api/README.md)                         | Run reports, history, matrix, metrics, gaps, redaction rules; [OpenAPI](api/openapi.json)                     |
| [Telemetry for Obsrv](telemetry-obsrv.md)                       | Run and step events for an Obsrv dataset, the Druid ingestion spec, what was not tested                       |
| [Test data](test-data.md)                                       | Identities, keys and DIDs, credentials, recorded fixtures                                                     |
| [Extending](extending.md)                                       | Add an implementation as a role, and test it                                                                  |
| [Demo](demo/README.md)                                          | Preparing and running the demo                                                                                |
| [Video script](video-script.md)                                 | Shot list of the demo video and the slide outline                                                             |
| [Manual test checklist](manual-test-checklist.md)               | Checks only a person can do: fresh clone on macOS, Linux and Windows, the UI, a phone wallet, a video dry run |
| [Manual test results template](manual-test-results-template.md) | One table per checklist section to fill in and send back                                                      |
| [Phone wallet guide](phone-wallet-guide.md)                     | Inji Wallet on a real phone against the local Inji Verify, and why the emulator cannot run it                 |
| [Interoperability gaps](gaps/README.md)                         | The gap register and one issue draft per public gap                                                           |
| [Reference matrix](interop-report/reference/matrix.md)          | Every reference cell, without Docker                                                                          |
| [Live matrix](interop-report/live/matrix.md)                    | Inji Certify, certify-ac, Inji Web and Inji Verify against the reference roles                                |
| [Test report](test-report/README.md)                            | Test totals per package, browser and live tests, stack start time and memory, licences                        |
| [UX](ux/README.md)                                              | The user flow with screenshots captured by the browser tests                                                  |
| [Architecture decisions](adr/README.md)                         | Why the code is built the way it is, one record per decision                                                  |
| [Status](STATUS.md)                                             | What is done per task of the problem statement, and what people must still do                                 |
| [Status history](history/STATUS-history.md)                     | The dated record of every work pass, review and branch until 2026-10-14                                       |

Package guides: [protocol](../packages/protocol/README.md), [formats](../packages/formats/README.md),
[oid4vci](../packages/oid4vci/README.md), [oid4vp](../packages/oid4vp/README.md),
[scenarios](../packages/scenarios/README.md), [server](../packages/server/README.md),
[web](../packages/web/README.md), [cli](../packages/cli/README.md), [Inji stack](../deploy/inji-stack/README.md).

Also: [Contributing](../CONTRIBUTING.md) (layout, commands, tests, commit rules),
[Security](../SECURITY.md) (test keys, recorded data, reporting) and
[third-party licences](../THIRD_PARTY_LICENSES.md).

`npm run docs:check` checks these documents: relative links and headings resolve, required sections exist,
every public gap has a complete issue draft, and every `npm run` command in them exists.
