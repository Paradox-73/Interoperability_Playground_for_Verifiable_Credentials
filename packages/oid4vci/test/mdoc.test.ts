/**
 * mso_mdoc issuance by the reference issuer and the wallet client, both protocol versions
 * (OpenID4VCI draft 13 Appendix A.2, 1.0 Appendix A.2).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodeMdocCredential,
  mdocSessionTranscript,
  presentMdoc,
  verifyMdocDeviceResponse,
} from '@inji-playground/formats';
import {
  FARMER_MDOC_DOCTYPE,
  FARMER_MDOC_NAMESPACE,
  VCI_PROFILES,
  acceptOffer,
  createHolderKey,
} from '../src/index.js';
import { startPlayground, type Playground } from './helpers.js';

let pg: Playground;
beforeEach(async () => {
  pg = await startPlayground();
});
afterEach(async () => {
  await pg.app.close();
});

const CONFIGURATION_ID = 'FarmerCredential_mso_mdoc';

describe.each(VCI_PROFILES)('mso_mdoc issuance, profile %s', (profile) => {
  it('metadata: doctype, claims per namespace, cose_key binding, ES256 key proofs only', async () => {
    const response = await pg.app.inject({
      method: 'GET',
      url: `/ref/issuer/${profile}/.well-known/openid-credential-issuer`,
    });
    const configuration = response.json<{
      credential_configurations_supported: Record<string, Record<string, unknown>>;
    }>().credential_configurations_supported[CONFIGURATION_ID]!;
    expect(configuration).toMatchObject({
      format: 'mso_mdoc',
      doctype: FARMER_MDOC_DOCTYPE,
      cryptographic_binding_methods_supported: ['cose_key'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES256'] } },
    });
    if (profile === 'draft13') {
      // Draft 13 Appendix A.2.2: claims.{namespace}.{element}; JOSE algorithm names.
      expect(configuration.credential_signing_alg_values_supported).toEqual(['ES256']);
      const claims = configuration.claims as Record<string, Record<string, unknown>>;
      expect(Object.keys(claims)).toEqual([FARMER_MDOC_NAMESPACE]);
      expect(claims[FARMER_MDOC_NAMESPACE]!.farmerId).toMatchObject({ mandatory: true });
    } else {
      // 1.0 Appendix A.2.2: COSE algorithm identifiers; claims paths [namespace, element].
      expect(configuration.credential_signing_alg_values_supported).toEqual([-7]);
      const metadata = configuration.credential_metadata as { claims: Array<{ path: string[] }> };
      expect(metadata.claims[0]!.path).toEqual([FARMER_MDOC_NAMESPACE, 'farmerId']);
    }
  });

  it('issues an IssuerSigned bound to the proof key, signed by a document signer the IACA root certifies', async () => {
    const offer = pg.issuer.createOffer({ profile, configurationId: CONFIGURATION_ID });
    const holderKey = createHolderKey('ES256', 'jwk');
    const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, clock: pg.clock, holderKey });
    const received = result.credentials[0]!;
    expect(received.format).toBe('mso_mdoc');
    expect(typeof received.credential).toBe('string');
    expect(received.raw).toBe(received.credential);

    const request = pg.exchanges.find((exchange) => exchange.url.endsWith(`/${profile}/credential`))!;
    const body = JSON.parse(request.requestBody!) as Record<string, unknown>;
    if (profile === 'draft13')
      expect(body).toMatchObject({ format: 'mso_mdoc', doctype: FARMER_MDOC_DOCTYPE });
    else expect(body.credential_configuration_id).toBe(CONFIGURATION_ID);

    const mdoc = decodeMdocCredential(received.raw);
    expect(mdoc.docType).toBe(FARMER_MDOC_DOCTYPE);
    expect(mdoc.issuerSigned.mso.deviceKey).toEqual(holderKey.keyPair.publicJwk);
    const elements = mdoc.issuerSigned.nameSpaces
      .get(FARMER_MDOC_NAMESPACE)!
      .map((item) => item.elementIdentifier);
    expect(elements).toContain('givenName');

    const sessionTranscript = mdocSessionTranscript({
      kind: 'openid4vp-1.0',
      clientId: 'redirect_uri:https://verifier.ps02.test/response',
      responseUri: 'https://verifier.ps02.test/response',
      nonce: 'n',
    });
    const vpToken = presentMdoc({
      credential: received.raw,
      deviceKey: holderKey.keyPair,
      sessionTranscript,
    });
    const verified = await verifyMdocDeviceResponse(vpToken, {
      sessionTranscript,
      trustAnchors: await pg.issuer.mdocTrustAnchors(),
    });
    expect(verified.documents[0]).toMatchObject({ trusted: true, docType: FARMER_MDOC_DOCTYPE });
    expect(verified.documents[0]!.issuer).toContain('Document Signer');
  });

  it('refuses an EdDSA key proof (the configuration lists ES256 only)', async () => {
    const offer = pg.issuer.createOffer({ profile, configurationId: CONFIGURATION_ID });
    await expect(
      acceptOffer(offer.offerUri, { fetch: pg.fetch, clock: pg.clock, holderKey: createHolderKey('EdDSA') }),
    ).rejects.toMatchObject({ oauthError: 'invalid_proof' });
  });
});

it('a scenario docType replaces the configured one (wrong-type)', async () => {
  const offer = pg.issuer.createOffer({
    profile: 'v1',
    configurationId: CONFIGURATION_ID,
    issuance: { doctype: 'test.ps02.playground.landrecord.1' },
  });
  const result = await acceptOffer(offer.offerUri, { fetch: pg.fetch, clock: pg.clock });
  expect(decodeMdocCredential(result.credentials[0]!.raw).docType).toBe('test.ps02.playground.landrecord.1');
});
