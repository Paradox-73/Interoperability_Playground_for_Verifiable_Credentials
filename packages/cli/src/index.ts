/**
 * @inji-playground/cli: headless runner for single runs and the compatibility matrix.
 *
 * - `run`: one issuer -> wallet -> verifier cell from flags; prints the verdict.
 * - `matrix --spec <file>`: every cell of a spec (`specs/*.yaml`), compared with the verdict and outcome
 *   the spec expects; writes `matrix.json`, `matrix.md` and one redacted run file per cell to `--out`,
 *   and JUnit XML to `--junit`. Exit code 1 when any cell differs from its spec.
 *
 * Both talk to a playground server over REST (`--server`, default http://localhost:28100), or start one
 * in-process with the reference roles (`--reference`).
 */
import { parseArgs } from 'node:util';

export * from './client.js';
export * from './matrix.js';
export * from './reference-server.js';
export * from './render.js';
export * from './spec.js';

export const COMMANDS = ['run', 'matrix', 'help', 'version'] as const;
export type Command = (typeof COMMANDS)[number];

export interface CliInvocation {
  command: Command;
  /** Base URL of a running playground server. */
  server: string;
  /** Start an in-process server with reference roles instead of using `server`. */
  reference: boolean;
  spec?: string;
  out?: string;
  /** JUnit XML report path (matrix). */
  junit?: string;
  /** Run a live spec even when its estimate is over the 20-minute budget. */
  force: boolean;
  /** The cell of `run`; defaults are the reference roles, SD-JWT VC and the happy path. */
  cell: {
    issuer: string;
    wallet: string;
    verifier: string;
    format: string;
    vciProfile?: string;
    vpProfile?: string;
    scenario: string;
  };
}

export const USAGE = `Usage: inji-playground <command> [options]

Commands:
  run       Run one issuer -> wallet -> verifier cell and print its verdict
  matrix    Run every cell of a spec file and write matrix.json and matrix.md
  help      Show this help
  version   Show the version

Options:
  --server <url>      Playground server to drive (default http://localhost:28100)
  --reference         Start an in-process server with the reference roles (port 28600-28699)
  --spec <file>       Matrix spec (YAML), or the name of one in specs/ (reference, live-core, ...)
  --out <dir>         Output directory for matrix.json, matrix.md and runs/ (matrix)
  --junit <file>      Also write a JUnit XML report (matrix)
  --force             Run a live spec even when its estimate is over 20 minutes
  --issuer, --wallet, --verifier <role id>   Cell of "run" (default the reference roles)
  --format <format>   Credential format of "run" (default vc+sd-jwt)
  --vci-profile, --vp-profile <profile>      Protocol profiles of "run" (paired by default)
  --scenario <id>     Scenario of "run" (default happy)

Exit codes: 0 every verdict as expected (run: pass), 1 a verdict differs, 2 bad arguments or no server.`;

/** Parses command-line arguments (without the node and script paths). Throws on unknown options. */
export function parseCli(argv: readonly string[]): CliInvocation {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      server: { type: 'string', default: 'http://localhost:28100' },
      reference: { type: 'boolean', default: false },
      spec: { type: 'string' },
      out: { type: 'string' },
      junit: { type: 'string' },
      force: { type: 'boolean', default: false },
      issuer: { type: 'string', default: 'ref-issuer' },
      wallet: { type: 'string', default: 'ref-wallet' },
      verifier: { type: 'string', default: 'ref-verifier' },
      format: { type: 'string', default: 'vc+sd-jwt' },
      'vci-profile': { type: 'string' },
      'vp-profile': { type: 'string' },
      scenario: { type: 'string', default: 'happy' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const name = values.help ? 'help' : (positionals[0] ?? 'help');
  if (!(COMMANDS as readonly string[]).includes(name)) {
    throw new Error(`unknown command "${name}"\n\n${USAGE}`);
  }
  if (name === 'matrix' && values.spec === undefined) {
    throw new Error(`matrix needs --spec <file>\n\n${USAGE}`);
  }
  return {
    command: name as Command,
    server: values.server,
    reference: values.reference,
    ...(values.spec !== undefined && { spec: values.spec }),
    ...(values.out !== undefined && { out: values.out }),
    ...(values.junit !== undefined && { junit: values.junit }),
    force: values.force,
    cell: {
      issuer: values.issuer,
      wallet: values.wallet,
      verifier: values.verifier,
      format: values.format,
      ...(values['vci-profile'] !== undefined && { vciProfile: values['vci-profile'] }),
      ...(values['vp-profile'] !== undefined && { vpProfile: values['vp-profile'] }),
      scenario: values.scenario,
    },
  };
}
