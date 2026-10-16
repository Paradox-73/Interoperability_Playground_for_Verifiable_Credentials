/**
 * A made-up run whose payloads decode: real base64url JWT headers and payloads, SD-JWT disclosures whose
 * SHA-256 digests are listed in `_sd`, a key-binding JWT, a request object with a presentation
 * definition, and a presentation submission. Signatures are placeholder bytes, so nothing here verifies
 * or could be used as a credential. Built at test time; no key material exists.
 *
 * The shape follows the reference roles' SD-JWT VC flow (OpenID4VCI draft 13, OpenID4VP with
 * Presentation Exchange).
 */
import { createHash } from 'node:crypto';
import exampleRun from '@inji-playground/protocol/fixtures/example-run.synthetic.json';
import { RunEventSchema, type RecordedExchange, type RunEvent } from '@inji-playground/protocol';

export const RUN_ID = 'decodable-run-0001';

const b64url = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const json = (value: unknown) => b64url(JSON.stringify(value));
/** Placeholder signature: the text "not-a-signature", never a real one. */
const FAKE_SIGNATURE = b64url('not-a-signature');

export function fakeJwt(header: object, payload: object): string {
  return `${json(header)}.${json(payload)}.${FAKE_SIGNATURE}`;
}

export function disclosure(salt: string, name: string, value: unknown): string {
  return json([salt, name, value]);
}

export function digest(encodedDisclosure: string): string {
  return createHash('sha256').update(encodedDisclosure, 'ascii').digest('base64url');
}

export const GIVEN_NAME = disclosure('salt-given-name', 'given_name', 'Asha');
export const BIRTH_YEAR = disclosure('salt-birth-year', 'birth_year', 1990);
/** Signed by nobody: its digest is not in `_sd` (an altered-disclosure tamper). */
export const FORGED = disclosure('salt-forged', 'nationality', 'XX');

export const HOLDER_JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };

export const ISSUER_JWT = fakeJwt(
  { alg: 'ES256', typ: 'vc+sd-jwt', kid: 'did:jwk:SYNTHETIC#0' },
  {
    iss: 'did:jwk:SYNTHETIC',
    vct: 'ExampleIdentityCredential',
    iat: 1_791_100_000,
    exp: 1_822_636_000,
    _sd_alg: 'sha-256',
    _sd: [digest(GIVEN_NAME), digest(BIRTH_YEAR)],
    cnf: { jwk: HOLDER_JWK },
  },
);

export const CREDENTIAL = `${ISSUER_JWT}~${GIVEN_NAME}~${BIRTH_YEAR}~`;

export const KB_JWT = fakeJwt(
  { alg: 'ES256', typ: 'kb+jwt' },
  {
    aud: 'http://localhost:28100/ref/verifier',
    nonce: 'synthetic-vp-nonce',
    iat: 1_791_100_100,
    sd_hash: 'synthetic',
  },
);

/** What the wallet presents: one of the two claims, plus the key-binding JWT. */
export const PRESENTATION = `${ISSUER_JWT}~${GIVEN_NAME}~${KB_JWT}`;

export const PROOF_JWT = fakeJwt(
  { alg: 'ES256', typ: 'openid4vci-proof+jwt', jwk: HOLDER_JWK },
  { aud: 'http://localhost:28100/ref/issuer', nonce: 'synthetic-c-nonce', iat: 1_791_100_010 },
);

export const PRESENTATION_DEFINITION = {
  id: 'example-identity',
  input_descriptors: [
    {
      id: 'identity',
      format: { 'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256'] } },
      constraints: {
        fields: [{ path: ['$.vct'], filter: { type: 'string', const: 'ExampleIdentityCredential' } }],
      },
    },
  ],
};

export const REQUEST_OBJECT = fakeJwt(
  { alg: 'ES256', typ: 'oauth-authz-req+jwt', kid: 'did:jwk:SYNTHETIC-VERIFIER#0' },
  {
    client_id: 'http://localhost:28100/ref/verifier/response',
    response_type: 'vp_token',
    response_mode: 'direct_post',
    response_uri: 'http://localhost:28100/ref/verifier/response',
    nonce: 'synthetic-vp-nonce',
    state: 'synthetic-state',
    presentation_definition: PRESENTATION_DEFINITION,
  },
);

export const PRESENTATION_SUBMISSION = {
  id: 'submission-1',
  definition_id: 'example-identity',
  descriptor_map: [{ id: 'identity', format: 'vc+sd-jwt', path: '$' }],
};

const OFFER = {
  credential_issuer: 'http://localhost:28100/ref/issuer',
  credential_configuration_ids: ['ExampleIdentityCredential_sd_jwt'],
  grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': '[redacted]' } },
};

