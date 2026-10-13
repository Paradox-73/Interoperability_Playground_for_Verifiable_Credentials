import KeyResolver from 'key-did-resolver';
import { Resolver } from 'did-resolver';
import { describe, expect, it } from 'vitest';
import {
  buildDidDocument,
  createDidJwk,
  createDidKey,
  createDidResolver,
  didWebDocumentUrl,
  didWebFromUrl,
  generateKeyPair,
  KEY_ALGORITHMS,
  resolveDidJwk,
  resolveDidKey,
  toPublicJwk,
  verificationMethodToJwk,
  type VerificationMethod,
} from '../src/index.js';
import { fakeWeb } from './helpers.js';

describe('did:key', () => {
  it('did:key "Test Vectors": the Ed25519 example resolves to its own multibase key', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const { didDocument } = resolveDidKey(did, { ed25519Type: 'Multikey' });
    expect(didDocument.verificationMethod![0]).toEqual({
      id: `${did}#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK`,
      type: 'Multikey',
      controller: did,
      publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    });
    expect(didDocument.assertionMethod).toEqual([`${did}#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK`]);
  });

  it('did:key "Test Vectors": the P-256 example decodes to a point on the curve and encodes back', () => {
    const did = 'did:key:zDnaerx9CtbPJ1q36T5Ln5wYt3MQYeGRG5ehnPAmxcf5mDZpv';
    const method = resolveDidKey(did).didDocument.verificationMethod![0]!;
    expect(method.type).toBe('JsonWebKey2020');
    const jwk = verificationMethodToJwk(method);
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(createDidKey(jwk)).toBe(did);
  });

  it.each(KEY_ALGORITHMS)('%s: created did:key resolves to the same key', (alg) => {
    const { publicJwk } = generateKeyPair(alg);
    const did = createDidKey(publicJwk);
    expect(did.startsWith(alg === 'EdDSA' ? 'did:key:z6Mk' : 'did:key:zDn')).toBe(true);
    expect(verificationMethodToJwk(resolveDidKey(did).didDocument.verificationMethod![0]!)).toEqual(
      toPublicJwk(publicJwk),
    );
  });

  it('agrees with an independent resolver (key-did-resolver, Ed25519VerificationKey2018)', async () => {
    const { publicJwk } = generateKeyPair('EdDSA');
    const did = createDidKey(publicJwk);
    const other = await new Resolver(KeyResolver.getResolver()).resolve(did);
    const method = other.didDocument!.verificationMethod![0]! as VerificationMethod;
    expect(method.type).toBe('Ed25519VerificationKey2018');
    expect(verificationMethodToJwk(method)).toEqual(toPublicJwk(publicJwk));
  });

  it('rejects a did:key with an unknown multicodec', () => {
    expect(() => resolveDidKey('did:key:z6LSj72tK8brWgZja8NLRwPigth2T9QRiG1uH9oKZuKjdh9p')).toThrow(
      expect.objectContaining({ code: 'DID_INVALID' }),
    );
  });
});

describe('did:jwk', () => {
  // did:jwk specification, "Examples", P-256.
  const specExample =
    'did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9';

  it('did:jwk "Read": the specification example resolves to a JsonWebKey2020 method #0', () => {
    const { didDocument, didResolutionMetadata } = resolveDidJwk(specExample);
    expect(didResolutionMetadata.nonCanonical).toBeUndefined();
    expect(didDocument.verificationMethod![0]).toMatchObject({
      id: `${specExample}#0`,
      type: 'JsonWebKey2020',
      controller: specExample,
    });
    expect(didDocument.keyAgreement).toEqual([`${specExample}#0`]);
    expect(createDidJwk(verificationMethodToJwk(didDocument.verificationMethod![0]!))).toBe(specExample);
  });

  it.each(KEY_ALGORITHMS)('%s: unpadded did:jwk round trip is canonical', (alg) => {
    const { publicJwk } = generateKeyPair(alg);
    const did = createDidJwk(publicJwk);
    expect(did).not.toContain('=');
    const result = resolveDidJwk(did);
    expect(result.didResolutionMetadata).toEqual({ method: 'jwk' });
    expect(verificationMethodToJwk(result.didDocument.verificationMethod![0]!)).toEqual(
      toPublicJwk(publicJwk),
    );
  });

  it('padded did:jwk (as Inji Certify writes it, inji/inji-certify#1054) resolves and is flagged non-canonical', () => {
    // An Ed25519 JWK serialises to 70 bytes, whose base64 form needs padding.
    const { publicJwk } = generateKeyPair('EdDSA');
    const padded = createDidJwk(publicJwk, { padded: true });
    expect(padded.endsWith('=')).toBe(true);
    const result = resolveDidJwk(padded);
    expect(result.didResolutionMetadata.nonCanonical).toBe(true);
    expect(result.didResolutionMetadata.canonicalDid).toBe(createDidJwk(publicJwk));
    expect(result.didResolutionMetadata.warnings?.[0]).toContain('inji/inji-certify#1054');
    expect(result.didDocument.id).toBe(padded);
    expect(verificationMethodToJwk(result.didDocument.verificationMethod![0]!)).toEqual(
      toPublicJwk(publicJwk),
    );
  });

  it('did:jwk "Create": a JWK with a private key member is rejected', () => {
    const { privateJwk } = generateKeyPair('EdDSA');
    const did = `did:jwk:${Buffer.from(JSON.stringify(privateJwk)).toString('base64url')}`;
    expect(() => resolveDidJwk(did)).toThrow(expect.objectContaining({ code: 'DID_INVALID' }));
  });

  it('did:jwk with characters outside base64url is rejected', () => {
    expect(() => resolveDidJwk('did:jwk:eyJ*')).toThrow(expect.objectContaining({ code: 'DID_INVALID' }));
  });
});

