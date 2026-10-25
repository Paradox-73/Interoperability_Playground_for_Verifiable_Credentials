// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
// Pure helpers of the stack scripts: smoke verdict, environment, compose arguments, compose ps parsing,
// UPSTREAM.md parsing and the import check against this repository's own history.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeArgs, parseComposePs } from '../lib/docker.mjs';
import { ALL_PROFILES, REPO_ROOT, UPSTREAM_FILE, runDir, selectedProfiles } from '../lib/env.mjs';
import { parseBody } from '../lib/http.mjs';
import { isShallowRepository, parseUpstreamTable, verifyImports } from '../lib/imports.mjs';
import { probesFor } from '../lib/services.mjs';
import { smokeVerdict } from '../lib/smoke.mjs';
import { contentTypeFor, presentationDefinition } from '../lib/verify.mjs';

const pass = (id) => ({ id, label: id, ok: true, detail: '' });

describe('smokeVerdict', () => {
  it('passes when every check passes', () => {
    expect(smokeVerdict([pass('a'), pass('b')])).toMatchObject({ pass: true, line: 'SMOKE PASS' });
  });

  it('tolerates only gap G2: Inji Verify answering INVALID for the Certify ldp_vc', () => {
    const g2 = { id: 'verify-ldp_vc', label: 'x', ok: false, detail: '', verificationStatus: 'INVALID' };
    expect(smokeVerdict([pass('a'), g2]).line).toBe('SMOKE PASS (known failure: G2)');
  });

  it('fails when the ldp_vc verification errors instead of answering INVALID', () => {
    const timeout = { id: 'verify-ldp_vc', label: 'x', ok: false, detail: 'timeout' };
    expect(smokeVerdict([timeout])).toMatchObject({ pass: false, line: 'SMOKE FAIL (verify-ldp_vc)' });
  });

  it('fails when anything else fails, even next to G2', () => {
    const g2 = { id: 'verify-ldp_vc', label: 'x', ok: false, detail: '', verificationStatus: 'INVALID' };
    const other = { id: 'verify-vc+sd-jwt', label: 'y', ok: false, detail: '' };
    expect(smokeVerdict([g2, other]).pass).toBe(false);
  });
});

describe('environment', () => {
  it('defaults the run directory to <repo>/run, absolute with forward slashes', () => {
    expect(runDir({})).toBe(`${REPO_ROOT.replace(/\\/g, '/')}run`);
  });

  it('keeps an absolute PLAYGROUND_RUN_DIR', () => {
    expect(runDir({ PLAYGROUND_RUN_DIR: 'E:/x/run' })).toMatch(/x\/run$/);
  });

  it('starts every profile by default, none on request, and rejects unknown names', () => {
    expect(selectedProfiles({})).toEqual([...ALL_PROFILES]);
    expect(selectedProfiles({ PLAYGROUND_STACK_PROFILES: 'none' })).toEqual([]);
    expect(selectedProfiles({ PLAYGROUND_STACK_PROFILES: 'verify-ui' })).toEqual(['verify-ui']);
    expect(() => selectedProfiles({ PLAYGROUND_STACK_PROFILES: 'holder-wbe' })).toThrow(/holder-wbe/);
  });

  it('probes only the services of the selected profiles', () => {
    const urls = {
      certifyNginx: 'c',
      tlsFront: 't',
      verifyService: 'v',
      mimoto: 'm',
      injiWeb: 'w',
      verifyUi: 'u',
    };
    expect(probesFor(urls, []).map((p) => p.service)).toEqual(['certify', 'tls-front', 'verify-service']);
    expect(probesFor(urls, ['verify-ui']).map((p) => p.service)).toContain('verify-ui');
  });
});

describe('docker compose helpers', () => {
  it('builds project, files and profiles', () => {
    const args = composeArgs({ profiles: ['holder-web'], hostMode: false });
    expect(args.slice(0, 3)).toEqual(['compose', '-p', 'ps02-inji']);
    expect(args.slice(-2)).toEqual(['--profile', 'holder-web']);
    expect(args.filter((a) => a.endsWith('compose.host.yaml'))).toHaveLength(0);
    expect(composeArgs({ allProfiles: true }).slice(-2)).toEqual(['--profile', '*']);
  });

  it('parses compose ps output as JSON lines and as a JSON array', () => {
    const row = { Service: 'certify', State: 'running', Health: 'healthy', ExitCode: 0 };
    const expected = [{ service: 'certify', state: 'running', health: 'healthy', exitCode: 0 }];
    expect(parseComposePs(`${JSON.stringify(row)}\n`)).toEqual(expected);
    expect(parseComposePs(JSON.stringify([row]))).toEqual(expected);
    expect(parseComposePs('')).toEqual([]);
  });

  it('parses JSON bodies and keeps text bodies', () => {
    expect(parseBody('{"a":1}')).toEqual({ a: 1 });
    expect(parseBody('eyJ.x.y~')).toBe('eyJ.x.y~');
  });
});

describe('Inji Verify request helpers', () => {
  it('picks the Content-Type verify-service uses to choose the verifier', () => {
    expect(contentTypeFor('vc+sd-jwt')).toBe('application/vc+sd-jwt');
    expect(contentTypeFor('ldp_vc')).toBe('application/ld+json');
  });

  it('asks for a credential by type in the presentation definition', () => {
    const pd = presentationDefinition('pd', 'FarmerCredential');
    expect(pd.input_descriptors[0].constraints.fields[0].filter.contains.const).toBe('FarmerCredential');
  });
});

describe('UPSTREAM.md and the import commits', () => {
  const rows = parseUpstreamTable(readFileSync(UPSTREAM_FILE, 'utf8'));
  // A shallow clone (the default CI checkout) has no import commits to look at.
  const shallow = isShallowRepository(REPO_ROOT);
  // About 60 git processes; slow on a busy Windows machine.
  const GIT_TIMEOUT_MS = 60_000;

  it('lists the imported files with commit and blob id', () => {
    expect(rows.length).toBeGreaterThanOrEqual(21);
    for (const row of rows) {
      expect(row.repo).toMatch(/^(inji-certify|mimoto|inji-verify)$/);
      expect(row.commit).toMatch(/^[0-9a-f]{7}$/);
      expect(row.blob).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it.skipIf(shallow)(
    'finds every file unchanged in its import commit',
    () => {
      const results = verifyImports({ repoRoot: REPO_ROOT, stackPrefix: 'deploy/inji-stack', rows });
      expect(results.filter((r) => r.problems.length > 0)).toEqual([]);
    },
    GIT_TIMEOUT_MS,
  );

  it.skipIf(shallow)('reports a wrong blob id', () => {
    const [first] = rows;
    const [result] = verifyImports({
      repoRoot: REPO_ROOT,
      stackPrefix: 'deploy/inji-stack',
      rows: [{ ...first, blob: '0'.repeat(40) }],
    });
    expect(result.problems.join(' ')).toMatch(/blob at import/);
  });
});
