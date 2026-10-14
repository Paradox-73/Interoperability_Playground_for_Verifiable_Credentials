# Telemetry for Obsrv and Druid

The problem statement's bonus task asks for telemetry that reuses the Obsrv/Druid pattern to track success
rates and latency per flow. Sunbird Obsrv takes JSON events through an HTTP API, passes them through Kafka
and stores them in Apache Druid. The playground emits each finished run as flat Obsrv events, can push them
to an Obsrv dataset, and ships a Druid ingestion spec for the same fields.

The Prometheus endpoint `GET /metrics` and the dashboard tiles stay as they are. This page covers only the
Obsrv path.

## What a finished run emits

One `RUN` event, plus one `STEP` event for each protocol step that finished `ok` or `failed`. Skipped and
not-run steps give no event, the same rule `GET /api/metrics` uses. Every event carries the flow (issuer,
wallet, verifier, format), so Druid groups by flow without a join. `packages/server/src/metrics/obsrv.ts`
builds the events.

| Field                          | `RUN` event                                                      | `STEP` event                                                 |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `ets`                          | epoch milliseconds when the run finished                         | epoch milliseconds when the step started                     |
| `mid`                          | `<runId>:run`                                                    | `<runId>:<position>:<step>`, position in the run's step list |
| `eid`                          | `RUN`                                                            | `STEP`                                                       |
| `runId`, `mode`                | the run id; `live`, `reference` or `playback`                    | same                                                         |
| `issuer`, `wallet`, `verifier` | role ids, for example `inji-certify`                             | same                                                         |
| `format`                       | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt` or `mso_mdoc`                 | same                                                         |
| `scenario`, `expected`         | scenario id and its expected outcome                             | same                                                         |
| `outcome`, `verdict`           | what the verifier said; `pass`, `fail`, `error`, `not-supported` | same, so step latency can be split by verdict                |
| `errorCode`                    | the run's error code, or `null`                                  | the error code on the failing step only, else `null`         |
| `step`, `stepStatus`           | `null`                                                           | step id, for example `token`; `ok` or `failed`               |
| `durationMs`                   | sum of the step times                                            | the step time                                                |
| `success`                      | `1` when the verdict is `pass`, else `0`                         | `1` when the step finished `ok`, else `0`                    |

The `RUN` event of a reference run made with `npm run smoke` on 2026-10-14:

```json
{
  "ets": 1791965641855,
  "mid": "20261014T081401-fda487:run",
  "eid": "RUN",
  "runId": "20261014T081401-fda487",
  "mode": "reference",
  "issuer": "ref-issuer",
  "wallet": "ref-wallet",
  "verifier": "ref-verifier",
  "format": "vc+sd-jwt",
  "scenario": "happy",
  "expected": "VALID",
  "outcome": "VALID",
  "verdict": "pass",
  "errorCode": null,
  "step": null,
  "stepStatus": null,
  "durationMs": 282,
  "success": 1
}
```

## Where the events go

- `GET /api/telemetry/obsrv` lists the events of the finished runs. It takes the filters of `GET /api/metrics`
  (`issuer`, `wallet`, `verifier`, `version`, `format`, `scenario`, `mode`, `from`, `to`) and `runId` for one
  run.
- With `PLAYGROUND_OBSRV_URL` set, the server posts the events of each finished run to that URL. Unset, the
  default, nothing is sent. The body is the request of Obsrv's Data In API with the events as a batch:

  ```json
  { "id": "api.data.in", "ver": "v2", "ts": "2026-10-14T08:14:01.861Z", "params": { "msgid": "<runId>" }, "data": [ ... ] }
  ```

  Obsrv uses `msgid` as the batch's dedup key, so a dataset with batch dedup on drops a second push of the
  same run. A failed
  push writes a warning to the server log. There is no retry and no queue.

## Connect the playground to Obsrv

1. Create an Obsrv dataset, for example `inji-playground-runs`, with `ets` as the timestamp key and `mid`
   as the dedup key. Set its extraction config to batch events with extraction key `events`: the Data In
   API puts an array body under that key.
2. Set `PLAYGROUND_OBSRV_URL=https://<obsrv-api-host>/v2/data/in/inji-playground-runs` and start the
   server.
