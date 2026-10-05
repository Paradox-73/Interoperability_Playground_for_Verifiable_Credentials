# Architecture decision records

One short record per significant decision: the context, the decision, and its consequences. A record
is never rewritten after it is accepted; a later record supersedes it instead.

To add one, copy [0000-template.md](0000-template.md) to the next number and fill it in.

## Records

| ADR                                          | Decision                                                                                   | Status   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| [0001](0001-typescript-monorepo.md)          | TypeScript monorepo with a shared contract package                                         | Accepted |
| [0002](0002-recording-capture-points.md)     | Record traffic at three capture points and redact only on export                           | Accepted |
| [0003](0003-certify-pre-authorized-core.md)  | Run Inji Certify in pre-authorized mode for the core stack                                 | Accepted |
| [0004](0004-tls-front-test-ca.md)            | Serve did:web over HTTPS through a TLS front with a test CA                                | Accepted |
| [0005](0005-node-sqlite-storage.md)          | Store runs in SQLite through node:sqlite                                                   | Accepted |
| [0006](0006-two-protocol-profiles.md)        | Implement two protocol profiles in the reference roles                                     | Accepted |
| [0007](0007-react-18-for-inji-verify-sdk.md) | Pin React 18 for the Inji Verify SDK                                                       | Accepted |
| [0008](0008-test-authorization-server.md)    | Use the playground test authorization server in place of eSignet for certify-ac and Mimoto | Accepted |
