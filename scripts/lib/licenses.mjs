// SPDX-License-Identifier: MIT
/**
 * Licence audit of what the playground ships: every npm package in the production dependency tree of the
 * workspaces (`npm ls --omit=dev --all`), which is what the playground image contains, plus the container
 * images of the Inji stack. Development-only packages are counted separately; they are not distributed.
 *
 * A licence passes when it is OSI-approved. SPDX expressions are evaluated: `A OR B` passes when one side
 * passes, `A AND B` when both do. Packages without an SPDX `license` field are resolved from their licence
 * file (FILE_LICENSES), checked by hand on the date in the comment.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** OSI-approved licences that occur in this dependency tree (https://opensource.org/licenses). */
export const OSI_APPROVED = new Set([
  '0BSD',
  'Apache-2.0',
  'Artistic-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'EPL-2.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'PostgreSQL',
  'Python-2.0',
  'Unlicense',
  'W3C',
  'W3C-20150513',
  'Zlib',
]);

/**
 * Packages whose package.json has no SPDX licence, by name: the licence their licence file states
 * (read on 2026-10-05). The two JSON-LD context packages hold W3C context data under the W3C Software and
 * Document License and their code under BSD-3-Clause.
 */
const FILE_LICENSES = {
  '@digitalbazaar/credentials-context': 'W3C-20150513 AND BSD-3-Clause',
  'did-context': 'W3C-20150513 AND BSD-3-Clause',
  'veres-one-context': 'BSD-3-Clause',
  'base45-web': 'Apache-2.0',
  khroma: 'MIT',
};

/** Container images of deploy/inji-stack/compose.yaml and the licence of the software each one runs. */
export const IMAGE_LICENSES = [
  {
    image: 'injistack/inji-certify-with-plugins:0.14.0',
    license: 'MPL-2.0',
    source: 'https://github.com/inji/inji-certify',
  },
  {
    image: 'injistack/inji-verify-service:0.18.2',
    license: 'MPL-2.0',
    source: 'https://github.com/inji/inji-verify',
  },
  {
    image: 'injistack/inji-verify-ui:0.18.2',
    license: 'MPL-2.0',
    source: 'https://github.com/inji/inji-verify',
  },
  { image: 'injistack/mimoto:0.22.0', license: 'MPL-2.0', source: 'https://github.com/inji/mimoto' },
  { image: 'injistack/inji-web:0.17.0', license: 'MPL-2.0', source: 'https://github.com/inji/inji-web' },
  { image: 'postgres:15', license: 'PostgreSQL', source: 'https://www.postgresql.org/about/licence/' },
  { image: 'nginx:stable', license: 'BSD-2-Clause', source: 'https://nginx.org/LICENSE' },
];

/** True when an SPDX expression is satisfied by OSI-approved licences. */
export function osiApproved(expression) {
  const text = String(expression ?? '').trim();
  if (!text) return false;
  const unwrap = (value) => {
    let current = value.trim();
    while (current.startsWith('(') && current.endsWith(')') && balanced(current.slice(1, -1)))
      current = current.slice(1, -1).trim();
    return current;
  };
  const split = (value, operator) => {
    const parts = [];
    let depth = 0;
    let start = 0;
    const token = ` ${operator} `;
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      else if (depth === 0 && value.startsWith(token, index)) {
        parts.push(value.slice(start, index));
        start = index + token.length;
        index += token.length - 1;
      }
    }
    parts.push(value.slice(start));
    return parts;
  };
  const evaluate = (value) => {
    const inner = unwrap(value);
    const alternatives = split(inner, 'OR');
    if (alternatives.length > 1) return alternatives.some(evaluate);
    const required = split(inner, 'AND');
    if (required.length > 1) return required.every(evaluate);
    return OSI_APPROVED.has(inner.replace(/\+$/, ''));
  };
  return evaluate(text);
}