describe('did:web', () => {
  it('did:web "Read (Resolve)": DID to URL, specification examples', () => {
    expect(didWebDocumentUrl('did:web:w3c-ccg.github.io')).toBe(
      'https://w3c-ccg.github.io/.well-known/did.json',
    );
    expect(didWebDocumentUrl('did:web:w3c-ccg.github.io:user:alice')).toBe(
      'https://w3c-ccg.github.io/user/alice/did.json',
    );
    expect(didWebDocumentUrl('did:web:example.com%3A3000:user:alice')).toBe(
      'https://example.com:3000/user/alice/did.json',
    );
  });

  it('URL to DID for a role hosting its own document', () => {
    expect(didWebFromUrl('https://issuer.ps02.test:28443/issuers/ref')).toBe(
      'did:web:issuer.ps02.test%3A28443:issuers:ref',
    );
    expect(didWebFromUrl('https://verifier.ps02.test')).toBe('did:web:verifier.ps02.test');
  });

  it('resolves through the *.ps02.test host override map with an injected fetch', async () => {
    const keyPair = generateKeyPair('EdDSA');
    const did = 'did:web:issuer.ps02.test';
    const web = fakeWeb();
    web.serve(
      'http://127.0.0.1:28110/.well-known/did.json',
      buildDidDocument(did, [{ publicJwk: keyPair.publicJwk, fragment: 'key-0' }]),
    );
    const resolver = createDidResolver({
      fetch: web.fetch,
      hostOverrides: { 'issuer.ps02.test': 'http://127.0.0.1:28110' },
    });

    const resolved = await resolver.resolveVerificationMethod(`${did}#key-0`, 'assertionMethod');
    expect(resolved.verificationMethod.type).toBe('Ed25519VerificationKey2020');
    expect(resolved.publicJwk).toEqual(toPublicJwk(keyPair.publicJwk));
    expect(resolved.resolution.didResolutionMetadata.retrievedFrom).toBe(
      'http://127.0.0.1:28110/.well-known/did.json',
    );

    // Cached: a second lookup does not fetch again.
    await resolver.resolve(did);
    expect(web.requests).toHaveLength(1);
  });

  it('refuses to override a host outside *.ps02.test and localhost', async () => {
    const resolver = createDidResolver({
      fetch: fakeWeb().fetch,
      hostOverrides: { 'example.com': 'http://127.0.0.1:28110' },
    });
    await expect(resolver.resolve('did:web:example.com')).rejects.toMatchObject({ code: 'DID_WEB_INSECURE' });
  });

  it('did:web "Read (Resolve)": a document whose id is another DID is rejected', async () => {
    const web = fakeWeb();
    web.serve('http://127.0.0.1:28110/.well-known/did.json', { id: 'did:web:other.ps02.test' });
    const resolver = createDidResolver({
      fetch: web.fetch,
      hostOverrides: { 'issuer.ps02.test': 'http://127.0.0.1:28110' },
    });
    await expect(resolver.resolve('did:web:issuer.ps02.test')).rejects.toMatchObject({
      code: 'DID_DOCUMENT_INVALID',
    });
  });

  it('an HTTP error is reported with the URL and not cached', async () => {
    const web = fakeWeb();
    const resolver = createDidResolver({
      fetch: web.fetch,
      hostOverrides: { 'issuer.ps02.test': 'http://127.0.0.1:28110' },
    });
    await expect(resolver.resolve('did:web:issuer.ps02.test')).rejects.toMatchObject({
      code: 'DID_WEB_FETCH_FAILED',
      details: { url: 'http://127.0.0.1:28110/.well-known/did.json', status: 404 },
    });
    await expect(resolver.resolve('did:web:issuer.ps02.test')).rejects.toMatchObject({
      code: 'DID_WEB_FETCH_FAILED',
    });
    expect(web.requests).toHaveLength(2);
  });
});

