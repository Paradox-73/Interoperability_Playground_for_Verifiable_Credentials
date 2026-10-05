/**
 * Matrix specs, the duration estimate and budget, rendering, and a small matrix run against an
 * in-process reference server (port 28600-28699): verdicts compared with the spec, exit code 1 on a
 * mismatch, a redacted export per cell.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LIVE_BUDGET_SECONDS,
  PlaygroundClient,
  budgetProblem,
  estimateDuration,
  exitCodeFor,
  parseCli,
  parseSpec,
  renderJunit,
  renderMarkdown,
  resolveSpecPath,
  runMatrix,
  startReferenceServer,
  type CellResult,
  type LoadedSpec,
  type MatrixResult,
  type ReferenceServer,
} from '../src/index.js';

const specsDir = fileURLToPath(new URL('../specs/', import.meta.url));

const SMALL = `
name: small
mode: reference
defaults: { issuer: ref-issuer, wallet: ref-wallet, verifier: ref-verifier }
cases:
  - uniqueIdentifier: TC_PG_HAPPY_01
    format: vc+sd-jwt
  - uniqueIdentifier: TC_PG_TAMPER_01
    format: vc+sd-jwt
    vpProfile: final-1.0
    scenario: kb-wrong-aud
  - uniqueIdentifier: TC_PG_NS_01
    wallet: mobile-wallet
    format: ldp_vc
    scenario: bad-signature
    verdict: not-supported
`;

describe('spec parsing', () => {
  it('applies defaults: roles, profile pairs, happy path, verdict pass', () => {
    const spec = parseSpec(SMALL, 'small.yaml');
    expect(spec).toMatchObject({ name: 'small', mode: 'reference', source: 'small.yaml' });
    expect(spec.cases[0]).toEqual({
      id: 'TC_PG_HAPPY_01',
      issuer: 'ref-issuer',
      wallet: 'ref-wallet',
      verifier: 'ref-verifier',
      format: 'vc+sd-jwt',
      vciProfile: 'draft13',
      vpProfile: 'inji-draft',
      scenario: 'happy',
      verdict: 'pass',
    });
    // OpenID4VP 1.0 pairs with OpenID4VCI 1.0.
    expect(spec.cases[1]).toMatchObject({
      vpProfile: 'final-1.0',
      vciProfile: 'v1',
      scenario: 'kb-wrong-aud',
    });
    expect(spec.cases[2]).toMatchObject({ wallet: 'mobile-wallet', verdict: 'not-supported' });
  });

  const problemsOf = (text: string): string => {
    try {
      parseSpec(text, 'bad.yaml');
    } catch (error) {
      return (error as Error).message;
    }
    return '';
  };

  it('names every field problem with its path', () => {
    const message = problemsOf(`
name: bad
cases:
  - uniqueIdentifier: CASE-1
    format: pdf
    issuer: ref-issuer
    wallet: ref-wallet
    verifier: ref-verifier
`);
    expect(message).toMatch(/^bad\.yaml: invalid matrix spec/);
    expect(message).toContain('cases.0.uniqueIdentifier: must look like TC_PG_<AREA>_<NN>');
    expect(message).toContain('cases.0.format');
    expect(() => parseSpec('cases: [', 'broken.yaml')).toThrow(/broken\.yaml: not valid YAML/);
  });

  it('refuses missing roles and duplicate case ids', () => {
    const message = problemsOf(`
name: bad
cases:
  - uniqueIdentifier: TC_PG_X_01
    format: ldp_vc
  - uniqueIdentifier: TC_PG_X_01
    format: ldp_vc
    issuer: ref-issuer
    wallet: ref-wallet
    verifier: ref-verifier
`);
    expect(message).toContain('cases.0.issuer: no issuer: set it on the case or in defaults');
    expect(message).toContain('cases.1.uniqueIdentifier: duplicate case id TC_PG_X_01');
  });

  it('resolves spec names to the specs folder and keeps paths', () => {
    expect(resolveSpecPath('reference', '/x/specs/')).toBe('/x/specs/reference.yaml');
    expect(resolveSpecPath('my/spec.yaml', '/x/specs')).toBe('my/spec.yaml');
    expect(resolveSpecPath('local.yml', '/x/specs')).toBe('local.yml');
  });

  it.each(['reference', 'live-core', 'live-holder-web', 'demo'])('specs/%s.yaml is a valid spec', (name) => {
    const spec = parseSpec(readFileSync(`${specsDir}${name}.yaml`, 'utf8'), `${name}.yaml`);
    expect(spec.cases.length).toBeGreaterThan(0);
  });

  it('the reference spec has at least 30 cells, all on the reference roles or not-supported', () => {
    const spec = parseSpec(readFileSync(`${specsDir}reference.yaml`, 'utf8'));
    expect(spec.mode).toBe('reference');
    expect(spec.cases.length).toBeGreaterThanOrEqual(30);
    expect(spec.cases.filter((entry) => entry.verdict === 'not-supported')).toHaveLength(4);
    for (const entry of spec.cases.filter((e) => e.verdict === 'pass')) {
      expect([entry.issuer, entry.wallet, entry.verifier]).toEqual([
        'ref-issuer',
        'ref-wallet',
        'ref-verifier',
      ]);
    }
    // vp-replay replays an earlier happy presentation, so every replay cell comes after its happy cell.
    const index = (scenario: string, format: string, profile: string) =>
      spec.cases.findIndex((e) => e.scenario === scenario && e.format === format && e.vpProfile === profile);
    for (const replay of spec.cases.filter((e) => e.scenario === 'vp-replay')) {
      expect(index('happy', replay.format, replay.vpProfile)).toBeLessThan(
        index('vp-replay', replay.format, replay.vpProfile),
      );
    }
  });
});

describe('duration estimate and the live budget', () => {
  const live = (cases: number, cellSeconds?: number): LoadedSpec => ({
    name: 'live',
    mode: 'live',
    source: 'live.yaml',
    ...(cellSeconds ? { cellSeconds } : {}),
    cases: Array.from({ length: cases }, (_, i) => ({
      id: `TC_PG_LIVE_${String(i + 1).padStart(2, '0')}`,
      issuer: 'inji-certify',
      wallet: 'ref-wallet',
      verifier: 'inji-verify',
      format: 'ldp_vc' as const,
      vciProfile: 'draft13' as const,
      vpProfile: 'inji-draft' as const,
      scenario: 'happy',
      verdict: 'pass' as const,
    })),
  });

  it('uses the last measured cell time, else the spec, else the mode default', () => {
    const previous = {
      spec: { name: 'live', source: 'live.yaml', mode: 'live' as const },
      cells: [{ durationMs: 30_000 }, { durationMs: 50_000 }] as CellResult[],
    };
    expect(estimateDuration(live(10, 90), previous)).toEqual({
      cells: 10,
      secondsPerCell: 40,
      totalSeconds: 400,
      basis: 'measured',
    });
    expect(estimateDuration(live(10, 90))).toMatchObject({
      secondsPerCell: 90,
      totalSeconds: 900,
      basis: 'spec',
    });
    expect(estimateDuration(live(10))).toMatchObject({ secondsPerCell: 60, basis: 'default' });
    // A reference run's timing says nothing about a live one.
    expect(
      estimateDuration(live(10), { ...previous, spec: { ...previous.spec, mode: 'reference' } }).basis,
    ).toBe('default');
  });

  it('refuses a live spec over 20 minutes unless forced; reference specs have no budget', () => {
    const long = live(25);
    const estimate = estimateDuration(long);
    expect(estimate.totalSeconds).toBeGreaterThan(LIVE_BUDGET_SECONDS);
    expect(budgetProblem(long, estimate, false)).toMatch(
      /estimated at 25 min 0 s .* over the 20-minute budget/,
    );
    expect(budgetProblem(long, estimate, true)).toBeUndefined();
    expect(budgetProblem(live(20), estimateDuration(live(20)), false)).toBeUndefined();
    const reference = { ...long, mode: 'reference' as const };
    expect(budgetProblem(reference, estimateDuration(reference), false)).toBeUndefined();
  });
});

describe('matrix run against an in-process reference server', () => {
  let server: ReferenceServer;
  let result: MatrixResult;
  const exported: string[] = [];

  beforeAll(async () => {
    server = await startReferenceServer({});
    result = await runMatrix(
      parseSpec(SMALL, 'small.yaml'),
      new PlaygroundClient(server.url, { pollMs: 20 }),
      {
        server: { reference: true },
        onExport: (cell, run) => {
          expect(run.redacted).toBe(true);
          exported.push(`${cell.case.id}:${run.run.runId}`);
        },
      },
    );
  }, 60_000);
  afterAll(() => server.close());

  it('compares every verdict and outcome with the spec', () => {
    expect(result.cells.map((cell) => [cell.case.id, cell.verdict, cell.outcome, cell.matches])).toEqual([
      ['TC_PG_HAPPY_01', 'pass', 'VALID', true],
      ['TC_PG_TAMPER_01', 'pass', 'INVALID', true],
      ['TC_PG_NS_01', 'not-supported', 'NOT_RUN', true],
    ]);
    // The expected outcome comes from the scenario catalogue when the spec leaves it out.
    expect(result.cells[1]?.expected).toBe('INVALID');
    expect(result.totals).toEqual({
      cells: 3,
      matched: 3,
      mismatched: 0,
      pass: 2,
      fail: 0,
      error: 0,
      notSupported: 1,
    });
    expect(exitCodeFor(result)).toBe(0);
    expect(exported.map((entry) => entry.split(':')[0])).toEqual([
      'TC_PG_HAPPY_01',
      'TC_PG_TAMPER_01',
      'TC_PG_NS_01',
    ]);
    expect(result.roles['ref-issuer']).toMatchObject({ name: 'Reference issuer', ecosystem: 'reference' });
    expect(result.server).toMatchObject({ reference: true, version: '0.1.0' });
  });

  it('exits 1 when a cell gives another verdict than its spec, and says why', async () => {
    // A spec that wrongly expects the reference verifier to accept a tampered presentation.
    const wrong = parseSpec(
      `
name: wrong
defaults: { issuer: ref-issuer, wallet: ref-wallet, verifier: ref-verifier }
cases:
  - uniqueIdentifier: TC_PG_TAMPER_01
    format: vc+sd-jwt
    scenario: kb-wrong-aud
    expected: VALID
  - uniqueIdentifier: TC_PG_X_01
    issuer: no-such-issuer
    format: vc+sd-jwt
`,
      'wrong.yaml',
    );
    const mismatched = await runMatrix(wrong, new PlaygroundClient(server.url, { pollMs: 20 }), {
      server: { reference: true },
    });
    expect(mismatched.cells[0]).toMatchObject({
      // The server judges the run against the scenario (pass); the spec expects another outcome.
      verdict: 'pass',
      outcome: 'INVALID',
      expected: 'VALID',
      matches: false,
    });
    expect(mismatched.cells[1]).toMatchObject({ matches: false, error: { code: 'cli.cell-failed' } });
    expect(mismatched.cells[1]?.error?.message).toMatch(/HTTP 400/);
    expect(exitCodeFor(mismatched)).toBe(1);
    expect(renderJunit(mismatched)).toContain(
      '<failure message="expected verdict pass (outcome VALID), got pass (outcome INVALID)"',
    );
  });

  it('reports a server that does not answer, with a hint', async () => {
    const client = new PlaygroundClient('http://127.0.0.1:9');
    await expect(client.version()).rejects.toThrow(
      /no playground server answers at http:\/\/127\.0\.0\.1:9.*--reference/,
    );
  });

  it('renders a dated Markdown matrix with versions, every cell and the reasons', () => {
    const markdown = renderMarkdown(result);
    expect(markdown).toMatch(
      /^# Compatibility matrix: small\n\nRun on \d{4}-\d{2}-\d{2}, \d{2}:\d{2}:\d{2} to \d{2}:\d{2}:\d{2} UTC/,
    );
    expect(markdown).toContain('**3 of 3 cells gave the verdict their spec expects**.');
    expect(markdown).toContain('| `ref-issuer` | Reference issuer | reference | 0.1.0 |');
    const rows = markdown.split('\n').filter((line) => line.startsWith('| TC_PG_'));
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain(
      '| vc+sd-jwt | v1 / final-1.0 | kb-wrong-aud | INVALID | INVALID | Pass | yes |',
    );
    expect(rows[2]).toContain('| Not supported (spec: Not supported) | yes |');
    expect(markdown).toContain('- TC_PG_NS_01: `compatibility.scenario.wallet-unsupported`');
    expect(markdown).toContain(`\`${result.cells[0]!.runId}\``);
  });

  it('renders JUnit XML with one test case per cell', () => {
    const xml = renderJunit(result);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<testsuite name="small" tests="3" failures="0"');
    expect(xml.match(/<testcase /g)).toHaveLength(3);
  });
});

describe('the workflow files', () => {
  it.each(['interop-nightly.yml', 'ci.yml'])('.github/workflows/%s is valid YAML', (name) => {
    const path = fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url));
    expect(() => parseYaml(readFileSync(path, 'utf8')) as unknown).not.toThrow();
  });
});

describe('parseCli', () => {
  it('requires a spec for matrix', () => {
    expect(() => parseCli(['matrix'])).toThrow(/matrix needs --spec/);
  });
});