function balanced(text) {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function licenseOf(name, node) {
  if (typeof node.license === 'string' && !node.license.startsWith('SEE LICENSE')) return node.license;
  if (node.license && typeof node.license === 'object' && typeof node.license.type === 'string')
    return node.license.type;
  return FILE_LICENSES[name];
}

function repositoryOf(path) {
  try {
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
    const repository =
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const url = repository ?? manifest.homepage;
    return url
      ? String(url)
          .replace(/^git\+/, '')
          .replace(/\.git$/, '')
          .replace(/^git:\/\//, 'https://')
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * npm as a command without a shell: through the npm CLI script npm itself runs (npm_execpath), else next to
 * node (Windows only starts npm.cmd through a shell), else `npm` on the PATH.
 */
function npmCommand(args) {
  const script =
    process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath)
      ? process.env.npm_execpath
      : join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return existsSync(script) ? [process.execPath, [script, ...args]] : ['npm', args];
}

/**
 * Installed packages of `npm ls`, one entry per name and version; workspace packages are left out.
 *
 * Uses `--parseable` (one installed path per line) and reads each package's own package.json. The JSON
 * form needs `--long` for paths and licences, and `npm ls --long` of npm 11.17 fails on this tree since
 * mermaid 12 ("Cannot read properties of undefined (reading 'description')", 2026-10-06).
 */
function packagesOf(root, omitDev) {
  const args = ['ls', '--all', '--parseable', ...(omitDev ? ['--omit=dev'] : [])];
  let text;
  try {
    text = execFileSync(...npmCommand(args), {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    // npm ls exits 1 for extraneous or missing optional packages but still prints the tree.
    text = error.stdout ?? '';
  }
  const found = new Map();
  for (const path of text.split(/\r?\n/).map((line) => line.trim())) {
    // The root and the workspaces are this repository's own code; only installed packages count.
    if (!path || !/[\\/]node_modules[\\/]/.test(path)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const { name, version } = manifest;
    if (!name || !version || name.startsWith('@inji-playground/')) continue;
    const key = `${name}@${version}`;
    if (!found.has(key)) {
      found.set(key, { name, version, license: licenseOf(name, manifest) ?? 'UNKNOWN', path });
    }
  }
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/**
 * @returns {{ production: Array<{name:string,version:string,license:string,osi:boolean,repository?:string}>,
 *   developmentOnly: Array<{name:string,version:string,license:string,osi:boolean}>,
 *   images: typeof IMAGE_LICENSES, failures: string[] }}
 */
export function auditLicenses(root) {
  const production = packagesOf(root, true).map((entry) => ({
    name: entry.name,
    version: entry.version,
    license: entry.license,
    osi: osiApproved(entry.license),
    repository: repositoryOf(entry.path),
  }));
  const shipped = new Set(production.map((entry) => `${entry.name}@${entry.version}`));
  const developmentOnly = packagesOf(root, false)
    .filter((entry) => !shipped.has(`${entry.name}@${entry.version}`))
    .map((entry) => ({
      name: entry.name,
      version: entry.version,
      license: entry.license,
      osi: osiApproved(entry.license),
    }));
  const failures = [
    ...production
      .filter((entry) => !entry.osi)
      .map((entry) => `${entry.name}@${entry.version}: ${entry.license}`),
    ...IMAGE_LICENSES.filter((entry) => !osiApproved(entry.license)).map(
      (entry) => `${entry.image}: ${entry.license}`,
    ),
  ];
  return { production, developmentOnly, images: IMAGE_LICENSES, failures };
}

/** Licence -> number of packages, most frequent first. */
export function countByLicense(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** THIRD_PARTY_LICENSES.md: every shipped package and image with its licence. */
export function renderThirdPartyLicenses(audit, date) {
  const md = (text) => String(text).replace(/\|/g, '\\|');
  const lines = [
    '# Third-party licences',
    '',
    `Generated on ${date} by \`npm run test:report\` (\`scripts/lib/licenses.mjs\`). The playground itself is MIT-licensed ([LICENSE](LICENSE)); the files imported unchanged from Inji repositories under \`deploy/inji-stack/\` keep their MPL-2.0 licence ([deploy/inji-stack/UPSTREAM.md](deploy/inji-stack/UPSTREAM.md)).`,
    '',
    `Every licence below is OSI-approved${audit.failures.length ? ' except the ones listed under "Not OSI-approved"' : ''}. Development-only packages (build, test and lint tools: ${audit.developmentOnly.length} packages) are not distributed and not listed.`,
    '',
    '## Container images of the Inji stack',
    '',
    '| Image | Licence of the software | Source |',
    '| ----- | ----------------------- | ------ |',
    ...audit.images.map((entry) => `| \`${entry.image}\` | ${entry.license} | <${entry.source}> |`),
    '',
    "Base images contain operating system packages under their own licences; see each image's documentation.",
    '',
    `## npm packages in the playground image (${audit.production.length})`,
    '',
    '| Licence | Packages |',
    '| ------- | -------- |',
    ...countByLicense(audit.production).map(([license, count]) => `| ${md(license)} | ${count} |`),
    '',
    '| Package | Version | Licence | Source |',
    '| ------- | ------- | ------- | ------ |',
    ...audit.production.map(
      (entry) =>
        `| \`${entry.name}\` | ${entry.version} | ${md(entry.license)} | ${entry.repository ? `<${entry.repository}>` : '-'} |`,
    ),
  ];
  if (audit.failures.length > 0)
    lines.push('', '## Not OSI-approved', '', ...audit.failures.map((failure) => `- ${failure}`));
  lines.push('');
  return lines.join('\n');
}
