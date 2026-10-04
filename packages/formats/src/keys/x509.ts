/**
 * X.509 helpers for SD-JWT VC issuers that identify their key with an `x5c` header (SD-JWT VC draft 19
 * section 2.5, "Inline X.509 Certificates"), and for the verifier that validates such a chain.
 *
 * Certificates made here are test certificates for the playground's own roles: they are generated at
 * run time and never committed.
 */
// @peculiar/x509 resolves its algorithm providers through tsyringe, which needs the Reflect metadata
// API installed before the library loads.
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { randomBytes, type webcrypto } from 'node:crypto';
import { FormatError } from '../errors.js';
import { toPublicJwk, type KeyPair, type PublicJwk } from './keys.js';

x509.cryptoProvider.set(globalThis.crypto);

function webCryptoAlgorithm(keyPair: KeyPair): webcrypto.EcKeyImportParams | webcrypto.Algorithm {
  return keyPair.alg === 'EdDSA' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' };
}

function signingAlgorithm(keyPair: KeyPair): webcrypto.Algorithm | webcrypto.EcdsaParams {
  return keyPair.alg === 'EdDSA' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
}

async function importCryptoKeys(keyPair: KeyPair): Promise<webcrypto.CryptoKeyPair> {
  const algorithm = webCryptoAlgorithm(keyPair);
  const { kid: _kid, alg: _alg, use: _use, ...privateJwk } = keyPair.privateJwk;
  const { kid: _k, alg: _a, use: _u, ...publicJwk } = keyPair.publicJwk;
  return {
    privateKey: await crypto.subtle.importKey('jwk', privateJwk, algorithm, true, ['sign']),
    publicKey: await crypto.subtle.importKey('jwk', publicJwk, algorithm, true, ['verify']),
  };
}

export interface TestCertificate {
  /** DER bytes, base64 (not base64url): the form an `x5c` array element takes (RFC 7515 section 4.1.6). */
  x5c: string;
  pem: string;
  subject: string;
}

export interface TestCertificateOptions {
  /** Distinguished name, for example `CN=Reference Issuer, O=Inji Interop Playground (test only)`. */
  subject: string;
  /** Key pair whose public key the certificate certifies. */
  keyPair: KeyPair;
  /** Signer; omitted for a self-signed certificate. */
  issuer?: { keyPair: KeyPair; certificate: TestCertificate };
  /** Marks the certificate as a CA (basicConstraints cA=true, keyCertSign). */
  ca?: boolean;
  /** SubjectAltName DNS names, for example for `x509_san_dns` client identifiers. */
  dnsNames?: string[];
  notBefore?: Date;
  validDays?: number;
}

/** Creates a test certificate, self-signed or signed by `issuer`. */
export async function createTestCertificate(options: TestCertificateOptions): Promise<TestCertificate> {
  const notBefore = options.notBefore ?? new Date(Date.now() - 60_000);
  const notAfter = new Date(notBefore.getTime() + (options.validDays ?? 365) * 86_400_000);
  const subjectKeys = await importCryptoKeys(options.keyPair);
  const signer = options.issuer ? await importCryptoKeys(options.issuer.keyPair) : subjectKeys;
  const signerKeyPair = options.issuer?.keyPair ?? options.keyPair;
  const extensions: x509.Extension[] = [
    new x509.BasicConstraintsExtension(options.ca === true, undefined, true),
    new x509.KeyUsagesExtension(
      options.ca === true
        ? x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign
        : x509.KeyUsageFlags.digitalSignature,
      true,
    ),
    await x509.SubjectKeyIdentifierExtension.create(subjectKeys.publicKey),
  ];
  if (options.dnsNames && options.dnsNames.length > 0) {
    extensions.push(
      new x509.SubjectAlternativeNameExtension(options.dnsNames.map((value) => ({ type: 'dns', value }))),
    );
  }
  const certificate = await x509.X509CertificateGenerator.create({
    // Positive 16-byte serial (RFC 5280 section 4.1.2.2 allows up to 20 octets).
    serialNumber: `01${randomBytes(15).toString('hex')}`,
    subject: options.subject,
    issuer: options.issuer?.certificate.subject ?? options.subject,
    notBefore,
    notAfter,
    signingAlgorithm: signingAlgorithm(signerKeyPair),
    publicKey: subjectKeys.publicKey,
    signingKey: signer.privateKey,
    extensions,
  });
  return {
    x5c: certificate.toString('base64'),
    pem: certificate.toString('pem'),
    subject: certificate.subject,
  };
}

