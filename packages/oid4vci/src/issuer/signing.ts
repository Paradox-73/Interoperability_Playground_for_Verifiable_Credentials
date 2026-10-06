/**
 * The reference issuer's keys, its DID(s), and the code that signs credentials of each format.
 *
 * Two keys: Ed25519 (ldp_vc proofs and EdDSA SD-JWTs) and P-256 (ES256 SD-JWTs).
 * - `did:web` (hosted runs): one DID for both keys, document served at `<base>/did.json`.
 * - `did:key` / `did:jwk` (offline runs, the default in tests): each key is its own DID, so an ES256
 *   SD-JWT names a different `iss` DID than an ldp_vc of the same issuer.
 *
 * An mso_mdoc names no DID: its MSO is signed by the P-256 key as a document signer, whose test
 * certificate is issued by a test IACA root (ISO/IEC 18013-5 Annex B) made when the first mdoc is
 * signed. The IACA certificate is what a verifier trusts (`mdocTrustAnchors()`).
 */
import { randomUUID } from 'node:crypto';
import {
  FormatError,
  buildDidDocument,
  createDidJwk,
  createDidKey,
  createDidResolver,
  createDocumentLoader,
  createTestCertificate,
  didKeyVerificationMethodId,
  didWebFromUrl,
  generateKeyPair,
  issueLdpVc,
  issueMdoc,
  issueSdJwtVc,
  toPublicJwk,
  type DidDocument,
  type DocumentLoader,
  type KeyPair,
  type PublicJwk,
  type TestCertificate,
} from '@inji-playground/formats';
import type { CredentialConfiguration } from './configurations.js';
import type { HolderBinding } from './proof.js';

export type IssuerDidMethod = 'did:web' | 'did:key' | 'did:jwk';

export interface IssuerKeys {
  ed25519: KeyPair;
  p256: KeyPair;
}

interface SigningIdentity {
  keyPair: KeyPair;
  did: string;
  /** DID URL of the verification method. */
  verificationMethod: string;
}

/**
 * Changes a scenario may ask for when a credential is issued (validity window, type or `vct`,
 * `x5c` instead of a DID `kid`, extra or replaced claims). The happy path sets none of them.
 */
export interface IssuanceOptions {
  validFrom?: Date;
  validUntil?: Date;
  /** ldp_vc: replaces the `type` array. */
  types?: string[];
  /** SD-JWT VC: replaces `vct`. */
  vct?: string;
  /** SD-JWT VC: names the issuer key by a test certificate in `x5c` instead of a DID `kid`. */
  useX5c?: boolean;
  /** mso_mdoc: replaces the docType. */
  doctype?: string;
  /** Merged over the subject claims. */
  claims?: Record<string, unknown>;
}

export interface IssuedCredential {
  /** ldp_vc: the JSON object; SD-JWT VC: the compact string; mso_mdoc: base64url CBOR IssuerSigned. */
  credential: Record<string, unknown> | string;
  /** The issuer DID; for mso_mdoc, the subject of the document signer certificate. */
  issuerDid: string;
  /** Proof type for the run report: the Data Integrity suite or the JOSE algorithm. */
  proofType: string;
}

export class IssuerSigner {
  readonly didMethod: IssuerDidMethod;
  readonly ed25519: SigningIdentity;
  readonly p256: SigningIdentity;
  readonly documentLoader: DocumentLoader;
  private readonly certificates = new Map<string, Promise<TestCertificate>>();
  private mdocChain: Promise<MdocCertificates> | undefined;

  constructor(
    keys: IssuerKeys,
    didMethod: IssuerDidMethod,
    private readonly baseUrl: string,
  ) {
    this.didMethod = didMethod;
    if (didMethod === 'did:web') {
      const did = didWebFromUrl(baseUrl);
      this.ed25519 = { keyPair: keys.ed25519, did, verificationMethod: `${did}#ed25519` };
      this.p256 = { keyPair: keys.p256, did, verificationMethod: `${did}#p256` };
    } else {
      const identity = (keyPair: KeyPair): SigningIdentity => {
        const did =
          didMethod === 'did:key' ? createDidKey(keyPair.publicJwk) : createDidJwk(keyPair.publicJwk);
        const verificationMethod = didMethod === 'did:key' ? didKeyVerificationMethodId(did) : `${did}#0`;
        return { keyPair, did, verificationMethod };
      };
      this.ed25519 = identity(keys.ed25519);
      this.p256 = identity(keys.p256);
    }
    // Signing needs only the pinned contexts; the resolver serves did:key / did:jwk if asked.
    this.documentLoader = createDocumentLoader({
      didResolver: createDidResolver({ methods: ['key', 'jwk'] }),
    });
  }

  /** The DID document served at `<base>/did.json` (did:web only). */
  didDocument(): DidDocument | undefined {
    if (this.didMethod !== 'did:web') return undefined;
    return buildDidDocument(this.ed25519.did, [
      { publicJwk: this.ed25519.keyPair.publicJwk, fragment: 'ed25519' },
      { publicJwk: this.p256.keyPair.publicJwk, fragment: 'p256' },
    ]);
  }

  /** Public keys with their `kid`, for `/.well-known/jwt-vc-issuer`. */
  publicJwks(): PublicJwk[] {
    return [this.ed25519, this.p256].map((identity) => ({
      ...toPublicJwk(identity.keyPair.publicJwk),
      kid: identity.verificationMethod,
      alg: identity.keyPair.alg,
      use: 'sig',
    }));
  }

