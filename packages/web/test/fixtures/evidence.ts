// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Synthetic answers of the evidence endpoints (`/api/runs`, `/api/metrics`, `/api/matrix`,
 * `/api/runs/{id}/report.json`, `/api/gaps`, `/api/scenarios`) for the matrix, history, report and tamper
 * tests. Shapes follow what the server returned for real reference runs on 2026-10-04; every value is
 * made up, and each object is parsed with its protocol schema so a contract change breaks the tests here.
 */
import {
  GapListSchema,
  MatrixSchema,
  MetricsSchema,
  RunListResponseSchema,
  RunReportDocumentSchema,
  ScenarioSpecSchema,
  type MatrixCell,
} from '@inji-playground/protocol';

export const GENERATED_AT = '2026-10-04T12:00:00.000Z';
const versions = { issuer: '0.1.0', wallet: '0.1.0', verifier: '0.1.0' };
const REF = { issuer: 'ref-issuer', wallet: 'ref-wallet', verifier: 'ref-verifier' } as const;

export const PASS_RUN = 'run-pass-0001';
export const FAIL_RUN = 'run-fail-0002';
export const BLOCKED_RUN = 'run-blocked-0003';

export const scenarios = ScenarioSpecSchema.array().parse([
  {
    id: 'happy',
    title: 'Happy path',
    description:
      'The issuer issues a valid credential, the wallet presents it unchanged, and the verifier must accept it.',
    expected: 'VALID',
    target: 'none',
    category: 'happy',
  },
  {
    id: 'expired',
    title: 'Expired credential ("Valid but expired")',
    description: 'The issuer signs a credential whose validity ended yesterday.',
    expected: 'EXPIRED',
    target: 'credential',
    category: 'tamper',
    formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'],
    requires: { issuer: ['ref-issuer'] },
    reference: 'VC Data Model 2.0 section 4.9 (validUntil)',
  },
  {
    id: 'kb-wrong-nonce',
    title: 'Key binding with the wrong nonce',
    description: "The holder's key binding JWT carries a nonce from another request.",
    expected: 'INVALID',
    target: 'presentation',
    category: 'tamper',
    formats: ['vc+sd-jwt', 'dc+sd-jwt'],
    requires: { wallet: ['ref-wallet'] },
    reference: 'RFC 9901 section 7.3 step 5f (nonce)',
  },
]);

export const runList = RunListResponseSchema.parse({
  total: 3,
  limit: 20,
  offset: 0,
  items: [
    {
      runId: BLOCKED_RUN,
      status: 'finished',
      mode: 'reference',
      config: {
        ...REF,
        wallet: 'mobile-wallet',
        format: 'ldp_vc',
        vciProfile: 'draft13',
        vpProfile: 'inji-draft',
        scenario: 'expired',
      },
      createdAt: '2026-10-04T11:02:00.000Z',
      startedAt: '2026-10-04T11:02:00.000Z',
      finishedAt: '2026-10-04T11:02:00.000Z',
      outcome: 'NOT_RUN',
      verdict: 'not-supported',
      error: {
        step: 'playground.admin',
        code: 'compatibility.scenario.wallet-unsupported',
        message: 'The scenario needs the wallet ref-wallet.',
      },
      versions: { ...versions, wallet: 'any' },
    },
    {
      runId: FAIL_RUN,
      status: 'finished',
      mode: 'reference',
      config: {
        ...REF,
        format: 'vc+sd-jwt',
        vciProfile: 'draft13',
        vpProfile: 'inji-draft',
        scenario: 'kb-wrong-nonce',
      },
      createdAt: '2026-10-04T11:01:00.000Z',
      startedAt: '2026-10-04T11:01:00.000Z',
      finishedAt: '2026-10-04T11:01:01.000Z',
      outcome: 'VALID',
      verdict: 'fail',
      error: {
        step: 'verifier.result',
        code: 'outcome.unexpected',
        message: 'The scenario "kb-wrong-nonce" expects INVALID; Reference verifier answered VALID.',
      },
      versions,
    },
    {
      runId: PASS_RUN,
      status: 'finished',
      mode: 'reference',
      config: {
        ...REF,
        format: 'vc+sd-jwt',
        vciProfile: 'draft13',
        vpProfile: 'inji-draft',
        scenario: 'happy',
      },
      createdAt: '2026-10-04T11:00:00.000Z',
      startedAt: '2026-10-04T11:00:00.000Z',
      finishedAt: '2026-10-04T11:00:01.000Z',
      outcome: 'VALID',
      verdict: 'pass',
      versions,
    },
  ],
});

export const emptyRunList = RunListResponseSchema.parse({ total: 0, limit: 20, offset: 0, items: [] });

