import type { RecordedExchange } from '@inji-playground/protocol';
import { describe, expect, it } from 'vitest';
import { analyseArtifact, analyseExchange, type DecodedSection } from '../src/inspector/analyse';
import { buildInspectorModel } from '../src/inspector/model';
import {
  CREDENTIAL,
  EVENTS,
  EXCHANGES,
  KB_JWT,
  PRESENTATION,
  PRESENTATION_DEFINITION,
  PRESENTATION_SUBMISSION,
  PROOF_JWT,
  REQUEST_OBJECT,
  RUN_ID,
} from './fixtures/decodable-run';
import MDOC from './fixtures/mdoc.synthetic.json';

const byKind = (sections: DecodedSection[], kind: DecodedSection['kind']) =>
  sections.filter((section) => section.kind === kind);

function exchangeWith(patch: Partial<RecordedExchange>): RecordedExchange {
  return { ...EXCHANGES[5]!, ...patch };
}

describe('analyseExchange', () => {
  it('OpenID4VCI credential offer by value inside an openid-credential-offer:// URI', () => {
    const sections = analyseExchange(EXCHANGES[0]!);
    expect(byKind(sections, 'credential-offer').map((s) => s.view.type)).toEqual(['params', 'json']);
    const offer = byKind(sections, 'credential-offer')[1]!;
    expect(offer.view).toMatchObject({
      type: 'json',
      value: { credential_configuration_ids: ['ExampleIdentityCredential_sd_jwt'] },
    });
  });

  it('credential request: the proof of possession JWT; credential response: the SD-JWT', () => {
    const sections = analyseExchange(EXCHANGES[2]!);
    const [proof] = byKind(sections, 'proof-jwt');
    expect(proof).toMatchObject({ source: 'request', path: 'body.proof.jwt', raw: PROOF_JWT });
    expect(proof!.view).toMatchObject({ type: 'jwt', jwt: { header: { typ: 'openid4vci-proof+jwt' } } });
    const [credential] = byKind(sections, 'credential');
    expect(credential).toMatchObject({ source: 'response', raw: CREDENTIAL });
    expect(credential!.view.type).toBe('sd-jwt');
  });

  it('OpenID4VP authorization request URI: its parameters are listed', () => {
    const [request] = byKind(analyseExchange(EXCHANGES[3]!), 'authorization-request');
    expect(request!.view.type).toBe('params');
    expect(request!.view.type === 'params' && request!.view.params.map(([name]) => name)).toEqual([
      'client_id',
      'request_uri',
    ]);
  });

  it('request object by reference: decoded JWT and the presentation definition it carries', () => {
    const sections = analyseExchange(EXCHANGES[4]!);
    const [requestObject] = byKind(sections, 'request-object');
    expect(requestObject).toMatchObject({ source: 'response', raw: REQUEST_OBJECT });
    expect(requestObject!.view).toMatchObject({
      type: 'jwt',
      jwt: {
        payload: {
          nonce: 'synthetic-vp-nonce',
          response_uri: 'http://localhost:28100/ref/verifier/response',
        },
      },
    });
    const [definition] = byKind(sections, 'presentation-definition');
    expect(definition!.view).toMatchObject({ type: 'json', value: PRESENTATION_DEFINITION });
  });

  it('direct_post body: vp_token as SD-JWT with key binding, and presentation_submission', () => {
    const sections = analyseExchange(EXCHANGES[5]!);
    const [vpToken] = byKind(sections, 'vp-token');
    expect(vpToken).toMatchObject({ source: 'request', path: 'body.vp_token', raw: PRESENTATION });
    expect(vpToken!.view.type === 'sd-jwt' && vpToken!.view.sdJwt.keyBinding?.raw).toBe(KB_JWT);
    const [submission] = byKind(sections, 'presentation-submission');
    expect(submission!.view).toMatchObject({ type: 'json', value: PRESENTATION_SUBMISSION });
  });

  it('verification result of the result step', () => {
    const [result] = byKind(analyseExchange(EXCHANGES[6]!), 'verification-result');
    expect(result!.view).toMatchObject({ type: 'json', value: { outcome: 'VALID' } });
  });

  it('JSON-LD presentation in vp_token: the presentation and its credential with their Data Integrity proofs', () => {
    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: [
        {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          credentialSubject: { id: 'did:example:holder' },
          proof: { type: 'Ed25519Signature2020', proofPurpose: 'assertionMethod', proofValue: 'zSynthetic' },
        },
      ],
      proof: { type: 'Ed25519Signature2020', proofPurpose: 'authentication', challenge: 'n-1', domain: 'v' },
    };
    const sections = analyseExchange(
      exchangeWith({
        request: {
          method: 'POST',
          url: 'http://localhost:28100/ref/verifier/response',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ vp_token: JSON.stringify(vp) }).toString(),
        },
      }),
    );
    const [presentation] = byKind(sections, 'vp-token');
    expect(presentation!.view).toMatchObject({ type: 'json', proofs: [{ challenge: 'n-1' }] });
    const [credential] = byKind(sections, 'credential');
    expect(credential!.path).toBe('body.vp_token.verifiableCredential[0]');
    expect(credential!.view).toMatchObject({ type: 'json', proofs: [{ proofPurpose: 'assertionMethod' }] });
  });

  it('OpenID4VP 1.0 with DCQL: vp_token keyed by credential query id, and the dcql_query of the request', () => {
    const sections = analyseExchange(
      exchangeWith({
        request: {
          method: 'POST',
          url: 'http://localhost:28100/ref/verifier/response',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ vp_token: JSON.stringify({ identity: [PRESENTATION] }) }).toString(),
        },
      }),
    );
    expect(byKind(sections, 'vp-token').map((s) => s.path)).toEqual(['body.vp_token.identity[0]']);

    const dcql = { credentials: [{ id: 'identity', format: 'dc+sd-jwt' }] };
    const byValue = analyseExchange(
      exchangeWith({
        request: {
          method: 'GET',
          url: `openid4vp://authorize?client_id=x&dcql_query=${encodeURIComponent(JSON.stringify(dcql))}`,
          headers: {},
        },
      }),
    );
    expect(byKind(byValue, 'dcql-query')[0]!.view).toMatchObject({ type: 'json', value: dcql });
  });

  it("Inji Verify's vp-results answer is a verification result whatever the step", () => {
    const sections = analyseExchange(
      exchangeWith({
        step: 'wallet.submit',
        response: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transactionId: 't', vpResultStatus: 'SUCCESS', vcResults: [] }),
        },
      }),
    );
    expect(byKind(sections, 'verification-result')).toHaveLength(1);
  });

  it('decodes nothing it does not recognise, and never a base64 (binary) body', () => {
    expect(
      analyseExchange(
        exchangeWith({
          request: { method: 'GET', url: 'http://localhost/x', headers: {} },
          response: { status: 200, headers: {}, body: 'SYNTHETIC.REQUEST-OBJECT.JWT' },
        }),
      ),
    ).toEqual([]);
    expect(
      analyseExchange(
        exchangeWith({
          request: {
            method: 'POST',
            url: 'http://localhost/x',
            headers: {},
            body: CREDENTIAL,
            bodyEncoding: 'base64',
          },
          response: { status: 200, headers: {} },
        }),
      ),
    ).toEqual([]);
  });
});