  async issue(input: {
    configuration: CredentialConfiguration;
    claims: Record<string, unknown>;
    holder: HolderBinding;
    credentialIssuer: string;
    now: Date;
    options: IssuanceOptions;
  }): Promise<IssuedCredential> {
    const { configuration, holder, now, options } = input;
    const claims = { ...input.claims, ...options.claims };
    const validFrom = options.validFrom ?? now;
    const validUntil =
      options.validUntil ?? new Date(validFrom.getTime() + configuration.validitySeconds * 1000);

    if (configuration.format === 'ldp_vc') {
      const ldp = configuration.ldp!;
      const isV2 = ldp.suite === 'eddsa-rdfc-2022';
      const unsigned: Record<string, unknown> = {
        '@context': ldp.contexts,
        id: `urn:uuid:${randomUUID()}`,
        type: options.types ?? ldp.types,
        issuer: this.ed25519.did,
        ...(isV2
          ? { validFrom: isoSeconds(validFrom), validUntil: isoSeconds(validUntil) }
          : { issuanceDate: isoSeconds(validFrom), expirationDate: isoSeconds(validUntil) }),
        credentialSubject: { id: holder.did, ...claims },
      };
      const credential = await issueLdpVc({
        credential: unsigned,
        suite: ldp.suite,
        key: { keyPair: this.ed25519.keyPair, verificationMethod: this.ed25519.verificationMethod },
        documentLoader: this.documentLoader,
        created: now,
      });
      return { credential, issuerDid: this.ed25519.did, proofType: ldp.suite };
    }

    if (configuration.format === 'mso_mdoc') {
      const { doctype, namespace } = configuration.mdoc!;
      if (holder.publicJwk.kty !== 'EC' || holder.publicJwk.crv !== 'P-256') {
        throw new FormatError('KEY_UNSUPPORTED', 'an mdoc device key must be P-256 (ES256 key proof)', {
          spec: 'ISO/IEC 18013-5 section 9.1.5.2',
        });
      }
      const chain = await this.mdocCertificates();
      const credential = issueMdoc({
        docType: options.doctype ?? doctype,
        nameSpaces: { [namespace]: claims },
        issuerKey: this.p256.keyPair,
        x5chain: [chain.documentSigner.x5c],
        deviceKey: holder.publicJwk,
        signed: now,
        validFrom,
        validUntil,
      });
      return { credential, issuerDid: chain.documentSigner.subject, proofType: 'ES256' };
    }

    const signer = configuration.sdJwtAlg === 'ES256' ? this.p256 : this.ed25519;
    const issuerKey = options.useX5c
      ? { keyPair: signer.keyPair, x5c: [(await this.testCertificate(signer.keyPair)).x5c] }
      : { keyPair: signer.keyPair, kid: signer.verificationMethod };
    const credential = await issueSdJwtVc({
      issuer: issuerKey,
      // With x5c the issuer is identified by its URL (SD-JWT VC section 3.5), otherwise by its DID.
      iss: options.useX5c ? input.credentialIssuer : signer.did,
      typ: configuration.format === 'dc+sd-jwt' ? 'dc+sd-jwt' : 'vc+sd-jwt',
      vct: options.vct ?? configuration.vct!,
      claims,
      holder: { jwk: holder.publicJwk },
      issuedAt: now,
      notBefore: validFrom,
      expiresAt: validUntil,
    });
    return { credential, issuerDid: signer.did, proofType: signer.keyPair.alg };
  }

  /**
   * The mdoc certificates: a test IACA root (its own P-256 key, kept in memory) and a document signer
   * certificate for the issuer's P-256 key, created on first use (test-only, never saved).
   */
  mdocCertificates(): Promise<MdocCertificates> {
    this.mdocChain ??= (async () => {
      const iacaKey = generateKeyPair('ES256');
      const iaca = await createTestCertificate({
        subject: 'CN=Playground Test IACA, O=Inji Interop Playground (test only), C=IN',
        keyPair: iacaKey,
        ca: true,
        validDays: 3650,
      });
      const documentSigner = await createTestCertificate({
        subject: 'CN=Reference Issuer mdoc Document Signer, O=Inji Interop Playground (test only), C=IN',
        keyPair: this.p256.keyPair,
        issuer: { keyPair: iacaKey, certificate: iaca },
        dnsNames: [new URL(this.baseUrl).hostname],
      });
      return { iaca, documentSigner };
    })();
    return this.mdocChain;
  }

  /** Self-signed test certificate for `x5c`, created on first use (test-only, never saved). */
  private testCertificate(keyPair: KeyPair): Promise<TestCertificate> {
    let certificate = this.certificates.get(keyPair.alg);
    if (!certificate) {
      certificate = createTestCertificate({
        subject: 'CN=Reference Issuer, O=Inji Interop Playground (test only)',
        keyPair,
        dnsNames: [new URL(this.baseUrl).hostname],
      });
      this.certificates.set(keyPair.alg, certificate);
    }
    return certificate;
  }
}

export interface MdocCertificates {
  /** Root a verifier trusts (ISO/IEC 18013-5 Annex B, IACA). */
  iaca: TestCertificate;
  /** Certificate of the issuer's P-256 key, signed by the IACA; sent in the MSO's `x5chain`. */
  documentSigner: TestCertificate;
}

export function generateIssuerKeys(): IssuerKeys {
  return { ed25519: generateKeyPair('EdDSA'), p256: generateKeyPair('ES256') };
}

/** ISO 8601 without milliseconds, the form VC examples and Inji use. */
function isoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}
