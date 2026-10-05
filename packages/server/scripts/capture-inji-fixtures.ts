/**
 * Writes the Inji contract fixtures (`packages/server/test/contract/inji/fixtures/*.recorded.json`) from
 * runs stored on a playground server that is connected to the Inji stack. Each fixture is the redacted
 * export's exchanges with Inji Certify or Inji Verify for one run, so the adapter tests replay what the
 * real modules answered without containers.
 *
 *   node --conditions=source --import tsx packages/server/scripts/capture-inji-fixtures.ts \
 *     --server http://localhost:28100 <name>=<runId> ...
 *
 * Credential bodies inside Inji Verify results are replaced by a marker: the adapters never read them,
 * and they would only make the fixtures large.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { RunExportSchema, type RecordedExchange } from '@inji-playground/protocol';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { server: { type: 'string', default: 'http://localhost:28100' } },
});
const out = new URL('../test/contract/inji/fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });

const INJI = new Set(['inji-certify', 'inji-verify']);
const shorten = (exchange: RecordedExchange): RecordedExchange => {
  const body = exchange.response?.body;
  if (!body || !body.includes('verifiableCredential')) return exchange;
  try {
    const json = JSON.parse(body) as { credentialResults?: Array<Record<string, unknown>> };
    for (const result of json.credentialResults ?? [])
      result.verifiableCredential = '[credential omitted from fixture]';
    return { ...exchange, response: { ...exchange.response!, body: JSON.stringify(json) } };
  } catch {
    return exchange;
  }
};

for (const pair of positionals) {
  const [name, runId] = pair.split('=');
  if (!name || !runId) throw new Error(`expected <name>=<runId>, got ${pair}`);
  const response = await fetch(`${values.server}/api/runs/${encodeURIComponent(runId)}/export`);
  const exported = RunExportSchema.parse(await response.json());
  const exchanges = exported.exchanges.filter((exchange) => INJI.has(exchange.to)).map(shorten);
  const fixture = {
    description: `Exchanges with Inji modules recorded in run ${runId} (${exported.run.config.issuer} -> ${exported.run.config.wallet} -> ${exported.run.config.verifier}, ${exported.run.config.format}, ${exported.run.config.scenario}) on ${exported.run.createdAt.slice(0, 10)}, redacted.`,
    config: exported.run.config,
    outcome: exported.run.report?.outcome,
    exchanges,
  };
  writeFileSync(new URL(`${name}.recorded.json`, out), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`${name}: ${exchanges.length} exchanges`);
}
