# Matrix specs

YAML files listing the cells `inji-playground matrix --spec <file>` runs: issuer, wallet, verifier,
format, OpenID4VP profile (the OpenID4VCI profile is paired with it unless given), scenario, the outcome
the verifier must report and the verdict the cell must get. Case ids follow the style of the Inji Verify
api-test YAML, `TC_PG_<AREA>_<NN>`, in a `uniqueIdentifier` field. The schema is `MatrixSpecSchema` in
[`../src/spec.ts`](../src/spec.ts).

| File                   | Mode      | Cells | Run by                                          | State                                    |
| ---------------------- | --------- | ----- | ----------------------------------------------- | ---------------------------------------- |
| `reference.yaml`       | reference | 82    | `npm run matrix:reference` (CI, nightly)        | runs today                               |
| `live-core.yaml`       | live      | 12    | `npm run matrix:live -- --spec live-core`       | planned: needs the Inji adapters (WP-10) |
| `live-holder-web.yaml` | live      | 4     | `npm run matrix:live -- --spec live-holder-web` | planned: needs Inji Web (WP-14)          |
| `demo.yaml`            | live      | 4     | `npm run demo` (WP-17)                          | planned: needs WP-10 and WP-17           |

`reference.yaml` holds every cell of the scenario catalogue the reference roles can run, in catalogue
order (happy cells before `vp-replay`, which replays an earlier presentation), in every applicable
format and both OpenID4VP profiles, plus four cells that must be reported as `not-supported`.

A live spec must finish within 20 minutes including stack start: the CLI estimates cells x the mean cell
time of the last `matrix.json` in the output folder (else `cellSeconds`) and refuses a longer live spec
unless `--force`.