3. Run a cell, then check that the dataset received `RUN` and `STEP` events.

Obsrv writes its own Druid ingestion spec when you publish a dataset. `deploy/obsrv/druid-ingestion-spec.json`
is for a plain Druid that reads the same events from a Kafka topic. Submit it to the Druid Overlord's
supervisor API (`POST /druid/indexer/v1/supervisor`) after you change `topic` and `bootstrap.servers`.

## The Druid ingestion spec

`deploy/obsrv/druid-ingestion-spec.json` is a Kafka supervisor spec for the data source
`inji-playground-runs`:

- `timestampSpec`: column `ets`, format `millis`.
- `dimensionsSpec`: every event field except `ets`, `mid`, `durationMs` and `success`. `mid` is unique per
  event, so as a dimension it would stop rollup.
- `metricsSpec`: `count`, `success_sum` (sum of `success`), and `durationMs_sum`, `durationMs_min`,
  `durationMs_max`.
- `granularitySpec`: rollup to the minute, one segment per day.

`packages/server/test/obsrv.test.ts` fails when the spec's dimensions, metric inputs or timestamp column
differ from the fields the mapper emits.

Success rate and mean latency per flow come out of the rolled-up rows like this:

```sql
SELECT issuer, wallet, verifier, format,
       SUM(success_sum) * 1.0 / SUM("count") AS success_rate,
       SUM(durationMs_sum) / SUM("count") AS mean_ms,
       MAX(durationMs_max) AS max_ms
FROM "inji-playground-runs"
WHERE eid = 'RUN' AND verdict <> 'not-supported'
GROUP BY issuer, wallet, verifier, format
```

For latency per step, use `eid = 'STEP'` and group by `step`. Percentiles need the Druid DataSketches
extension, which the spec does not use. `GET /api/metrics` and `GET /metrics` already give p50 and p95.

## What was not tested

- Nothing here has run against a real Obsrv or a real Druid. The push was checked against a local HTTP
  listener: `npm run smoke` with `PLAYGROUND_OBSRV_URL` set posted one batch of 10 events on 2026-10-14. The
  tests in `packages/server/test/obsrv.test.ts` do the same with a listener in the test.
- The Druid spec was checked only against the event fields, not submitted to an Overlord.
- The push sends no authentication header. An Obsrv API behind a gateway that wants a token needs a
  change in `pushToObsrv`.
- A run that finishes while Obsrv is down is not sent again. `GET /api/telemetry/obsrv` gives its events
  for a manual backfill.

## Sources

- [Obsrv Data In and Out APIs](https://obsrv.sunbird.org/guides/api-specification/data-in-and-out-apis.md):
  `POST /v2/data/in/{dataset_id}`.
- [Obsrv API service OpenAPI](https://raw.githubusercontent.com/Sanketika-Obsrv/obsrv-api-service/main/api-service/swagger-doc/openapi_v2.yml):
  the Data In request (`id`, `ver`, `ts`, `params.msgid`, `data`) and the dataset create request
  (`extraction_config` with `extraction_key: events`, `dedup_config`).
- [DataIngestionController.ts](https://github.com/Sanketika-Obsrv/obsrv-api-service/blob/main/api-service/src/controllers/DataIngestion/DataIngestionController.ts)
  and its [validationSchema.json](https://github.com/Sanketika-Obsrv/obsrv-api-service/blob/main/api-service/src/controllers/DataIngestion/validationSchema.json):
  an array `data` goes out as one batch under the extraction key, with `msgid` as the batch dedup key.
- [IngestionConfig.ts](https://github.com/Sanketika-Obsrv/obsrv-api-service/blob/main/api-service/src/configs/IngestionConfig.ts):
  the defaults of the Druid spec Obsrv generates (Kafka input, JSON, day segments).
- [Apache Druid Kafka ingestion](https://druid.apache.org/docs/latest/ingestion/kafka-ingestion): the
  supervisor spec layout and the count, sum, min and max metrics.