describe('analyseArtifact', () => {
  it('decodes each artefact kind', () => {
    expect(analyseArtifact('credential', CREDENTIAL)[0]!.view.type).toBe('sd-jwt');
    expect(analyseArtifact('vp-token', PRESENTATION)[0]!.kind).toBe('vp-token');
    expect(analyseArtifact('request-object', REQUEST_OBJECT).map((s) => s.kind)).toEqual([
      'request-object',
      'presentation-definition',
    ]);
    expect(analyseArtifact('result', '{"outcome":"VALID"}')[0]!.kind).toBe('verification-result');
    expect(analyseArtifact('offer', '{"credential_issuer":"x"}')[0]!.kind).toBe('credential-offer');
    expect(analyseArtifact('request-object', 'SYNTHETIC')[0]!.view.type).toBe('opaque');
  });
});

describe('buildInspectorModel', () => {
  it('groups exchanges and artefacts by step in recording order', () => {
    const model = buildInspectorModel(EVENTS);
    expect(model.exchanges.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(model.groups.map((group) => group.step)).toEqual([
      'issuer.offer',
      'token',
      'credential',
      'verifier.request',
      'wallet.fetch-request',
      'wallet.submit',
      'verifier.result',
    ]);
    const credentialGroup = model.groups[2]!;
    expect(credentialGroup.items.map((item) => item.kind)).toEqual(['exchange', 'artifact']);
    expect(model.config?.format).toBe('vc+sd-jwt');
    expect(model.items[0]!.id).toBe(`${RUN_ID}-x1`);
  });

  it('puts an exchange the recording could not tag under the step in progress', () => {
    const untagged = { ...EXCHANGES[1]!, id: 'u1', seq: 99 };
    delete untagged.step;
    const model = buildInspectorModel([
      ...EVENTS.slice(0, 2),
      { type: 'exchange', runId: RUN_ID, exchange: untagged },
    ]);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]!.step).toBe('issuer.offer');
  });
});

describe('mso_mdoc (base64url CBOR)', () => {
  it('a credential response with an mdoc shows IssuerSigned as JSON, MSO decoded, instead of opaque text', () => {
    const sections = analyseExchange(
      exchangeWith({
        step: 'credential',
        response: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credential: MDOC.credential, c_nonce: 'n' }),
          bodyEncoding: 'utf8',
        },
      }),
    );
    const [credential] = byKind(sections, 'credential');
    expect(credential!.view.type).toBe('cbor');
    const view = credential!.view as Extract<DecodedSection['view'], { type: 'cbor' }>;
    expect(view.structure).toBe('IssuerSigned');
    expect(view.value).toMatchObject({
      issuerAuth: {
        protected: { alg: -7 },
        payload: { docType: 'test.ps02.playground.farmer.1', version: '1.0', digestAlgorithm: 'SHA-256' },
      },
    });
    const items = (view.value as { nameSpaces: Record<string, unknown[]> }).nameSpaces[
      'test.ps02.playground.farmer.1'
    ]!;
    expect(items).toContainEqual(
      expect.objectContaining({ elementIdentifier: 'givenName', elementValue: 'Gorge' }),
    );
  });

  it('a vp_token artefact with a DeviceResponse (inji-draft: JSON string; final-1.0: keyed by query id)', () => {
    for (const raw of [
      JSON.stringify(MDOC.deviceResponse),
      JSON.stringify({ credential: [MDOC.deviceResponse] }),
    ]) {
      const [section] = analyseArtifact('vp-token', raw);
      expect(section!.view).toMatchObject({
        type: 'cbor',
        structure: 'DeviceResponse',
        value: { status: 0, documents: [{ docType: 'test.ps02.playground.farmer.1' }] },
      });
      // The DeviceSignature payload is detached (ISO/IEC 18013-5 section 9.1.3.6).
      expect(section!.view).toMatchObject({
        value: { documents: [{ deviceSigned: { deviceAuth: { deviceSignature: { payload: null } } } }] },
      });
    }
  });

  it('other base64url text is not mistaken for an mdoc', () => {
    const [section] = analyseArtifact('credential', 'aGVsbG8gd29ybGQ');
    expect(section!.view.type).toBe('opaque');
  });
});