describe('did:web: what the server may fetch', () => {
  const document = (did: string) =>
    buildDidDocument(did, [{ publicJwk: generateKeyPair('EdDSA').publicJwk, fragment: 'key-0' }]);

  it.each([
    'did:web:169.254.169.254',
    'did:web:127.0.0.1%3A28443',
    'did:web:10.0.0.5%3A8443',
    'did:web:192.168.1.1',
  ])('refuses %s (a private, loopback or link-local address) without fetching it', async (did) => {
    const web = fakeWeb();
    const resolver = createDidResolver({ fetch: web.fetch });
    await expect(resolver.resolve(did)).rejects.toMatchObject({ code: 'DID_WEB_INSECURE' });
    expect(web.requests).toEqual([]);
  });

  it('refuses a host name that resolves to a private address, and fetches one that resolves to a public one', async () => {
    const web = fakeWeb();
    web.serve('https://public.example/.well-known/did.json', document('did:web:public.example'));
    const addresses: Record<string, string[]> = {
      'inside.example': ['93.184.216.34', '10.1.2.3'],
      'mapped.example': ['::ffff:127.0.0.1'],
      'public.example': ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'],
    };
    const resolver = createDidResolver({
      fetch: web.fetch,
      lookup: (hostname) => Promise.resolve(addresses[hostname] ?? []),
    });
    await expect(resolver.resolve('did:web:inside.example')).rejects.toMatchObject({
      code: 'DID_WEB_INSECURE',
    });
    await expect(resolver.resolve('did:web:mapped.example')).rejects.toMatchObject({
      code: 'DID_WEB_INSECURE',
    });
    await expect(resolver.resolve('did:web:public.example')).resolves.toBeDefined();
    expect(web.requests).toEqual(['https://public.example/.well-known/did.json']);
  });

  it('*.ps02.test and localhost are allowed by default; the list is configurable', async () => {
    const web = fakeWeb();
    web.serve('https://certify.ps02.test/.well-known/did.json', document('did:web:certify.ps02.test'));
    web.serve('https://intranet.example/.well-known/did.json', document('did:web:intranet.example'));
    const lookup = () => Promise.resolve(['10.0.0.7']);
    await expect(
      createDidResolver({ fetch: web.fetch, lookup }).resolve('did:web:certify.ps02.test'),
    ).resolves.toBeDefined();
    await expect(
      createDidResolver({ fetch: web.fetch, lookup }).resolve('did:web:intranet.example'),
    ).rejects.toMatchObject({ code: 'DID_WEB_INSECURE' });
    await expect(
      createDidResolver({ fetch: web.fetch, lookup, allowedHosts: ['*.example'] }).resolve(
        'did:web:intranet.example',
      ),
    ).resolves.toBeDefined();
  });

  it('refuses a document larger than 100 KB and does not follow redirects', async () => {
    const inits: unknown[] = [];
    const resolver = createDidResolver({
      lookup: () => Promise.resolve(['93.184.216.34']),
      fetch: (_url, init) => {
        inits.push(init);
        return Promise.resolve(new Response(`{"id":"${'x'.repeat(200_000)}"}`));
      },
    });
    await expect(resolver.resolve('did:web:big.example')).rejects.toMatchObject({
      code: 'DID_WEB_FETCH_FAILED',
      message: expect.stringContaining('102400 bytes'),
    });
    expect(inits[0]).toMatchObject({ redirect: 'error' });
  });
});

describe('DID resolver', () => {
  it('DID Core section 5.3: a key not listed under the requested relationship is refused', async () => {
    const signing = generateKeyPair('EdDSA');
    const agreementOnly = generateKeyPair('ES256');
    const did = 'did:web:issuer.ps02.test';
    const web = fakeWeb();
    web.serve(
      'http://localhost:28110/.well-known/did.json',
      buildDidDocument(did, [
        { publicJwk: signing.publicJwk, fragment: 'sign' },
        { publicJwk: agreementOnly.publicJwk, fragment: 'enc', relationships: ['keyAgreement'] },
      ]),
    );
    const resolver = createDidResolver({
      fetch: web.fetch,
      hostOverrides: { 'issuer.ps02.test': 'http://localhost:28110' },
    });
    await expect(resolver.resolveVerificationMethod(`${did}#sign`, 'assertionMethod')).resolves.toBeDefined();
    await expect(resolver.resolveVerificationMethod(`${did}#enc`, 'assertionMethod')).rejects.toMatchObject({
      code: 'VERIFICATION_METHOD_NOT_FOUND',
    });
    await expect(resolver.resolveVerificationMethod(`${did}#missing`)).rejects.toMatchObject({
      code: 'VERIFICATION_METHOD_NOT_FOUND',
    });
  });

  it('a bare DID selects the first key of the relationship', async () => {
    const { publicJwk } = generateKeyPair('ES256');
    const did = createDidJwk(publicJwk);
    const resolved = await createDidResolver().resolveVerificationMethod(did, 'authentication');
    expect(resolved.verificationMethod.id).toBe(`${did}#0`);
  });

  it('methods can be restricted', async () => {
    const resolver = createDidResolver({ methods: ['key'] });
    await expect(resolver.resolve(createDidJwk(generateKeyPair('EdDSA').publicJwk))).rejects.toMatchObject({
      code: 'DID_METHOD_UNSUPPORTED',
    });
  });
});
