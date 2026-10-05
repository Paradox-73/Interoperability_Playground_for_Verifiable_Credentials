#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * `npm run docs:check`: checks the documentation set.
 *
 * 1. Every relative link in a tracked Markdown file resolves to a file or folder, and a `#fragment` to a
 *    heading of the target (GitHub's anchor rules). Links into git-ignored output (the matrices' `runs/`
 *    folders, published as build artifacts) are allowed when the folder is ignored.
 * 2. The documents in REQUIRED_SECTIONS exist and have those headings.
 * 3. Every public entry of docs/gaps/gaps.json has an issue draft docs/gaps/issues/NN-<repo>-<slug>.md with
 *    repository, version, steps, expected, actual, a case id and a date; every draft belongs to a gap.
 * 4. An entry marked `"disclosure": "private"` has no draft and no detail: only its id, the title
 *    "Reported privately", repository, severity and empty cells.
 * 5. Every `npm run <script>` in README.md, CONTRIBUTING.md and docs/ exists in package.json.
 *
 * Exit code 0 when everything holds; otherwise each problem is printed with its file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Documents that must exist, with the headings each must have (level 2 unless written otherwise). */
export const REQUIRED_SECTIONS = {
  'README.md': [
    'Status',
    'Quick start (reference mode, no Docker)',
    'Commands',
    'Flows',
    'Interoperability matrix and gaps',
  ],
  'docs/README.md': ['Documents'],
  'docs/architecture.md': ['Components', 'One run end to end', 'Where traffic is recorded'],
  'docs/setup.md': ['Run modes', 'Local Inji stack', 'One-command bundle', 'Troubleshooting'],
  'docs/flows.md': ['Issuance', 'Presentation', 'Inji Web through Mimoto'],
  'docs/api.md': ['REST', 'WebSocket', 'Hosted reference endpoints'],
  'docs/test-data.md': ['Identities', 'Keys and DIDs', 'Credentials'],
  'docs/extending.md': ['Add a role', 'Test it'],
  'docs/demo/README.md': ['Before recording', 'Script'],
  'docs/gaps/README.md': ['Gaps', 'Reported privately'],
  'docs/adr/README.md': ['Records'],
};

/** Fields every issue draft must carry. */
const DRAFT_FIELDS = [
  ['repository', /^\*\*Repository:\*\* \S/m],
  ['version', /^\*\*Version:\*\* \S/m],
  ['case id', /^\*\*Case:\*\* \S/m],
  ['date', /^\*\*Date:\*\* \d{4}-\d{2}-\d{2}/m],
  ['steps', /^## Steps\s*\n+\s*1\. \S/m],
  ['expected', /^## Expected\s*\n+\S/m],
  ['actual', /^## Actual\s*\n+\S/m],
];

const problems = [];
const problem = (file, message) => problems.push(`${file}: ${message}`);

function trackedMarkdown() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.md'], {
    cwd: root,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.includes('node_modules/') && existsSync(join(root, line)));
}

function ignored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** GitHub heading anchors of a Markdown file (duplicates get -1, -2, ...). */
const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const anchors = new Set();
  const seen = new Map();
  let fenced = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const slug = match[1]
      .replace(/`/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  for (const match of readFileSync(file, 'utf8').matchAll(/<a\s+(?:name|id)="([^"]+)"/g))
    anchors.add(match[1]);
  anchorCache.set(file, anchors);
  return anchors;
}

/** Links of a Markdown file outside code blocks and inline code. */
function linksOf(text) {
  const links = [];
  let fenced = false;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const visible = line.replace(/`[^`]*`/g, '');
    for (const match of visible.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g))
      links.push({ target: match[1], line: index + 1 });
    for (const match of visible.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/g))
      links.push({ target: match[1], line: index + 1 });
  });
  return links;
}

function checkLinks(files) {
  for (const file of files) {
    const absolute = join(root, file);
    for (const { target, line } of linksOf(readFileSync(absolute, 'utf8'))) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const [rawPath, fragment] = target.split('#');
      const path = decodeURIComponent(rawPath ?? '');
      const destination = path ? resolve(dirname(absolute), path) : absolute;
      if (!normalize(destination).startsWith(normalize(root))) {
        problem(`${file}:${line}`, `link leaves the repository: ${target}`);
        continue;
      }
      if (!existsSync(destination)) {
        if (!ignored(relative(root, destination))) problem(`${file}:${line}`, `broken link: ${target}`);
        continue;
      }
      if (fragment && statSync(destination).isFile() && destination.endsWith('.md')) {
        if (!anchorsOf(destination).has(decodeURIComponent(fragment).toLowerCase()))
          problem(`${file}:${line}`, `no heading for #${fragment} in ${relative(root, destination)}`);
      }
    }
  }
}