const step = (name: string, label: string, p50Ms: number, p95Ms: number) => ({
  step: name,
  label,
  executed: 2,
  ok: 2,
  failed: 0,
  successRate: 1,
  duration: { count: 2, sumMs: p50Ms + p95Ms, p50Ms, p95Ms, maxMs: p95Ms },
});

export const metrics = MetricsSchema.parse({
  generatedAt: GENERATED_AT,
  window: { runs: 3, firstRunAt: '2026-10-04T11:00:00.000Z', lastRunAt: '2026-10-04T11:02:00.000Z' },
  verdicts: { pass: 1, fail: 1, error: 0, notSupported: 1 },
  successRate: 0.5,
  steps: [
    step('issuer.offer', 'Issuer prepares a credential offer for the wallet', 1, 4),
    step('credential', 'Wallet proves it holds its key and receives the credential', 3, 7),
  ],
  pairs: [],
  flows: [],
  credentialSizes: [],
});

const cell = (
  overrides: Partial<MatrixCell> & Pick<MatrixCell, 'id' | 'key' | 'status' | 'source'>,
): MatrixCell => ({
  counts: { runs: 0, pass: 0, fail: 0, error: 0, notSupported: 0 },
  reasons: [],
  gapIds: [],
  ...overrides,
});

export const matrix = MatrixSchema.parse({
  generatedAt: GENERATED_AT,
  playgroundVersion: '0.1.0',
  roles: [
    {
      id: 'ref-issuer',
      name: 'Reference issuer',
      version: '0.1.0',
      ecosystem: 'reference',
      kind: 'issuer',
      registered: true,
    },
    {
      id: 'ref-wallet',
      name: 'Reference wallet (headless)',
      version: '0.1.0',
      ecosystem: 'reference',
      kind: 'wallet',
      registered: true,
    },
    {
      id: 'ref-verifier',
      name: 'Reference verifier',
      version: '0.1.0',
      ecosystem: 'reference',
      kind: 'verifier',
      registered: true,
    },
    {
      id: 'inji-verify',
      name: 'Inji Verify (API)',
      version: '0.18.2',
      ecosystem: 'inji',
      kind: 'verifier',
      registered: true,
    },
  ],
  totals: { cells: 4, pass: 1, fail: 1, error: 0, notSupported: 1, untested: 1 },
  cells: [
    cell({
      id: 'ref-issuer/ref-wallet/ref-verifier/vc+sd-jwt/inji-draft/happy',
      key: { ...REF, format: 'vc+sd-jwt', vpProfile: 'inji-draft', scenario: 'happy' },
      status: 'pass',
      source: 'run',
      latestRun: {
        runId: PASS_RUN,
        createdAt: '2026-10-04T11:00:00.000Z',
        mode: 'reference',
        vciProfile: 'draft13',
        outcome: 'VALID',
        verdict: 'pass',
        credentialProof: 'EdDSA',
        versions,
      },
      counts: { runs: 1, pass: 1, fail: 0, error: 0, notSupported: 0 },
    }),
    cell({
      id: 'ref-issuer/ref-wallet/ref-verifier/ldp_vc/inji-draft/happy',
      key: { ...REF, format: 'ldp_vc', vpProfile: 'inji-draft', scenario: 'happy' },
      status: 'untested',
      source: 'compatibility',
    }),
    cell({
      id: 'ref-issuer/ref-wallet/inji-verify/vc+sd-jwt/inji-draft/happy',
      key: {
        ...REF,
        verifier: 'inji-verify',
        format: 'vc+sd-jwt',
        vpProfile: 'inji-draft',
        scenario: 'happy',
      },
      status: 'fail',
      source: 'run',
      latestRun: {
        runId: FAIL_RUN,
        createdAt: '2026-10-04T11:01:00.000Z',
        mode: 'live',
        vciProfile: 'draft13',
        outcome: 'INVALID',
        verdict: 'fail',
        credentialProof: 'EdDSA',
        error: {
          step: 'verifier.result',
          code: 'outcome.unexpected',
          message: 'Inji Verify answered INVALID.',
        },
        versions: { ...versions, verifier: '0.18.2' },
      },
      counts: { runs: 2, pass: 0, fail: 2, error: 0, notSupported: 0 },
      gapIds: ['G2'],
    }),
    cell({
      id: 'ref-issuer/ref-wallet/inji-verify/ldp_vc/inji-draft/happy',
      key: { ...REF, verifier: 'inji-verify', format: 'ldp_vc', vpProfile: 'inji-draft', scenario: 'happy' },
      status: 'not-supported',
      source: 'compatibility',
      reasons: [
        {
          code: 'verifier.format-unsupported',
          severity: 'blocking',
          message: 'Inji Verify (API) does not support the format ldp_vc here.',
          roles: ['inji-verify'],
        },
      ],
    }),
  ],
});

