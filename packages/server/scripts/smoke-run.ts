/**
 * `npm run smoke`: starts the server in-process on a port from 28600-28699, runs one issuer -> wallet ->
 * verifier cell and prints the recorded exchanges and `verdict=<verdict>`. Exit code 0 when the verdict is
 * `pass`, 1 otherwise, 2 for bad arguments.
 *
 *   npm run smoke -- --issuer ref-issuer --wallet ref-wallet --verifier ref-verifier --format vc+sd-jwt
 *
 * Options: `--vci-profile draft13|v1`, `--vp-profile inji-draft|final-1.0` (each defaults to the other's
 * pair: draft13 with inji-draft, v1 with final-1.0), `--scenario <id>` (default `happy`), `--export <file>`
 * (writes the run's redacted export, the shape of `GET /api/runs/{id}/export`), `--json` (prints the report
 * as JSON instead of the table). Nothing is kept after the process ends: the database is in memory and the
 * reference keys are made fresh, unless `PLAYGROUND_DB` says otherwise.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { InteropReport, RecordedExchange, RunExport } from '@inji-playground/protocol';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';

const USAGE =
  'usage: npm run smoke -- [--issuer ref-issuer] [--wallet ref-wallet] [--verifier ref-verifier] [--format vc+sd-jwt]\n' +
  '                        [--vci-profile draft13|v1] [--vp-profile inji-draft|final-1.0] [--scenario happy]\n' +
  '                        [--export <file>] [--json]';
const FIRST_PORT = 28_600;
const LAST_PORT = 28_699;

let args;
try {
  args = parseArgs({
    options: {
      issuer: { type: 'string', default: 'ref-issuer' },
      wallet: { type: 'string', default: 'ref-wallet' },
      verifier: { type: 'string', default: 'ref-verifier' },
      format: { type: 'string', default: 'vc+sd-jwt' },
      'vci-profile': { type: 'string' },
      'vp-profile': { type: 'string' },
      scenario: { type: 'string', default: 'happy' },
      export: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  }).values;
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
  process.exit(2);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const vpProfile = args['vp-profile'] ?? (args['vci-profile'] === 'v1' ? 'final-1.0' : 'inji-draft');
const vciProfile = args['vci-profile'] ?? (vpProfile === 'final-1.0' ? 'v1' : 'draft13');
const cell = {
  issuer: args.issuer,
  wallet: args.wallet,
  verifier: args.verifier,
  format: args.format,
  vciProfile,
  vpProfile,
};

const { app, port } = await listen();
let exitCode = 1;
try {
  if (args.scenario === 'vp-replay') {
    // The wallet replays what it sent earlier to the same verifier, so make that earlier presentation.
    const earlier = await runCell(app, { ...cell, scenario: 'happy' });
    if (!args.json)
      console.log(
        `earlier happy run ${earlier.report.runId} for vp-replay: verdict=${earlier.report.verdict}`,
      );
  }
  const { report, exchanges } = await runCell(app, { ...cell, scenario: args.scenario });
  if (args.export) {
    const exported = await app.inject({ url: `/api/runs/${report.runId}/export` });
    if (exported.statusCode !== 200)
      throw new Error(`export failed: HTTP ${exported.statusCode} ${exported.body}`);
    await writeFile(args.export, `${JSON.stringify(exported.json<RunExport>(), null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify({ port, report, exchanges: exchanges.length }, null, 2));
  } else {
    printRun(port, report, exchanges);
    if (args.export) console.log(`redacted export written to ${args.export}`);
  }
  console.log(`verdict=${report.verdict}`);
  exitCode = report.verdict === 'pass' ? 0 : 1;
} catch (error) {
  console.error(`smoke run failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await app.close();
}
process.exit(exitCode);

/** Builds the app for the first port of the test range that is free, and listens on it. */
async function listen(): Promise<{ app: FastifyInstance; port: number }> {
  for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
    const config = loadConfig({
      PLAYGROUND_DB: ':memory:',
      PLAYGROUND_LOG_LEVEL: 'warn',
      ...process.env,
      PLAYGROUND_PORT: String(port),
    });
    // The reference roles advertise URLs on this port, so the app is built for it before listening.
    const candidate = await buildApp({ config });
    try {
      await candidate.listen({ port, host: config.host });
      return { app: candidate, port };
    } catch (error) {
      await candidate.close();
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`no free port in ${FIRST_PORT}-${LAST_PORT}`);
}

async function runCell(
  server: FastifyInstance,
  body: Record<string, string>,
): Promise<{ report: InteropReport; exchanges: RecordedExchange[] }> {
  const created = await server.inject({ method: 'POST', url: '/api/runs', payload: body });
  if (created.statusCode !== 201) {
    throw new Error(`the server refused the run: HTTP ${created.statusCode} ${created.body}`);
  }
  const { runId } = created.json<{ runId: string }>();
  const report = await server.playground.orchestrator.wait(runId);
  return { report, exchanges: server.playground.store.listExchanges(runId) };
}

function printRun(port: number, report: InteropReport, exchanges: readonly RecordedExchange[]): void {
  const roles = `${report.issuer.id} -> ${report.wallet.id} -> ${report.verifier.id}`;
  console.log(`server  http://localhost:${port}`);
  console.log(`run     ${report.runId}  ${roles}`);
  console.log(
    `cell    ${report.format}  OpenID4VCI ${report.vciProfile}  OpenID4VP ${report.vpProfile}  scenario ${report.scenario.id}`,
  );
  console.log(`\nrecorded exchanges (${exchanges.length}):`);
  const width = Math.max(4, ...exchanges.map((exchange) => (exchange.step ?? '-').length));
  for (const exchange of exchanges) {
    const status = exchange.response ? String(exchange.response.status) : 'ERR';
    console.log(
      `  ${String(exchange.seq).padStart(2)}  ${(exchange.step ?? '-').padEnd(width)}  ${exchange.request.method.padEnd(4)} ${status}  ${exchange.from} -> ${exchange.to}  ${exchange.capture}  ${exchange.request.url}`,
    );
  }
  console.log(`\noutcome=${report.outcome} expected=${report.scenario.expected}`);
  if (report.error) console.log(`error   ${report.error.step} ${report.error.code}: ${report.error.message}`);
}