const T0 = Date.parse('2026-10-04T10:00:00.000Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const JSON_TYPE = { 'content-type': 'application/json' };

function exchange(
  seq: number,
  step: RecordedExchange['step'],
  from: string,
  to: string,
  request: RecordedExchange['request'],
  response: RecordedExchange['response'],
): RecordedExchange {
  return {
    id: `${RUN_ID}-x${seq}`,
    runId: RUN_ID,
    seq,
    capture: 'outbound',
    ...(step ? { step } : {}),
    from,
    to,
    request,
    ...(response ? { response } : {}),
    startedAt: at(seq * 100),
    durationMs: 9,
  };
}

export const EXCHANGES: RecordedExchange[] = [
  exchange(
    1,
    'issuer.offer',
    'playground',
    'ref-issuer',
    { method: 'POST', url: 'http://localhost:28100/ref/issuer/offers', headers: JSON_TYPE, body: '{}' },
    {
      status: 201,
      headers: JSON_TYPE,
      body: JSON.stringify({
        credential_offer_uri: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(OFFER))}`,
      }),
    },
  ),
  exchange(
    2,
    'token',
    'ref-wallet',
    'ref-issuer',
    {
      method: 'POST',
      url: 'http://localhost:28100/ref/issuer/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=%5Bredacted%5D',
    },
    {
      status: 200,
      headers: JSON_TYPE,
      body: JSON.stringify({
        access_token: '[redacted]',
        token_type: 'Bearer',
        c_nonce: 'synthetic-c-nonce',
      }),
    },
  ),
  exchange(
    3,
    'credential',
    'ref-wallet',
    'ref-issuer',
    {
      method: 'POST',
      url: 'http://localhost:28100/ref/issuer/credential',
      headers: { ...JSON_TYPE, authorization: 'Bearer [redacted]' },
      body: JSON.stringify({
        format: 'vc+sd-jwt',
        vct: 'ExampleIdentityCredential',
        proof: { proof_type: 'jwt', jwt: PROOF_JWT },
      }),
    },
    { status: 200, headers: JSON_TYPE, body: JSON.stringify({ credential: CREDENTIAL }) },
  ),
  exchange(
    4,
    'verifier.request',
    'playground',
    'ref-verifier',
    { method: 'POST', url: 'http://localhost:28100/ref/verifier/requests', headers: JSON_TYPE, body: '{}' },
    {
      status: 201,
      headers: JSON_TYPE,
      body: JSON.stringify({
        request_uri:
          'openid4vp://authorize?client_id=http%3A%2F%2Flocalhost%3A28100%2Fref%2Fverifier%2Fresponse&request_uri=http%3A%2F%2Flocalhost%3A28100%2Fref%2Fverifier%2Frequests%2Fr1',
        transaction_id: 'synthetic-txn-1',
      }),
    },
  ),
  exchange(
    5,
    'wallet.fetch-request',
    'ref-wallet',
    'ref-verifier',
    { method: 'GET', url: 'http://localhost:28100/ref/verifier/requests/r1', headers: {} },
    { status: 200, headers: { 'content-type': 'application/oauth-authz-req+jwt' }, body: REQUEST_OBJECT },
  ),
  exchange(
    6,
    'wallet.submit',
    'ref-wallet',
    'ref-verifier',
    {
      method: 'POST',
      url: 'http://localhost:28100/ref/verifier/response',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        vp_token: PRESENTATION,
        presentation_submission: JSON.stringify(PRESENTATION_SUBMISSION),
        state: 'synthetic-state',
      }).toString(),
    },
    { status: 200, headers: JSON_TYPE, body: '{}' },
  ),
  exchange(
    7,
    'verifier.result',
    'playground',
    'ref-verifier',
    { method: 'GET', url: 'http://localhost:28100/ref/verifier/results/synthetic-txn-1', headers: {} },
    {
      status: 200,
      headers: JSON_TYPE,
      body: JSON.stringify({
        outcome: 'VALID',
        checks: [
          { id: 'signature', status: 'pass' },
          { id: 'holder-binding', status: 'pass' },
        ],
      }),
    },
  ),
];

const STEP_LABELS: Record<string, string> = {
  'issuer.offer': 'Issuer prepares a credential offer for the wallet',
  token: 'Wallet exchanges the one-time code for an access token',
  credential: 'Wallet proves it holds its key and receives the credential',
  'verifier.request': 'Verifier creates a request saying which credential it needs',
  'wallet.fetch-request': 'Wallet downloads the verifier’s signed request',
  'wallet.submit': 'Wallet sends the presentation to the verifier',
  'verifier.result': 'Verifier checks signatures, dates and holder binding',
};

function buildEvents(): RunEvent[] {
  const config = { ...exampleRun.config, scenario: 'happy' };
  const events: unknown[] = [{ type: 'run.started', runId: RUN_ID, config, at: at(0) }];
  for (const x of EXCHANGES) {
    const step = x.step!;
    events.push({
      type: 'step.started',
      runId: RUN_ID,
      step,
      label: STEP_LABELS[step],
      at: at(x.seq * 100 - 1),
    });
    events.push({ type: 'exchange', runId: RUN_ID, exchange: x });
    if (step === 'credential')
      events.push({
        type: 'artifact',
        runId: RUN_ID,
        kind: 'credential',
        format: 'vc+sd-jwt',
        raw: CREDENTIAL,
      });
    events.push({ type: 'step.finished', runId: RUN_ID, step, status: 'ok', at: at(x.seq * 100 + 20) });
  }
  const finished = exampleRun.events.at(-1) as { report: Record<string, unknown> };
  events.push({ type: 'run.finished', runId: RUN_ID, report: { ...finished.report, runId: RUN_ID } });
  // Parsing proves the fixture matches the shared contract the server emits.
  return events.map((event) => RunEventSchema.parse(event));
}

export const EVENTS: readonly RunEvent[] = buildEvents();