export interface X5cValidation {
  /** Public key of the end-entity (first) certificate, which signed the JWT. */
  leafJwk: PublicJwk;
  leafSubject: string;
  /** True when the chain ends at one of the trust anchors given by the caller. */
  trusted: boolean;
}

function parseCertificate(encoded: string, index: number): x509.X509Certificate {
  try {
    return new x509.X509Certificate(encoded);
  } catch (cause) {
    throw new FormatError('X5C_INVALID', `x5c[${index}] is not a DER certificate in base64`, { cause });
  }
}

/**
 * Validates an `x5c` chain: every certificate is inside its validity period at `now`, each one is
 * signed by the next, and (when `trustAnchors` is given) the last one is a trust anchor or is signed
 * by one. Without trust anchors the chain is checked for consistency only and `trusted` is false;
 * the verifier's policy decides whether that is acceptable.
 */
export async function validateX5c(
  x5c: unknown,
  options: { trustAnchors?: string[]; now?: Date } = {},
): Promise<X5cValidation> {
  if (!Array.isArray(x5c) || x5c.length === 0 || !x5c.every((item) => typeof item === 'string')) {
    throw new FormatError('X5C_INVALID', 'x5c must be a non-empty array of base64 strings', {
      spec: 'RFC 7515 section 4.1.6',
    });
  }
  const now = options.now ?? new Date();
  const chain = x5c.map((item, index) => parseCertificate(item, index));
  for (const [index, certificate] of chain.entries()) {
    if (certificate.notBefore > now || certificate.notAfter < now) {
      throw new FormatError(
        'X5C_INVALID',
        `x5c[${index}] (${certificate.subject}) is outside its validity period`,
        {
          details: {
            notBefore: certificate.notBefore.toISOString(),
            notAfter: certificate.notAfter.toISOString(),
          },
        },
      );
    }
    const next = chain[index + 1];
    if (next && !(await certificate.verify({ publicKey: next.publicKey, signatureOnly: true }))) {
      throw new FormatError('X5C_INVALID', `x5c[${index}] is not signed by x5c[${index + 1}]`);
    }
  }
  const leaf = chain[0]!;
  const last = chain[chain.length - 1]!;
  let trusted = false;
  for (const [index, anchorText] of (options.trustAnchors ?? []).entries()) {
    let anchor: x509.X509Certificate;
    try {
      anchor = new x509.X509Certificate(anchorText);
    } catch (cause) {
      throw new FormatError('X5C_INVALID', `trust anchor ${index} is not a certificate`, { cause });
    }
    const sameCertificate = Buffer.from(anchor.rawData).equals(Buffer.from(last.rawData));
    if (sameCertificate || (await last.verify({ publicKey: anchor.publicKey, signatureOnly: true }))) {
      trusted = true;
      break;
    }
  }
  // @peculiar/x509 types its keys with the DOM CryptoKey, which this Node-only build does not load.
  const leafKey = (await leaf.publicKey.export()) as unknown as webcrypto.CryptoKey;
  const exported = await crypto.subtle.exportKey('jwk', leafKey);
  // WebCrypto adds alg/key_ops/ext; only the key members are kept.
  const leafJwk = toPublicJwk({ kty: exported.kty, crv: exported.crv, x: exported.x, y: exported.y });
  return { leafJwk, leafSubject: leaf.subject, trusted };
}