export const emptyMatrix = MatrixSchema.parse({
  ...matrix,
  totals: { cells: 0, pass: 0, fail: 0, error: 0, notSupported: 0, untested: 0 },
  cells: [],
});

const specStep = (
  name: string,
  label: string,
  term: string,
  status: 'ok' | 'failed',
  durationMs: number,
) => ({
  step: name,
  label,
  protocolTerm: term,
  status,
  durationMs,
  startedAt: '2026-10-04T11:01:00.000Z',
  spec: {
    name: 'OpenID for Verifiable Presentations 1.0',
    url: 'https://openid.net/specs/openid-4-verifiable-presentations-1_0.html',
    section: term,
  },
});

/** A tamper run the verifier wrongly accepted: verdict fail, with the failing exchange linked. */
export const failReport = RunReportDocumentSchema.parse({
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  report: {
    runId: FAIL_RUN,
    createdAt: '2026-10-04T11:01:00.000Z',
    mode: 'reference',
    issuer: { id: 'ref-issuer', name: 'Reference issuer', version: '0.1.0', ecosystem: 'reference' },
    wallet: {
      id: 'ref-wallet',
      name: 'Reference wallet (headless)',
      version: '0.1.0',
      ecosystem: 'reference',
    },
    verifier: { id: 'ref-verifier', name: 'Reference verifier', version: '0.1.0', ecosystem: 'reference' },
    format: 'vc+sd-jwt',
    credentialProof: 'EdDSA',
    holderProof: 'ES256',
    issuerDid: 'did:key:z6MkSyntheticIssuerKeyForTestsOnly',
    vciProfile: 'draft13',
    vpProfile: 'inji-draft',
    scenario: { id: 'kb-wrong-nonce', expected: 'INVALID' },
    outcome: 'VALID',
    verdict: 'fail',
    error: {
      step: 'verifier.result',
      code: 'outcome.unexpected',
      message: 'The scenario "kb-wrong-nonce" expects INVALID; Reference verifier answered VALID.',
      exchangeId: `${FAIL_RUN}-x7`,
    },
    steps: [
      { step: 'wallet.submit', status: 'ok', durationMs: 4, startedAt: '2026-10-04T11:01:00.000Z' },
      { step: 'verifier.result', status: 'failed', durationMs: 1, startedAt: '2026-10-04T11:01:00.500Z' },
    ],
  },
  run: {
    status: 'finished',
    startedAt: '2026-10-04T11:01:00.000Z',
    finishedAt: '2026-10-04T11:01:01.000Z',
    totalStepMs: 5,
  },
  versions: { ...versions, playground: '0.1.0' },
  steps: [
    specStep(
      'wallet.submit',
      'Wallet sends the presentation to the verifier',
      'Authorization Response',
      'ok',
      4,
    ),
    specStep('verifier.result', 'Verifier checks the presentation', 'Response validation', 'failed', 1),
  ],
  error: {
    step: 'verifier.result',
    stepLabel: 'Verifier checks the presentation',
    code: 'outcome.unexpected',
    message: 'The scenario "kb-wrong-nonce" expects INVALID; Reference verifier answered VALID.',
    exchange: {
      id: `${FAIL_RUN}-x7`,
      seq: 7,
      method: 'POST',
      url: 'http://localhost:28100/ref/verifier/response',
      status: 200,
      apiLink: `/api/runs/${FAIL_RUN}/exchanges`,
      uiLink: `/runs/${FAIL_RUN}?exchange=7`,
    },
  },
  links: {
    run: `/api/runs/${FAIL_RUN}`,
    exchanges: `/api/runs/${FAIL_RUN}/exchanges`,
    markdown: `/api/runs/${FAIL_RUN}/report.md`,
    export: `/api/runs/${FAIL_RUN}/export`,
    ui: `/runs/${FAIL_RUN}`,
  },
});

export const gaps = GapListSchema.parse({
  source: 'docs/gaps/gaps.json',
  gaps: [
    {
      id: 'G2',
      title: 'did:web resolved only over https://',
      repository: 'inji/inji-verify',
      version: '0.18.2',
      severity: 'medium',
      status: 'existing-upstream',
      summary: 'vc-verifier resolves did:web only over https.',
      cells: ['*/*/inji-verify/vc+sd-jwt'],
    },
  ],
  problems: [],
});

export const emptyGaps = GapListSchema.parse({ source: null, gaps: [], problems: [] });
