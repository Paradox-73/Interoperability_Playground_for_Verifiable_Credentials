#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CredentialFormatSchema,
  ScenarioIdSchema,
  VciProfileSchema,
  VpProfileSchema,
} from '@inji-playground/protocol';
import {
  PlaygroundClient,
  USAGE,
  budgetProblem,
  estimateDuration,
  exitCodeFor,
  formatSeconds,
  loadSpec,
  parseCli,
  renderIndex,
  renderJunit,
  renderMarkdown,
  resolveSpecPath,
  runFileOf,
  runMatrix,
  startReferenceServer,
  type CellResult,
  type CliInvocation,
  type LoadedSpec,
  type MatrixResult,
  type ReferenceServer,
} from './index.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const version = (JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version: string })
  .version;

try {
  const invocation = parseCli(process.argv.slice(2));
  switch (invocation.command) {
    case 'help':
      console.log(USAGE);
      break;
    case 'version':
      console.log(version);
      break;
    case 'run':
      process.exitCode = await withServer(invocation, (client, reference) =>
        runOne(invocation, client, reference),
      );
      break;
    case 'matrix':
      process.exitCode = await matrix(invocation);
      break;
    case 'index':
      process.exitCode = writeIndex(invocation.out!);
      break;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}

/** Calls `body` with a client for `--server`, or for an in-process reference server it stops after. */
async function withServer<T>(
  invocation: CliInvocation,
  body: (client: PlaygroundClient, reference: boolean) => Promise<T>,
): Promise<T> {
  let server: ReferenceServer | undefined;
  if (invocation.reference) {
    server = await startReferenceServer();
    console.error(`reference server started at ${server.url}`);
  }
  try {
    return await body(new PlaygroundClient(server?.url ?? invocation.server), invocation.reference);
  } finally {
    await server?.close();
  }
}

async function runOne(
  invocation: CliInvocation,
  client: PlaygroundClient,
  reference: boolean,
): Promise<number> {
  const { cell } = invocation;
  const vpProfile = VpProfileSchema.parse(
    cell.vpProfile ?? (cell.vciProfile === 'v1' ? 'final-1.0' : 'inji-draft'),
  );
  const spec: LoadedSpec = {
    name: 'run',
    mode: 'reference',
    source: 'command line',
    cases: [
      {
        id: 'TC_PG_RUN_01',
        issuer: cell.issuer,
        wallet: cell.wallet,
        verifier: cell.verifier,
        format: CredentialFormatSchema.parse(cell.format),
        vpProfile,
        vciProfile: VciProfileSchema.parse(cell.vciProfile ?? (vpProfile === 'final-1.0' ? 'v1' : 'draft13')),
        scenario: ScenarioIdSchema.parse(cell.scenario),
        verdict: 'pass',
      },
    ],
  };
  const result = await runMatrix(spec, client, { server: { reference } });
  const [only] = result.cells;
  printCell(only!, 0, 1);
  console.log(`verdict=${only?.verdict ?? 'none'}`);
  return exitCodeFor(result);
}

async function matrix(invocation: CliInvocation): Promise<number> {
  const specPath = resolveSpecPath(invocation.spec!, join(packageRoot, 'specs'));
  if (!existsSync(specPath)) throw new Error(`no spec file at ${specPath}`);
  const spec = loadSpec(specPath);
  const out = invocation.out;
  const previous = out ? readPrevious(join(out, 'matrix.json')) : undefined;
  const estimate = estimateDuration(spec, previous);
  console.error(
    `${spec.name}: ${estimate.cells} cells, estimated ${formatSeconds(estimate.totalSeconds)} (${estimate.secondsPerCell.toFixed(1)} s per cell, ${estimate.basis})`,
  );
  const problem = budgetProblem(spec, estimate, invocation.force);
  if (problem) {
    console.error(problem);
    return 2;
  }
  if (out) {
    mkdirSync(out, { recursive: true });
    // Files of an earlier run would otherwise sit next to the new matrix and look current.
    rmSync(join(out, 'runs'), { recursive: true, force: true });
  }

  const result = await withServer(invocation, async (client, reference) => {
    const finished = await runMatrix(spec, client, {
      server: { reference },
      onCell: printCell,
      ...(out
        ? {
            onExport: (cell: CellResult, exported: unknown) => {
              const path = join(out, runFileOf(cell));
              mkdirSync(dirname(path), { recursive: true });
              writeFileSync(path, `${JSON.stringify(exported, null, 2)}\n`);
            },
          }
        : {}),
    });
    if (out) {
      writeFileSync(join(out, 'matrix.json'), `${JSON.stringify(finished, null, 2)}\n`);
      writeFileSync(join(out, 'matrix.md'), renderMarkdown(finished));
    }
    if (invocation.junit) {
      mkdirSync(dirname(invocation.junit), { recursive: true });
      writeFileSync(invocation.junit, renderJunit(finished));
    }
    return finished;
  });

  const { totals } = result;
  console.log(
    `${totals.matched}/${totals.cells} cells as specified (pass ${totals.pass}, fail ${totals.fail}, error ${totals.error}, not supported ${totals.notSupported}) in ${formatSeconds(result.durationMs / 1000)}`,
  );
  if (out)
    console.log(`wrote ${join(out, 'matrix.md')}, ${join(out, 'matrix.json')} and ${join(out, 'runs')}/`);
  return exitCodeFor(result);
}

/** Writes `<out>/matrix.md` from the `matrix.json` of every folder directly below `out`. */
function writeIndex(out: string): number {
  const entries = existsSync(out)
    ? readdirSync(out, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const result = readPrevious(join(out, entry.name, 'matrix.json'));
          return result ? [{ dir: entry.name, result }] : [];
        })
    : [];
  if (entries.length === 0) {
    console.error(`no <spec>/matrix.json below ${out}`);
    return 2;
  }
  const title = out.replace(/\\/g, '/').endsWith('/live')
    ? 'Live compatibility matrix'
    : 'Compatibility matrix';
  writeFileSync(join(out, 'matrix.md'), renderIndex(title, entries));
  console.log(`wrote ${join(out, 'matrix.md')} from ${entries.map((entry) => entry.dir).join(', ')}`);
  return 0;
}

function printCell(cell: CellResult, index: number, total: number): void {
  const { case: entry } = cell;
  const mark = cell.matches ? 'ok  ' : 'DIFF';
  const actual = cell.verdict ? `${cell.verdict} ${cell.outcome ?? ''}`.trim() : 'no run';
  const error = cell.error && !cell.matches ? `  ${cell.error.code}: ${cell.error.message}` : '';
  console.log(
    `${mark} ${String(index + 1).padStart(String(total).length)}/${total} ${entry.id} ${entry.issuer} -> ${entry.wallet} -> ${entry.verifier} ${entry.format} ${entry.vpProfile} ${entry.scenario}: ${actual} (expected ${entry.verdict} ${cell.expected})${error}`,
  );
}

function readPrevious(path: string): MatrixResult | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MatrixResult;
  } catch {
    return undefined;
  }
}
