// SPDX-License-Identifier: MIT
/**
 * `stack.mjs verify-imports`: proves that every file listed in UPSTREAM.md entered the repository unchanged.
 *
 * For each row (file, repository, upstream path, commit, blob id) it checks, with git only:
 * 1. the first commit that touched the file is an `import: upstream <repo>@<commit>` commit for that row;
 * 2. the file as stored in that commit has the upstream blob id (git stores blobs by the hash that
 *    `git hash-object --no-filters` computes, so `git rev-parse <commit>:<path>` gives it directly);
 * 3. if the file is unchanged since, `git hash-object --no-filters <file>` of the working tree matches too.
 * Optionally (when the upstream clone is present) the blob id is also checked against the upstream clone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Parses the "Imported files" table of UPSTREAM.md.
 * @returns {Array<{ file: string, repo: string, upstreamPath: string, commit: string, blob: string }>}
 */
export function parseUpstreamTable(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('| `')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const code = (cell) => /`([^`]+)`/.exec(cell)?.[1] ?? '';
    const repo = /\[(?:[\w-]+\/)?([\w.-]+)\]/.exec(cells[1])?.[1] ?? '';
    rows.push({
      file: code(cells[0]),
      repo,
      upstreamPath: code(cells[2]),
      commit: code(cells[3]),
      blob: code(cells[4]),
    });
  }
  return rows;
}

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

/** True when the repository is a shallow clone, whose history cannot show the import commits. */
export function isShallowRepository(repoRoot) {
  return git(repoRoot, ['rev-parse', '--is-shallow-repository']) === 'true';
}

/**
 * Checks every row; returns one result per row with the problems found (empty when the row matches).
 * @param {{ repoRoot: string, stackPrefix: string, rows: ReturnType<typeof parseUpstreamTable>,
 *   upstreamDir?: string }} options  stackPrefix is the repository path of deploy/inji-stack.
 */
export function verifyImports({ repoRoot, stackPrefix, rows, upstreamDir }) {
  return rows.map((row) => {
    const path = `${stackPrefix}/${row.file}`;
    const problems = [];
    // Oldest commit that touched the file, following no renames: the import must be the very first.
    const history = git(repoRoot, ['log', '--format=%H %s', '--', path]).split('\n').filter(Boolean);
    const first = history.at(-1);
    if (!first) {
      return { row, path, problems: ['file is not in git history'], changedSinceImport: false };
    }
    const [firstCommit, ...subjectWords] = first.split(' ');
    const subject = subjectWords.join(' ');
    const expectedSubject = `import: upstream ${row.repo}@${row.commit}`;
    if (!subject.startsWith(expectedSubject)) {
      problems.push(
        `first commit ${firstCommit.slice(0, 7)} is "${subject}", expected "${expectedSubject} ..."`,
      );
    }
    const importedBlob = git(repoRoot, ['rev-parse', `${firstCommit}:${path}`]);
    if (importedBlob !== row.blob) problems.push(`blob at import ${importedBlob} != upstream ${row.blob}`);

    const changedSinceImport = history.length > 1;
    if (!changedSinceImport && existsSync(`${repoRoot}/${path}`)) {
      const working = git(repoRoot, ['hash-object', '--no-filters', path]);
      if (working !== row.blob) problems.push(`working tree file hashes to ${working}, not ${row.blob}`);
    }
    if (upstreamDir && existsSync(`${upstreamDir}/${row.repo}/.git`)) {
      try {
        const upstreamBlob = git(`${upstreamDir}/${row.repo}`, [
          'rev-parse',
          `${row.commit}:${row.upstreamPath}`,
        ]);
        if (upstreamBlob !== row.blob)
          problems.push(`upstream clone has ${upstreamBlob} for ${row.upstreamPath}`);
      } catch {
        // The clone may be shallow at another commit; the recorded blob id still was checked above.
      }
    }
    return { row, path, problems, changedSinceImport };
  });
}

/** Reads UPSTREAM.md and runs verifyImports; prints one line per file and returns true when all match. */
export function runVerifyImports({ repoRoot, stackPrefix, upstreamFile, upstreamDir, log = console.log }) {
  const rows = parseUpstreamTable(readFileSync(upstreamFile, 'utf8'));
  if (rows.length === 0) {
    log('IMPORTS MISMATCH: no rows found in UPSTREAM.md');
    return false;
  }
  if (isShallowRepository(repoRoot)) {
    log('IMPORTS UNVERIFIED: this is a shallow clone; run `git fetch --unshallow` and try again');
    return false;
  }
  const results = verifyImports({ repoRoot, stackPrefix, rows, upstreamDir });
  for (const { row, problems, changedSinceImport } of results) {
    const state =
      problems.length > 0 ? 'MISMATCH' : changedSinceImport ? 'ok (changed later by team commits)' : 'ok';
    log(`${row.blob.slice(0, 12)}  ${row.repo}@${row.commit}  ${row.file}  ${state}`);
    for (const problem of problems) log(`    ${problem}`);
  }
  const bad = results.filter((r) => r.problems.length > 0).length;
  log(
    bad === 0
      ? `IMPORTS MATCH (${results.length} files)`
      : `IMPORTS MISMATCH (${bad} of ${results.length} files)`,
  );
  return bad === 0;
}
