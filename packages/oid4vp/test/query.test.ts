// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Unit tests of the pieces both roles share: client id parsing, the Presentation Exchange filter
 * subset, SD-JWT claim reconstruction and the HTTP routes on a Fastify-shaped host.
 */
import { describe, expect, it } from 'vitest';
import {
  formatClientId,
  matchesFilter,
  parseClientId,
  parsePresentationSubmission,
  registerVerifierRoutes,
  sdJwtClaims,
  type JsonSchemaFilter,
  type PresentationDefinition,
  type RouteHost,
} from '../src/index.js';
import { farmerSdJwtVc, harness } from './helpers.js';

describe('client ids (OpenID4VP 1.0 section 5.9; draft 21 section 5.7)', () => {
  it('writes the scheme as a prefix in final-1.0 and as Inji does in inji-draft', () => {
    expect(formatClientId('final-1.0', 'did', 'did:key:z6Mk1')).toEqual({
      clientId: 'decentralized_identifier:did:key:z6Mk1',
    });
    expect(formatClientId('final-1.0', 'redirect_uri', 'https://v.test/cb')).toEqual({
      clientId: 'redirect_uri:https://v.test/cb',
    });
    expect(formatClientId('inji-draft', 'did', 'did:key:z6Mk1')).toEqual({ clientId: 'did:key:z6Mk1' });
    expect(formatClientId('inji-draft', 'redirect_uri', 'https://v.test/cb')).toEqual({
      clientId: 'https://v.test/cb',
      clientIdScheme: 'redirect_uri',
    });
  });

  it.each([
    ['decentralized_identifier:did:web:v.test', undefined, 'did', 'did:web:v.test'],
    ['redirect_uri:https://v.test/cb', undefined, 'redirect_uri', 'https://v.test/cb'],
    ['did:key:z6Mk1', undefined, 'did', 'did:key:z6Mk1'],
    ['https://v.test/cb', 'redirect_uri', 'redirect_uri', 'https://v.test/cb'],
    ['x509_san_dns:v.test', undefined, 'x509_san_dns', 'v.test'],
    ['verifier-123', undefined, 'pre-registered', 'verifier-123'],
  ] as const)('parses %s', (clientId, schemeParameter, scheme, identifier) => {
    expect(parseClientId(clientId, schemeParameter)).toMatchObject({ scheme, identifier });
  });

  it('rejects an unknown client_id_scheme parameter', () => {
    expect(() => parseClientId('v', 'entity_id')).toThrow(/not supported/);
  });
});

describe('Presentation Exchange filters (JSON Schema subset)', () => {
  const cases: [unknown, JsonSchemaFilter, boolean][] = [
    [
      ['VerifiableCredential', 'FarmerCredential'],
      { type: 'array', contains: { const: 'FarmerCredential' } },
      true,
    ],
    [['VerifiableCredential'], { type: 'array', contains: { const: 'FarmerCredential' } }, false],
    ['Asha', { type: 'string', pattern: '^A' }, true],
    ['Ravi', { type: 'string', pattern: '^A' }, false],
    [3, { type: 'number', minimum: 1, maximum: 5 }, true],
    [7, { type: 'integer', maximum: 5 }, false],
    ['b', { enum: ['a', 'b'] }, true],
    [true, { type: 'string' }, false],
    // Keywords for another type are ignored (the filters Inji wallets need carry `pattern` on arrays).
    [
      ['VerifiableCredential', 'FarmerCredential'],
      { type: 'array', contains: { const: 'FarmerCredential' }, pattern: 'FarmerCredential' },
      true,
    ],
    ['Asha', { minimum: 1, contains: { const: 'x' } }, true],
    [4, { pattern: '^A' }, true],
  ];
  it.each(cases)('%j against %j -> %s', (value, filter, expected) => {
    expect(matchesFilter(value, filter)).toBe(expected);
  });
});

describe('presentation_submission', () => {
  const definition: PresentationDefinition = { id: 'pd-1', input_descriptors: [{ id: 'a' }, { id: 'b' }] };
  const entry = (id: string) => ({ id, format: 'ldp_vp', path: '$' });

  it('must name the definition it answers', () => {
    expect(() =>
      parsePresentationSubmission(
        { id: 's', definition_id: 'pd-2', descriptor_map: [entry('a'), entry('b')] },
        definition,
      ),
    ).toThrow(/another presentation definition/);
  });

  it('must answer every input descriptor', () => {
    expect(() =>
      parsePresentationSubmission(
        { id: 's', definition_id: 'pd-1', descriptor_map: [entry('a')] },
        definition,
      ),
    ).toThrow(/unanswered/);
    const ok = parsePresentationSubmission(
      { id: 's', definition_id: 'pd-1', descriptor_map: [entry('a'), entry('b')] },
      definition,
    );
    expect(ok.id).toBe('s');
  });

  it('refuses an entry that answers no input descriptor, so its presentation is never verified', () => {
    expect(() =>
      parsePresentationSubmission(
        { id: 's', definition_id: 'pd-1', descriptor_map: [entry('a'), entry('b'), entry('x')] },
        definition,
      ),
    ).toThrow(/no input descriptor/);
  });
});

describe('SD-JWT claim reconstruction for query matching', () => {
  it('puts every disclosure back and drops _sd', async () => {
    const claims = sdJwtClaims((await farmerSdJwtVc()).raw);
    expect(claims).toMatchObject({ given_name: 'Asha', family_name: 'Rao', land_area_acres: 3 });
    expect(typeof claims.vct).toBe('string');
    expect(claims._sd).toBeUndefined();
  });
});

describe('registerVerifierRoutes on a Fastify-shaped host', () => {
  it('registers the request object and response routes under the base path', async () => {
    type Handler = Parameters<RouteHost['get']>[1];
    const routes = new Map<string, Handler>();
    const host: RouteHost = {
      get: (path, handler) => routes.set(`GET ${path}`, handler),
      post: (path, handler) => routes.set(`POST ${path}`, handler),
    };
    const { verifier } = harness();
    registerVerifierRoutes(host, verifier);
    expect([...routes.keys()]).toEqual([
      'GET /ref/verifier/requests/:handle',
      'POST /ref/verifier/response',
      'GET /ref/verifier/dc-api/requests/:handle',
      'POST /ref/verifier/dc-api/responses/:handle',
    ]);

    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const sent: { status?: number; headers: Record<string, string>; body?: unknown } = { headers: {} };
    const reply = {
      code(status: number) {
        sent.status = status;
        return reply;
      },
      header(name: string, value: string) {
        sent.headers[name] = value;
        return reply;
      },
      send(body: unknown) {
        sent.body = body;
        return reply;
      },
    };
    await routes.get('GET /ref/verifier/requests/:handle')!(
      { params: { handle: created.handle }, body: undefined },
      reply,
    );
    expect(sent).toMatchObject({
      status: 200,
      headers: { 'content-type': 'application/oauth-authz-req+jwt' },
      body: created.requestObject,
    });

    await routes.get('POST /ref/verifier/response')!({ params: {}, body: { state: 'unknown' } }, reply);
    expect(sent.status).toBe(400);
  });
});
