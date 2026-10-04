/**
 * The wallet presentation client's own checks: request object signatures per client id scheme,
 * request parameters, and the holder DID it presents.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDidJwk,
  createDidKey,
  didKeyVerificationMethodId,
  generateKeyPair,
  signCompactJws,
} from '@inji-playground/formats';
import { ReferenceVerifier, buildRequestUri, signRequestObject, type FetchFn } from '../src/index.js';
import { VERIFIER_BASE_URL, documentLoader, farmerLdpVc, flipCharacter, harness, holder } from './helpers.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

/** A fetch that serves `body` for the request URI and forwards everything else. */
function serving(inner: FetchFn, requestUri: string, body: string): FetchFn {
  return (input, init) =>
    input === requestUri ? Promise.resolve(new Response(body, { status: 200 })) : inner(input, init);
}

describe('wallet: request object verification', () => {
  it('refuses a request object with a bad signature', async () => {
    const base = harness();
    const created = base.verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const [header, payload, signature] = created.requestObject!.split('.') as [string, string, string];
    const tampered = `${header}.${payload}.${flipCharacter(signature, 5)}`;
    const { wallet } = harness({ fetch: serving(base.fetch, created.requestUri!, tampered) });
    await expect(wallet.resolveRequest(created.uri)).rejects.toMatchObject({
      code: 'REQUEST_SIGNATURE_INVALID',
    });
    expect(base.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('refuses a request object whose payload was changed after signing', async () => {
    const base = harness();
    const created = base.verifier.createRequest({ profile: 'final-1.0', format: 'vc+sd-jwt' });
    const [header, , signature] = created.requestObject!.split('.') as [string, string, string];
    const payload = Buffer.from(
      JSON.stringify({ ...created.parameters, response_uri: 'https://attacker.ps02.test/collect' }),
    ).toString('base64url');
    const { wallet } = harness({
      fetch: serving(base.fetch, created.requestUri!, `${header}.${payload}.${signature}`),
    });
    await expect(wallet.resolveRequest(created.uri)).rejects.toMatchObject({
      code: 'REQUEST_SIGNATURE_INVALID',
    });
  });

  it('refuses a request object signed by a key of another DID', async () => {
    const base = harness();
    const created = base.verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const intruder = generateKeyPair('EdDSA');
    const intruderDid = createDidKey(intruder.publicJwk);
    const forged = signRequestObject(
      { ...created.parameters },
      intruder,
      didKeyVerificationMethodId(intruderDid),
    );
    const { wallet } = harness({ fetch: serving(base.fetch, created.requestUri!, forged) });
    await expect(wallet.resolveRequest(created.uri)).rejects.toMatchObject({ code: 'CLIENT_ID_MISMATCH' });
  });

  it('refuses a request object with the wrong typ', async () => {
    const base = harness();
    const created = base.verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const untyped = signCompactJws(
      { typ: 'JWT', kid: base.verifier.kid },
      { ...created.parameters },
      generateKeyPair('EdDSA'),
    );
    const { wallet } = harness({ fetch: serving(base.fetch, created.requestUri!, untyped) });
    await expect(wallet.resolveRequest(created.uri)).rejects.toMatchObject({
      code: 'REQUEST_OBJECT_INVALID',
    });
  });

  it('refuses a DID client id sent unsigned by value', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'inji-draft',
      format: 'ldp_vc',
      clientIdScheme: 'redirect_uri',
    });
    const uri = buildRequestUri({
      ...created.parameters,
      client_id: verifier.did,
      client_id_scheme: undefined,
    });
    await expect(wallet.resolveRequest(uri)).rejects.toMatchObject({ code: 'REQUEST_SIGNATURE_INVALID' });
  });

  it('refuses a redirect_uri client id whose response_uri points elsewhere', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({
      profile: 'final-1.0',
      format: 'ldp_vc',
      clientIdScheme: 'redirect_uri',
    });
    const uri = buildRequestUri({
      ...created.parameters,
      response_uri: 'https://attacker.ps02.test/collect',
    });
    await expect(wallet.resolveRequest(uri)).rejects.toMatchObject({ code: 'CLIENT_ID_MISMATCH' });
  });

  it('accepts a signed request object by value (request parameter)', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc', byReference: false });
    const request = await wallet.resolveRequest(created.uri);
    expect(request.signed).toBe(true);
    expect(request.nonce).toBe(created.nonce);
  });

  it('accepts the haip-vp:// and eudi-openid4vp:// schemes, rejects others', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'final-1.0', format: 'ldp_vc' });
    for (const scheme of ['haip-vp', 'eudi-openid4vp']) {
      await expect(wallet.resolveRequest(created.uri.replace('openid4vp', scheme))).resolves.toMatchObject({
        profile: 'final-1.0',
      });
    }
    await expect(wallet.resolveRequest(created.uri.replace('openid4vp', 'https'))).rejects.toMatchObject({
      code: 'REQUEST_URI_INVALID',
    });
  });

  it('an expired request is no longer served', () => {
    let now = new Date();
    const verifier = new ReferenceVerifier({
      baseUrl: VERIFIER_BASE_URL,
      documentLoader,
      requestTtlSeconds: 60,
      now: () => now,
    });
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    now = new Date(now.getTime() + 61_000);
    expect(() => verifier.requestObject(created.handle)).toThrow(/expired/);
  });
});

describe('wallet: holder DID as the credential binds it (inji/inji-certify#1054)', () => {
  const padded = createDidJwk(holder.keyPair.publicJwk, { padded: true });
  const canonical = createDidJwk(holder.keyPair.publicJwk);

  it('the test key gives a padded did:jwk that differs from the canonical one', () => {
    expect(padded).not.toBe(canonical);
    expect(padded.endsWith('=') || padded.includes('%3D')).toBe(true);
  });

  it('presents the padded did:jwk exactly as bound -> VALID', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const result = await wallet.respond(created.uri, [await farmerLdpVc({ subjectId: padded })]);
    const vp = JSON.parse(result.form.vp_token!) as { holder: string; proof: { verificationMethod: string } };
    expect(vp.holder).toBe(padded);
    expect(vp.proof.verificationMethod).toBe(`${padded}#0`);
    expect((await verifier.awaitResult(created.handle)).outcome).toBe('VALID');
  });

  it('presenting the canonical form of a padded binding -> INVALID (holder binding)', async () => {
    const { verifier, wallet } = harness({ holderDidForm: 'canonical' });
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    await wallet.respond(created.uri, [await farmerLdpVc({ subjectId: padded })]);
    const report = await verifier.awaitResult(created.handle);
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('LDP_HOLDER_MISMATCH');
    expect(report.checks.find((check) => check.id === 'holder-binding')?.status).toBe('fail');
  });

  it('refuses to present a credential bound to someone else', async () => {
    const { verifier, wallet } = harness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'ldp_vc' });
    const stranger = createDidKey(generateKeyPair('EdDSA').publicJwk);
    await expect(
      wallet.respond(created.uri, [await farmerLdpVc({ subjectId: stranger })]),
    ).rejects.toMatchObject({
      code: 'HOLDER_KEY_MISMATCH',
    });
  });
});
