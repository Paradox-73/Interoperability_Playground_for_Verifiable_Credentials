/**
 * @inji-playground/cli: headless runner for single runs and the compatibility matrix.
 *
 * Skeleton: argument parsing and help exist; the `run` and `matrix` commands are added by the
 * matrix work package.
 */
import { parseArgs } from 'node:util';

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
}

export const USAGE = `Usage: inji-playground <command> [options]

Commands:
  run       Run one issuer -> wallet -> verifier cell
  matrix    Run every cell of a spec file and write matrix.json and matrix.md
  help      Show this help
  version   Show the version

Options:
  --server <url>   Playground server to drive (default http://localhost:28100)
  --reference      Start an in-process server with the reference roles only
  --spec <file>    Matrix spec (YAML)
  --out <dir>      Output directory for matrix files`;

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
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const name = values.help ? 'help' : (positionals[0] ?? 'help');
  if (!(COMMANDS as readonly string[]).includes(name)) {
    throw new Error(`unknown command "${name}"\n\n${USAGE}`);
  }
  return {
    command: name as Command,
    server: values.server,
    reference: values.reference,
    ...(values.spec !== undefined && { spec: values.spec }),
    ...(values.out !== undefined && { out: values.out }),
  };
}
