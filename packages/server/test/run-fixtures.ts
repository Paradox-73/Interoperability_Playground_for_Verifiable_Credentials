/**
 * Stored runs built by hand, for tests of reports, history, the matrix and metrics that need exact
 * timestamps, versions and step durations (runs made by the orchestrator take real time).
 */
import type {
  InteropReport,
  RecordedExchange,
  RoleDescriptor,
  RunConfig,
  StepSummary,
} from '@inji-playground/protocol';
import type { RunStore } from '../src/store/run-store.js';

export interface SeedRun {
  id: string;
  createdAt: string;
  config?: Partial<RunConfig>;
  versions?: Partial<{ issuer: string; wallet: string; verifier: string }>;
  report?: Partial<InteropReport>;
  exchanges?: RecordedExchange[];
  /** Leave the run unfinished (no report). */
  unfinished?: boolean;
}

const NAMES: Record<string, string> = {
  'ref-issuer': 'Reference issuer',
  'ref-wallet': 'Reference wallet',
  'ref-verifier': 'Reference verifier',
  'inji-certify': 'Inji Certify',
  'inji-verify': 'Inji Verify',
};

/** Steps of a complete run with the given durations (ms), in protocol order. */
export function okSteps(durations: Partial<Record<StepSummary['step'], number>> = {}): StepSummary[] {
  const order: StepSummary['step'][] = [
    'issuer.offer',
    'issuer.metadata',
    'token',
    'credential',
    'verifier.request',
    'wallet.fetch-request',
    'wallet.submit',
    'verifier.result',
  ];
  return order.map((step) => ({ step, status: 'ok', durationMs: durations[step] ?? 10 }));
}

/** Writes a run (and, unless `unfinished`, its report) straight into the store. */
export function seedRun(store: RunStore, seed: SeedRun): InteropReport | undefined {
  const config: RunConfig = {
    issuer: 'ref-issuer',
    wallet: 'ref-wallet',
    verifier: 'ref-verifier',
    format: 'vc+sd-jwt',
    vciProfile: 'draft13',
    vpProfile: 'inji-draft',
    scenario: 'happy',
    ...seed.config,
  };
  const versions = { issuer: '0.1.0', wallet: '0.1.0', verifier: '0.1.0', ...seed.versions };
  const ecosystem = (id: string): 'inji' | 'reference' => (id.startsWith('inji-') ? 'inji' : 'reference');
  const mode = [config.issuer, config.wallet, config.verifier].some((id) => id.startsWith('inji-'))
    ? 'live'
    : 'reference';
  store.createRun({ id: seed.id, mode, config, versions, createdAt: seed.createdAt });
  store.markStarted(seed.id, seed.createdAt);
  for (const exchange of seed.exchanges ?? []) {
    store.appendEvent({ type: 'exchange', runId: seed.id, exchange }, exchange.startedAt);
  }
  if (seed.unfinished) return undefined;
  const ref = (id: string, version: string) => ({
    id,
    name: NAMES[id] ?? id,
    version,
    ecosystem: ecosystem(id),
  });
  const report: InteropReport = {
    runId: seed.id,
    createdAt: seed.createdAt,
    mode,
    issuer: ref(config.issuer, versions.issuer),
    wallet: ref(config.wallet, versions.wallet),
    verifier: ref(config.verifier, versions.verifier),
    format: config.format,
    credentialProof: config.format === 'ldp_vc' ? 'Ed25519Signature2020' : 'EdDSA',
    vciProfile: config.vciProfile,
    vpProfile: config.vpProfile,
    scenario: { id: config.scenario, expected: 'VALID' },
    outcome: 'VALID',
    verdict: 'pass',
    steps: okSteps(),
    ...seed.report,
  };
  store.finishRun(report, seed.createdAt);
  return report;
}

/** A recorded token exchange carrying the secrets an export must hide. */
export function tokenExchange(
  runId: string,
  seq: number,
  overrides: Partial<RecordedExchange> = {},
): RecordedExchange {
  return {
    id: `${runId}-x${seq}`,
    runId,
    seq,
    capture: 'outbound',
    step: 'token',
    from: 'ref-wallet',
    to: 'ref-issuer',
    request: {
      method: 'POST',
      url: 'http://127.0.0.1:28100/ref/as/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=PREAUTH-SECRET-123&tx_code=4711',
    },
    response: {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'session=COOKIE-SECRET; HttpOnly' },
      body: '{"access_token":"ACCESS-SECRET-abc","token_type":"Bearer","expires_in":300,"c_nonce":"nonce-1"}',
    },
    startedAt: '2026-10-04T10:00:01.000Z',
    durationMs: 12.5,
    ...overrides,
  };
}

/** A role descriptor for matrix tests. */
export function descriptor(
  id: string,
  kind: RoleDescriptor['kind'],
  formats: RoleDescriptor['capabilities']['formats'],
  extra: Partial<RoleDescriptor['capabilities']> = {},
): RoleDescriptor {
  return {
    id,
    kind,
    name: NAMES[id] ?? id,
    ecosystem: id.startsWith('inji-') ? 'inji' : 'reference',
    version: '0.1.0',
    interaction: 'automatic',
    capabilities: { formats, proofTypes: ['EdDSA'], didMethods: ['did:key'], ...extra },
  };
}