function checkSections() {
  for (const [file, headings] of Object.entries(REQUIRED_SECTIONS)) {
    const path = join(root, file);
    if (!existsSync(path)) {
      problem(file, 'required document is missing');
      continue;
    }
    const present = new Set(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => /^#{1,6}\s+(.*?)\s*$/.exec(line)?.[1])
        .filter(Boolean),
    );
    for (const heading of headings) if (!present.has(heading)) problem(file, `missing section "${heading}"`);
  }
}

function checkGaps() {
  const register = JSON.parse(readFileSync(join(root, 'docs/gaps/gaps.json'), 'utf8'));
  const issuesDir = join(root, 'docs/gaps/issues');
  const drafts = existsSync(issuesDir) ? readdirSync(issuesDir).filter((name) => name.endsWith('.md')) : [];
  const draftFor = (id) => drafts.filter((name) => name.startsWith(`${id.slice(1).padStart(2, '0')}-`));
  const ids = new Set(register.map((gap) => gap.id));
  for (const gap of register) {
    const files = draftFor(gap.id);
    if (gap.disclosure === 'private') {
      if (files.length > 0)
        problem(
          `docs/gaps/issues/${files[0]}`,
          `${gap.id} is reported privately; no draft may be in the repository`,
        );
      const extra = Object.keys(gap).filter(
        (key) => !['id', 'title', 'repository', 'severity', 'cells', 'disclosure'].includes(key),
      );
      if (gap.title !== 'Reported privately')
        problem('docs/gaps/gaps.json', `${gap.id}: a private entry is titled "Reported privately"`);
      if (extra.length > 0)
        problem('docs/gaps/gaps.json', `${gap.id}: a private entry has no ${extra.join(', ')}`);
      if (gap.cells?.length) problem('docs/gaps/gaps.json', `${gap.id}: a private entry names no cells`);
      continue;
    }
    if (files.length === 0) {
      problem('docs/gaps/issues/', `no issue draft for ${gap.id} (${gap.title})`);
      continue;
    }
    if (files.length > 1)
      problem('docs/gaps/issues/', `${gap.id} has ${files.length} drafts: ${files.join(', ')}`);
    const repoSlug = gap.repository.split('/').pop();
    if (!files[0].startsWith(`${gap.id.slice(1).padStart(2, '0')}-${repoSlug}-`))
      problem(
        `docs/gaps/issues/${files[0]}`,
        `name it ${gap.id.slice(1).padStart(2, '0')}-${repoSlug}-<slug>.md`,
      );
    const text = readFileSync(join(issuesDir, files[0]), 'utf8');
    if (!text.includes(`(${gap.id})`) && !text.includes(`${gap.id}:`))
      problem(`docs/gaps/issues/${files[0]}`, `does not name ${gap.id}`);
    for (const [name, pattern] of DRAFT_FIELDS)
      if (!pattern.test(text)) problem(`docs/gaps/issues/${files[0]}`, `missing ${name}`);
  }
  for (const name of drafts) {
    const id = `G${Number(name.slice(0, 2))}`;
    if (!ids.has(id)) problem(`docs/gaps/issues/${name}`, `no gap ${id} in docs/gaps/gaps.json`);
  }
}

function checkCommands() {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  const files = [
    'README.md',
    'CONTRIBUTING.md',
    ...trackedMarkdown().filter((file) => file.startsWith('docs/')),
  ];
  for (const file of new Set(files)) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const match of readFileSync(path, 'utf8').matchAll(/npm run ([a-z][\w:-]*)/g)) {
      if (!(match[1] in scripts)) problem(file, `npm run ${match[1]}: no such script in package.json`);
    }
  }
}

const files = trackedMarkdown();
checkLinks(files);
checkSections();
checkGaps();
checkCommands();

if (problems.length > 0) {
  for (const line of problems) console.error(`docs:check: ${line}`);
  console.error(
    `docs:check: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${files.length} Markdown files`,
  );
  process.exit(1);
}
console.log(
  `docs:check: ${files.length} Markdown files, links, required sections, gap drafts and commands OK`,
);
