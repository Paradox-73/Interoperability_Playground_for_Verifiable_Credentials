// SPDX-License-Identifier: MIT
// The local replay of the nightly workflow (scripts/nightly-replay.mjs): job order, step conditions and env,
// checked against the committed workflow so an edit that the replay cannot run fails here first.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/env.mjs';
import { evaluateIf, expand, jobEnv, jobOrder, parseArgs } from '../../../../scripts/nightly-replay.mjs';

const workflow = parse(readFileSync(join(REPO_ROOT, '.github/workflows/interop-nightly.yml'), 'utf8'));
const context = { workspace: '/work' };

describe('nightly replay', () => {
  it('runs the reference job before the live job that needs it', () => {
    expect(jobOrder(workflow.jobs)).toEqual(['reference', 'live']);
    expect(() => jobOrder({ a: { needs: 'b' }, b: { needs: ['a'] } })).toThrow(/need each other/);
  });

  it('evaluates every if: of the workflow', () => {
    const conditions = Object.values(workflow.jobs).flatMap((job) =>
      job.steps.map((step) => step.if).filter(Boolean),
    );
    expect(conditions.length).toBeGreaterThan(0);
    for (const condition of conditions) {
      expect(() => evaluateIf(condition, { jobFailed: false, outcomes: {} })).not.toThrow();
    }
  });

  it('fails the live job only when a matrix step failed', () => {
    const gate = workflow.jobs.live.steps.find(
      (step) => step.name === 'fail when a live matrix differed from its spec',
    );
    const ok = { jobFailed: false, outcomes: { core: 'success', holder: 'success' } };
    expect(evaluateIf(gate.if, ok)).toBe(false);
    expect(evaluateIf(gate.if, { ...ok, outcomes: { core: 'success', holder: 'failure' } })).toBe(true);
    expect(evaluateIf('always()', { jobFailed: true, outcomes: {} })).toBe(true);
    expect(evaluateIf(undefined, { jobFailed: true, outcomes: {} })).toBe(false);
    expect(evaluateIf('failure()', { jobFailed: true, outcomes: {} })).toBe(true);
    expect(() => evaluateIf('github.event_name == "push"', ok)).toThrow(/unsupported/);
  });

  it('expands the workspace and swaps the Linux bridge address off Linux', () => {
    expect(expand('${{ github.workspace }}/run', context)).toBe('/work/run');
    const quiet = () => {};
    const linux = jobEnv(workflow.jobs.live, context, {}, 'linux', quiet);
    expect(linux.PLAYGROUND_RUN_DIR).toBe('/work/run');
    expect(linux.PLAYGROUND_REF_UPSTREAM).toBe('http://172.17.0.1:28100');
    const windows = jobEnv(workflow.jobs.live, context, {}, 'win32', quiet);
    expect(windows.PLAYGROUND_REF_UPSTREAM).toBe('http://host.docker.internal:28100');
    expect(
      jobEnv(workflow.jobs.live, context, { PLAYGROUND_REF_UPSTREAM: 'x' }, 'win32', quiet)
        .PLAYGROUND_REF_UPSTREAM,
    ).toBe('x');
  });

  it('parses its arguments', () => {
    expect(parseArgs(['--job', 'live', '--env', 'A=b=c', '--skip-install'])).toMatchObject({
      jobs: ['live'],
      env: { A: 'b=c' },
      skipInstall: true,
    });
    expect(() => parseArgs(['--env', 'novalue'])).toThrow(/NAME=value/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
  });

  it('every live step that starts the server sets the public URL the holder-web cells need', () => {
    const start = workflow.jobs.live.steps.find(
      (step) => step.name === 'start the playground server against the stack',
    );
    expect(start.env.PLAYGROUND_PUBLIC_URL).toBe('https://ref.ps02.test');
  });
});
