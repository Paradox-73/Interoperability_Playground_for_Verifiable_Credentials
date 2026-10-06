/**
 * mso_mdoc presentations end to end in both profiles: Presentation Exchange as ISO/IEC TS 18013-7
 * Annex B asks (`inji-draft`) and DCQL (`final-1.0`, OpenID4VP 1.0 Appendix B.2), with the
 * SessionTranscript of each.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createTestCertificate,
  generateKeyPair,
  issueMdoc,
  type KeyPair,
  type TestCertificate,
} from '@inji-playground/formats';
import {
  addUnreferencedMdocElement,
  alterMdocElement,
  flipMdocIssuerSignature,
} from '@inji-playground/formats/tamper';
import type { VpProfile } from '@inji-playground/protocol';
import {
  MDOC_GENERATED_NONCE_PARAMETER,
  type ClientIdScheme,
  type PresentationDefinition,
  type StoredCredential,
} from '../src/index.js';
import { harness, postForm } from './helpers.js';

const networkAttempts = vi.fn((url: unknown) =>
  Promise.reject(new Error(`network disabled in tests: ${String(url)}`)),
);
beforeAll(() => vi.stubGlobal('fetch', networkAttempts));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(networkAttempts).not.toHaveBeenCalled();
});

const DOCTYPE = 'test.ps02.playground.farmer.1';
const NS = 'test.ps02.playground.farmer.1';
const DAY = 86_400_000;
const QUERY = { type: DOCTYPE, claims: [`${NS}/givenName`, `${NS}/farmerId`] };

let iaca: TestCertificate;
let documentSigner: { keyPair: KeyPair; certificate: TestCertificate };
const deviceKey = generateKeyPair('ES256');

beforeAll(async () => {
  const iacaKey = generateKeyPair('ES256');
  iaca = await createTestCertificate({ subject: 'CN=Test IACA', keyPair: iacaKey, ca: true });
  const keyPair = generateKeyPair('ES256');
  documentSigner = {
    keyPair,
    certificate: await createTestCertificate({
      subject: 'CN=Test Document Signer',
      keyPair,
      issuer: { keyPair: iacaKey, certificate: iaca },
    }),
  };
});

function farmerMdoc(
  options: { expired?: boolean; docType?: string; encoding?: 'inji-certify' } = {},
): StoredCredential {
  const now = Date.now();
  const raw = issueMdoc({
    docType: options.docType ?? DOCTYPE,
    nameSpaces: {
      [NS]: { farmerId: '2154189532', givenName: 'Gorge', familyName: 'Cooper', birthDate: '1990-05-25' },
    },
    issuerKey: documentSigner.keyPair,
    x5chain: [documentSigner.certificate.x5c],
    deviceKey: deviceKey.publicJwk,
    validFrom: new Date(now - 30 * DAY),
    validUntil: new Date(options.expired ? now - DAY : now + 30 * DAY),
    ...(options.encoding ? { encoding: options.encoding } : {}),
  });
  return { id: 'farmer-mdoc', format: 'mso_mdoc', raw };
}

function mdocHarness(trusted = true) {
  const h = harness({ holder: { keyPair: deviceKey } });
  if (trusted) h.verifier.addX5cTrustAnchors([iaca.pem]);
  return h;
}

async function run(
  profile: VpProfile,
  credential: StoredCredential,
  options: {
    scheme?: ClientIdScheme;
    trusted?: boolean;
    change?: (form: Record<string, string>) => void;
  } = {},
) {
  const { verifier, wallet, fetch } = mdocHarness(options.trusted ?? true);
  const created = verifier.createRequest({
    profile,
    format: 'mso_mdoc',
    query: QUERY,
    clientIdScheme: options.scheme ?? 'did',
  });
  const request = await wallet.resolveRequest(created.uri);
  let matches;
  try {
    matches = wallet.selectCredentials(request, [credential]);
  } catch {
    // Present it anyway, as a wallet that ignores the query would (wrong-type).
    const { credentialView } = await import('../src/index.js');
    const queryId =
      request.presentationDefinition?.input_descriptors[0]?.id ??
      (request.dcqlQuery?.credentials as Array<{ id: string }>)[0]!.id;
    matches = [{ queryId, credential, view: credentialView(credential), requestedPaths: [] }];
  }
  const response = await wallet.buildResponse(request, matches);
  const form = { ...response.form };
  options.change?.(form);
  const posted = await postForm(fetch, created.responseUri, form);
  return { created, request, response, form, posted, report: await verifier.awaitResult(created.handle) };
}

describe.each<[VpProfile, ClientIdScheme]>([
  ['inji-draft', 'did'],
  ['inji-draft', 'redirect_uri'],
  ['final-1.0', 'did'],
  ['final-1.0', 'redirect_uri'],
])('mso_mdoc, %s, %s client id', (profile, scheme) => {
  it('VALID, with only the requested elements disclosed', async () => {
    const { report, posted, created } = await run(profile, farmerMdoc(), { scheme });
    expect(posted.status).toBe(200);
    expect(report.outcome).toBe('VALID');
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
    expect(report.presentations[0]).toMatchObject({
      format: 'mso_mdoc',
      proofType: 'ES256',
      issuer: 'CN=Test Document Signer',
    });
    expect(report.claims).toEqual({ [NS]: { givenName: 'Gorge', farmerId: '2154189532' } });
    const formats = (created.parameters.client_metadata as Record<string, Record<string, unknown>>)[
      profile === 'inji-draft' ? 'vp_formats' : 'vp_formats_supported'
    ]!;
    expect(formats.mso_mdoc).toEqual(
      profile === 'inji-draft'
        ? { alg: ['ES256'] }
        : { issuerauth_alg_values: [-7], deviceauth_alg_values: [-7] },
    );
  });
});

describe('mso_mdoc request shapes', () => {
  it('inji-draft: input descriptor id is the docType, fields $[namespace][element] with intent_to_retain (ISO/IEC TS 18013-7 Annex B.3.1.1)', () => {
    const { verifier } = mdocHarness();
    const created = verifier.createRequest({ profile: 'inji-draft', format: 'mso_mdoc', query: QUERY });
    const definition = created.parameters.presentation_definition as PresentationDefinition;
    const [descriptor] = definition.input_descriptors;
    expect(descriptor).toMatchObject({
      id: DOCTYPE,
      format: { mso_mdoc: { alg: ['ES256'] } },
      constraints: {
        limit_disclosure: 'required',
        fields: [
          { path: [`$['${NS}']['givenName']`], intent_to_retain: false },
          { path: [`$['${NS}']['farmerId']`], intent_to_retain: false },
        ],
      },
    });
  });

  it('final-1.0: DCQL format mso_mdoc, meta.doctype_value, claims path [namespace, element] (OpenID4VP 1.0 Appendix B.2.4)', () => {
    const { verifier } = mdocHarness();
    const created = verifier.createRequest({ profile: 'final-1.0', format: 'mso_mdoc', query: QUERY });
    expect(created.parameters.dcql_query).toEqual({
      credentials: [
        {
          id: 'credential',
          format: 'mso_mdoc',
          meta: { doctype_value: DOCTYPE },
          claims: [
            { path: [NS, 'givenName'], intent_to_retain: false },
            { path: [NS, 'farmerId'], intent_to_retain: false },
          ],
        },
      ],
    });
  });

  it('a claim that is not <namespace>/<element> is refused when the request is made', () => {
    const { verifier } = mdocHarness();
    expect(() =>
      verifier.createRequest({ profile: 'final-1.0', format: 'mso_mdoc', query: { claims: ['givenName'] } }),
    ).toThrow(/namespace/);
  });
});

describe('mso_mdoc SessionTranscript binding', () => {
  it('inji-draft: the wallet sends mdoc_generated_nonce next to vp_token; without it the response is INVALID', async () => {
    const ok = await run('inji-draft', farmerMdoc());
    expect(ok.form[MDOC_GENERATED_NONCE_PARAMETER]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(ok.response.mdocGeneratedNonce).toBe(ok.form[MDOC_GENERATED_NONCE_PARAMETER]);
    const missing = await run('inji-draft', farmerMdoc(), {
      change: (form) => delete form[MDOC_GENERATED_NONCE_PARAMETER],
    });
    expect(missing.report.outcome).toBe('INVALID');
    expect(missing.report.checks.find((check) => check.id === 'format')?.detail).toContain(
      'mdoc_generated_nonce',
    );
  });

  it('inji-draft: another mdoc generated nonce than the one signed fails holder binding', async () => {
    const { report } = await run('inji-draft', farmerMdoc(), {
      change: (form) => (form[MDOC_GENERATED_NONCE_PARAMETER] = 'another-nonce-value'),
    });
    expect(report.outcome).toBe('INVALID');
    expect(report.checks.find((check) => check.id === 'holder-binding')).toMatchObject({ status: 'fail' });
  });

  it('final-1.0: a final-1.0 presentation is not mistaken for an inji-draft one (no mdoc_generated_nonce sent)', async () => {
    const { form, report } = await run('final-1.0', farmerMdoc());
    expect(form[MDOC_GENERATED_NONCE_PARAMETER]).toBeUndefined();
    expect(report.outcome).toBe('VALID');
  });
});

describe.each<VpProfile>(['inji-draft', 'final-1.0'])('mso_mdoc failures, %s', (profile) => {
  const failedCheck = (report: { checks: { id: string; status: string }[] }) =>
    report.checks.find((check) => check.status === 'fail')?.id;

  it('expired mdoc -> EXPIRED (ISO 18013-5 section 9.3.1 step 6)', async () => {
    const { report } = await run(profile, farmerMdoc({ expired: true }));
    expect(report.outcome).toBe('EXPIRED');
    expect(failedCheck(report)).toBe('validity');
  });

  it('flipped issuer signature -> INVALID, signature', async () => {
    const credential = farmerMdoc();
    const { report } = await run(profile, { ...credential, raw: flipMdocIssuerSignature(credential.raw) });
    expect(report.outcome).toBe('INVALID');
    expect(failedCheck(report)).toBe('signature');
    expect(report.errors[0]?.code).toBe('MDOC_ISSUER_SIGNATURE_INVALID');
  });

  it('issuer certificate not trusted -> INVALID, signature (X5C_UNTRUSTED)', async () => {
    const { report } = await run(profile, farmerMdoc(), { trusted: false });
    expect(report.outcome).toBe('INVALID');
    expect(report.errors[0]?.code).toBe('X5C_UNTRUSTED');
  });

  it('element altered or added in the vp_token -> INVALID, signature (MDOC_DIGEST_MISMATCH)', async () => {
    for (const tamper of [
      (token: string) => alterMdocElement(token, 'givenName', 'Mallory'),
      (token: string) => addUnreferencedMdocElement(token, 'injected', true),
    ]) {
      const { report } = await run(profile, farmerMdoc(), {
        change: (form) => {
          const token: unknown = JSON.parse(form.vp_token!);
          form.vp_token = JSON.stringify(
            typeof token === 'string'
              ? tamper(token)
              : Object.fromEntries(
                  Object.entries(token as Record<string, string[]>).map(([id, list]) => [
                    id,
                    list.map(tamper),
                  ]),
                ),
          );
        },
      });
      expect(report.outcome).toBe('INVALID');
      expect(report.errors[0]?.code).toBe('MDOC_DIGEST_MISMATCH');
    }
  });

  it('another docType than the one requested -> INVALID, query', async () => {
    const { report } = await run(profile, farmerMdoc({ docType: 'test.ps02.playground.landrecord.1' }));
    expect(report.outcome).toBe('INVALID');
    expect(report.checks.find((check) => check.id === 'query')).toMatchObject({ status: 'fail' });
  });

  it("Inji Certify's {docType, issuerSigned} credential encoding presents and verifies", async () => {
    const { report } = await run(profile, farmerMdoc({ encoding: 'inji-certify' }));
    expect(report.outcome).toBe('VALID');
  });
});
