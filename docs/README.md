# Documentation

Start with the [README](../README.md) for what the playground is and how to run it.

## Available now

| Document                                            | Contents                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| [Architecture decisions](adr/README.md)             | Why the code is built the way it is, one record per decision          |
| [Contracts](../packages/protocol/README.md)         | The shared types: roles, run events, recorded exchanges, reports      |
| [Credential formats](../packages/formats/README.md) | Keys, DIDs, ldp_vc / ldp_vp and SD-JWT VC used by the reference roles |
| [Contributing](../CONTRIBUTING.md)                  | Layout, commands, tests, dependency and commit rules                  |
| [Security](../SECURITY.md)                          | Test keys, recorded data, reporting                                   |

## Planned (added with the features they describe)

- Architecture: components, one run end to end, where traffic is recorded.
- Set-up: reference mode, local Inji stack, one-command bundle, phone wallets.
- Flows: each issue → hold → present → verify flow step by step.
- API: REST endpoints, WebSocket events, hosted reference endpoints, OpenAPI document.
- Test data, extending the playground with a new role, test report.
- Interoperability report (reference and live matrices) and the interoperability gaps write-up.
- UX notes and the demo script.
