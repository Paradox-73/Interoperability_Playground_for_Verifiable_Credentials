# @inji-playground/formats

Keys, DIDs and credential formats for the playground's reference issuer, wallet and verifier. Every
reference role issues, presents and verifies credentials through this package, so the formats are
implemented once and tested once. It is independent of Inji's code: it is built from the
specifications and from libraries outside the Inji project, which is what lets the playground test
Inji modules against something that is not Inji.

Everything works offline. Network access happens only through a `fetch` function the caller passes
in (did:web documents, JSON-LD contexts that are not pinned).

## What it covers

| Area                | Formats and methods                                                                                                                                                                            | Main functions                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Keys                | Ed25519 (`EdDSA`) and P-256 (`ES256`) as JWK; RFC 7638 thumbprints; key files in a caller-chosen folder                                                                                        | `generateKeyPair`, `toPublicJwk`, `jwkThumbprint`, `loadOrCreateKeyPair`, `signCompactJws`              |
| X.509               | Test CA and leaf certificates for `x5c`; chain validation against trust anchors                                                                                                                | `createTestCertificate`, `validateX5c`                                                                  |
| DIDs                | `did:key` (Ed25519, P-256), `did:jwk` (padded form accepted and flagged), `did:web` (injectable fetch, `*.ps02.test` host override map)                                                        | `createDidKey`, `createDidJwk`, `didWebFromUrl`, `buildDidDocument`, `createDidResolver`                |
| `ldp_vc` / `ldp_vp` | VC 1.1 + `Ed25519Signature2020`; VC 2.0 + `DataIntegrityProof` / `eddsa-rdfc-2022`; presentations with `challenge` and `domain`, signed with `ecdsa-rdfc-2019` by a P-256 holder key           | `issueLdpVc`, `verifyLdpVc`, `createLdpVp`, `verifyLdpVp`, `createDocumentLoader`                       |
| SD-JWT VC           | `typ` `dc+sd-jwt` or `vc+sd-jwt`; `ES256` or `EdDSA`; holder key as `cnf.jwk` or `cnf.kid`; issuer key by DID `kid`, `x5c`, or configured keys; KB-JWT                                         | `issueSdJwtVc`, `presentSdJwtVc`, `verifySdJwtVc`, `decodeSdJwt`                                        |
| `mso_mdoc`          | ISO/IEC 18013-5 IssuerSigned (MSO in COSE_Sign1, ES256, `x5chain`), DeviceResponse with DeviceSignature, SessionTranscript of ISO/IEC TS 18013-7 Annex B and of OpenID4VP 1.0 Appendix B.2.6.1 | `issueMdoc`, `presentMdoc`, `verifyMdocDeviceResponse`, `mdocSessionTranscript`, `decodeMdocCredential` |
| Size                | Credential bytes and PixelPass QR text length (Inji's QR encoding: CBOR, zlib, base45) against version 40 QR capacity                                                                          | `credentialSize`, `pixelPassText`, `qrLevelsThatFit`                                                    |

`statusEntriesOf` reads a credential's status entries, and `checkStatusEntry` checks one against a Token
Status List (draft-ietf-oauth-status-list-21, SD-JWT VC) or a Bitstring Status List v1.0 (`ldp_vc`). The
list must be signed by the credential's own issuer. `fetchLimited` fetches the lists and did:web documents.
It refuses a URL that is not http or https and a private, loopback or link-local address outside
`allowedHosts`, follows no redirects and reads at most 100 KB. `verifyLdpVc` on its own does not check status; it warns that status was not checked. Not
covered: mdoc status, Status List Tokens signed through `x5c`, StatusList2021, and Bitstring entries with
status messages. Tamper primitives for every format are exported separately from
`@inji-playground/formats/tamper` (`src/tamper/`).

## Examples

SD-JWT VC, issuer identified by a did:key, holder key in `cnf.jwk`:

```ts
import {
  createDidKey,
  createDidResolver,
  didKeyVerificationMethodId,
  generateKeyPair,
  issueSdJwtVc,
  presentSdJwtVc,
  verifySdJwtVc,
} from '@inji-playground/formats';

const issuer = generateKeyPair('ES256');
const holder = generateKeyPair('ES256');
const issuerDid = createDidKey(issuer.publicJwk);

const credential = await issueSdJwtVc({
  issuer: { keyPair: issuer, kid: didKeyVerificationMethodId(issuerDid) },
  iss: issuerDid,
  typ: 'dc+sd-jwt',
  vct: 'https://playground.ps02.test/vct/farmer/v1',
  claims: { given_name: 'Asha', family_name: 'Rao' },
  holder: { jwk: holder.publicJwk },
  expiresAt: new Date(Date.now() + 3_600_000),
});

const presentation = await presentSdJwtVc({
  sdJwt: credential,
  disclose: ['given_name'],
  holderKey: holder,
  audience: 'redirect_uri:https://verifier.ps02.test/response', // the verifier's client_id
  nonce: requestNonce,
});

const result = await verifySdJwtVc(presentation, {
  didResolver: createDidResolver(),
  keyBinding: { nonce: requestNonce, audience: 'redirect_uri:https://verifier.ps02.test/response' },
});
// result.claims.given_name === 'Asha'; family_name was not disclosed.
```

`ldp_vc` (VC 1.1, Ed25519Signature2020) and an `ldp_vp` with challenge and domain:

```ts
import {
  createDidKey,
  createDidResolver,
  createDocumentLoader,
  didKeyVerificationMethodId,
  generateKeyPair,
  issueLdpVc,
  createLdpVp,
  verifyLdpVp,
} from '@inji-playground/formats';

const documentLoader = createDocumentLoader({ didResolver: createDidResolver() }); // no network
const issuerKeys = generateKeyPair('EdDSA');
const issuerDid = createDidKey(issuerKeys.publicJwk);
const issuer = { keyPair: issuerKeys, verificationMethod: didKeyVerificationMethodId(issuerDid) };
const holderKeys = generateKeyPair('EdDSA');
const holder = {
  keyPair: holderKeys,
  verificationMethod: didKeyVerificationMethodId(createDidKey(holderKeys.publicJwk)),
};
// unsignedVc11: '@context' starting with https://www.w3.org/2018/credentials/v1, issuer = issuerDid

const vc = await issueLdpVc({
  credential: unsignedVc11,
  suite: 'Ed25519Signature2020',
  key: issuer,
  documentLoader,
});
const vp = await createLdpVp({
  credentials: [vc],
  suite: 'Ed25519Signature2020',
  key: holder,
  challenge: nonce,
  domain: clientId,
  documentLoader,
});
await verifyLdpVp(vp, { documentLoader, expectedChallenge: nonce, expectedDomain: clientId });
```

Use `suite: 'eddsa-rdfc-2022'` with a VC 2.0 credential (`@context` starting with
`https://www.w3.org/ns/credentials/v2`, dates in `validFrom` / `validUntil`).

did:web in local runs, where the host names do not exist on the internet:

```ts
const resolver = createDidResolver({
  hostOverrides: { 'issuer.ps02.test': 'http://localhost:28110' },
  fetch: recordingFetch, // optional: the recording layer passes its own client
});
// did:web:issuer.ps02.test -> GET http://localhost:28110/.well-known/did.json
```

Only `*.ps02.test` and `localhost` hosts can be overridden, so a configuration mistake cannot redirect
the DID of a real domain. Without an override the document is fetched over HTTPS, as the did:web
specification requires.

`mso_mdoc` (ISO/IEC 18013-5), from issuance to verification over OpenID4VP 1.0:

```ts
import {
  createTestCertificate,
  generateKeyPair,
  issueMdoc,
  mdocSessionTranscript,
  presentMdoc,
  verifyMdocDeviceResponse,
} from '@inji-playground/formats';

// Test IACA root and a document signer certificate it issues (ISO 18013-5 Annex B, test only).
const iacaKey = generateKeyPair('ES256');
const iaca = await createTestCertificate({ subject: 'CN=Test IACA', keyPair: iacaKey, ca: true });
const signerKey = generateKeyPair('ES256');
const signer = await createTestCertificate({
  subject: 'CN=Test Document Signer',
  keyPair: signerKey,
  issuer: { keyPair: iacaKey, certificate: iaca },
});
const device = generateKeyPair('ES256'); // the holder key from the key proof JWT

// base64url CBOR IssuerSigned, the `credential` of OpenID4VCI 1.0 Appendix A.2.4.
const credential = issueMdoc({
  docType: 'test.ps02.playground.farmer.1',
  nameSpaces: { 'test.ps02.playground.farmer.1': { givenName: 'Asha', familyName: 'Rao' } },
  issuerKey: signerKey,
  x5chain: [signer.x5c],
  deviceKey: device.publicJwk,
  validFrom: new Date(),
  validUntil: new Date(Date.now() + 3_600_000),
});

// Both sides build the same SessionTranscript from the request (OpenID4VP 1.0 Appendix B.2.6.1).
const sessionTranscript = mdocSessionTranscript({
  kind: 'openid4vp-1.0',
  clientId: 'redirect_uri:https://verifier.ps02.test/response',
  responseUri: 'https://verifier.ps02.test/response',
  nonce: requestNonce,
});
const vpToken = presentMdoc({
  credential,
  disclose: [['test.ps02.playground.farmer.1', 'givenName']],
  deviceKey: device,
  sessionTranscript,
});
const { documents } = await verifyMdocDeviceResponse(vpToken, {
  sessionTranscript,
  trustAnchors: [iaca.pem],
});
// documents[0].claims = { 'test.ps02.playground.farmer.1': { givenName: 'Asha' } }
```

For the drafts (`inji-draft` profile) use `kind: 'iso-18013-7-annex-b'` with the wallet's
`mdocGeneratedNonce`. `decodeMdocCredential` also reads Inji Certify 0.14.0's encoding, base64url
CBOR of `{"docType": ..., "issuerSigned": ...}`; `mdocIssuerFacts` gives docType, algorithm and
document signer subject for a report; `mdocToJson` gives a readable JSON view of any of these
structures.

## Errors

Every failure is a `FormatError` with a stable `code` (the full list is `FORMAT_ERROR_CODES` in
`src/errors.ts`), a `spec` string naming the rule that was broken, and `details` with the expected and
received values. `error.toJSON()` gives a plain object for run reports. Examples:

| Code                                                | Meaning                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `KB_JWT_NONCE_MISMATCH`, `KB_JWT_AUDIENCE_MISMATCH` | The KB-JWT was made for another request or another verifier (RFC 9901 section 7.3 step 5f)           |
| `KB_JWT_SD_HASH_MISMATCH`                           | Disclosures were added or removed after the holder signed (RFC 9901 section 4.3.1)                   |
| `SDJWT_DISCLOSURE_INVALID`                          | A disclosure does not match a digest in the issuer-signed JWT (RFC 9901 section 7.1 steps 3-5)       |
| `LDP_PROOF_INVALID`                                 | A Data Integrity proof does not verify (credential changed, wrong key)                               |
| `LDP_CHALLENGE_MISMATCH`, `LDP_DOMAIN_MISMATCH`     | The presentation was made for another nonce or client_id (OpenID4VP 1.0 Appendix B.1.3.2.5)          |
| `LDP_EXPIRED`, `SDJWT_EXPIRED`                      | Outside the validity period; checked before the proof so reports show EXPIRED, not a generic failure |
| `CONTEXT_NOT_PINNED`                                | A JSON-LD context is neither pinned nor fetchable because network access is off                      |
| `MDOC_ISSUER_SIGNATURE_INVALID`                     | The MSO's COSE_Sign1 does not verify with the `x5chain` leaf key (ISO 18013-5 section 9.3.1 step 2)  |
| `MDOC_DIGEST_MISMATCH`                              | A presented element is not the one the issuer hashed into the MSO (section 9.3.1 step 4)             |
| `MDOC_DEVICE_SIGNATURE_INVALID`                     | DeviceSignature does not verify with the MSO deviceKey over this request's SessionTranscript         |
| `MDOC_EXPIRED`, `MDOC_NOT_YET_VALID`                | Outside `validityInfo`; checked after the issuer signature, so reports show EXPIRED                  |
| `MDOC_DOCTYPE_MISMATCH`                             | The document's docType differs from the MSO's or from the expected one (section 9.3.1 step 5)        |
| `X5C_UNTRUSTED`                                     | An `x5c` / `x5chain` that does not end at a configured trust anchor                                  |

## Design notes

- **Key binding is checked by this package, not by the SD-JWT library.** `@sd-jwt/sd-jwt-vc` 0.21.1
  verifies a KB-JWT only when it is given a nonce and skips it silently otherwise, and compares `aud`
  only when the caller also passes `expectedKeyBindingAudience` (`@sd-jwt/core` 0.21.1,
  `dist/index.mjs` lines 1091 and 641). A verifier that forgets one option would accept a replayed or
  misdirected presentation. `verifySdJwtVc` therefore requires an explicit `keyBinding` policy
  (`{ nonce, audience }` or `false`) and performs every check of RFC 9901 section 7.3 step 5 itself.
  The library is used only for disclosure processing.
- **Padded did:jwk.** Inji Certify writes did:jwk values with base64 padding (`=`), which the did:jwk
  specification does not allow (inji/inji-certify#1054). `resolveDidJwk` accepts them and sets
  `didResolutionMetadata.nonCanonical`, `canonicalDid` and a warning, so a run report can show the gap
  instead of failing without explanation. `verifyLdpVp` compares the holder DID literally, so a padded
  and an unpadded DID of the same key are reported as `LDP_HOLDER_MISMATCH`.
- **did:key verification method types differ between resolvers** (measured 2026-10-04:
  `key-did-resolver` gives `Ed25519VerificationKey2018`, `@digitalbazaar/did-method-key`
  `Ed25519VerificationKey2020` or `Multikey`). The type is an option of `resolveDidKey`; the default is
  `Ed25519VerificationKey2020` for Ed25519 and `JsonWebKey2020` for P-256. Verification accepts all of
  them.
- **Pinned JSON-LD contexts.** Served offline: DID v1, credentials v1 and v2 (with
  `undefined-terms/v2`), ed25519-2020, x25519-2020, veres-one (all from the npm context packages, fixed
  by `package-lock.json`), plus this project's vocabulary at
  `https://playground.ps02.test/contexts/v1.jsonld`. That vocabulary sets `@vocab`, so no claim of a
  reference credential is dropped from the signed data. Other contexts fail with `CONTEXT_NOT_PINNED`
  unless the loader is created with `network` (HTTPS only, cached in a folder the caller chooses), or
  passed in `contexts`. The standalone Data Integrity (`https://w3id.org/security/data-integrity/v2`)
  and Multikey (`https://w3id.org/security/multikey/v1`) contexts are not pinned: no package in the
  lock file ships them. VC 2.0 credentials do not need the Data Integrity context, because the
  credentials v2 context already defines `DataIntegrityProof`; a VC 1.1 credential with a
  `DataIntegrityProof` would, which is one reason `eddsa-rdfc-2022` is only offered for VC 2.0.
- **Raw signatures, not a JOSE library, for JWS.** `signCompactJws` signs with `node:crypto` so tamper
  scenarios can re-sign altered payloads byte for byte and the inspector shows exactly what was
  signed. `jose` is used in tests as an independent cross-check (thumbprints).
- **Untyped libraries.** The Digital Bazaar libraries and PixelPass ship without TypeScript types.
  `src/vendor.d.ts` declares only the members this package calls; files that import them reference it
  with `/// <reference path>` so other packages that compile these sources (through the `source`
  export condition) see the declarations too. Their types are not re-exported from `src/index.ts`.

- **mdoc CBOR with `cbor-x`, and nothing re-encoded that is signed.** COSE and the MSO are written
  here (about 600 lines) rather than taken from an mdoc library, so tamper primitives can change one
  byte or one element and the inspector can show the exact structure. Signatures and digests are
  checked over the bytes as received: COSE protected headers and payloads, and `#6.24` items (their
  encoding is the tag plus the received byte string). `cbor-x` extensions are global to the module,
  and `@owf/cose` (loaded with `@sd-jwt/sd-jwt-vc`) registers decoders that turn tag 24 into its own
  `DataItem` and tag 1004 into `DateOnly`; `decodeCbor` turns those back into plain tags, so the
  result does not depend on which packages a process loaded.
- **mdoc trust.** `verifyMdocDeviceResponse` requires the `x5chain` to end at a trust anchor unless
  `requireTrusted: false`. Trust anchors are the same base64 DER or PEM certificates `validateX5c`
  takes for SD-JWT `x5c`, so an issuer certificate learnt at run time (Inji Certify's) is added the same
  way. The ISO certificate profiles (IACA and document signer extensions, extended key usage
  `1.0.18013.5.1.2`) are not checked; the reference issuer's test certificates do not carry them.
- **mdoc device authentication** is DeviceSignature only. `deviceMac` needs a session key from
  proximity engagement, which OpenID4VP does not have; a DeviceResponse with it is rejected.

## Tests

`npm test -w @inji-playground/formats` runs this package's tests; the counts are in the
[test report](../../docs/test-report/README.md#unit-and-integration-tests-per-package). `test/tamper.test.ts`
covers the tamper primitives of the other formats. Test names start with the specification rule they check.

| File                        | What it shows                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/sd-jwt.test.ts`       | Issue, present and verify for ES256 and EdDSA; wrong nonce, wrong aud, altered disclosure, removed disclosure (sd_hash), foreign KB key, changed payload, missing KB-JWT, stale KB-JWT, expired, not yet valid, `vc+sd-jwt` accepted, wrong `vct`, kid/iss mismatch, `alg: none`, wrong KB `typ`, nested disclosures, `cnf.kid`, configured issuer keys, `x5c` with and without a trust anchor                 |
| `test/ldp.test.ts`          | VC 1.1 + Ed25519Signature2020 and VC 2.0 + eddsa-rdfc-2022 round trips with global `fetch` replaced by a function that fails the test if called; tampered credential, wrong key, expired and not-yet-valid; did:jwk and did:web issuers; presentations with challenge and domain enforced, rewritten challenge, holder mismatch, tampered embedded credential; document loader offline and with a file cache   |
| `test/did.test.ts`          | did:key specification test vectors (Ed25519, P-256) and agreement with `key-did-resolver`; did:jwk specification example, padded and unpadded forms, private key refused; did:web URL rules from the specification, host override map, refused overrides, id mismatch, HTTP errors; verification relationships                                                                                                 |
| `test/keys.test.ts`         | Sign/verify, RFC 7638 thumbprints checked against `jose`, JWS round trip, alg/key mismatch, key files, x5c chains                                                                                                                                                                                                                                                                                              |
| `test/size.test.ts`         | PixelPass round trip, a small credential fits QR version 40, a credential with an 8 KB photo does not                                                                                                                                                                                                                                                                                                          |
| `test/mdoc.test.ts`         | SessionTranscript of Annex B and of OpenID4VP 1.0 (byte level), IssuerSigned in both encodings, inspector JSON; issue, present with selective disclosure and verify in both transcripts; another nonce or client_id, another device key, flipped issuer signature, altered and unreferenced element, expired, not yet valid, untrusted and forged `x5chain`, docType mismatches, error status, missing element |
| `test/dependencies.test.ts` | Every library loads as ESM inside Vitest on Node 24                                                                                                                                                                                                                                                                                                                                                            |
| `test/status.test.ts`       | Status entries of both formats; Token Status List and Bitstring Status List valid, revoked, suspended; a list signed by another key or for another uri; private addresses                                                                                                                                                                                                                                      |

## Specifications

RFC 9901 (SD-JWT), draft-ietf-oauth-sd-jwt-vc-19, RFC 7515/7517/7518/7519/7638/7800/8037/8725,
W3C VC Data Model 1.1 and 2.0, VC Data Integrity 1.0, vc-di-eddsa 1.0, the Ed25519Signature2020 CCG
report, DID Core 1.0, did:key, did:jwk and did:web method specifications, OpenID4VP 1.0 Appendix B,
ISO/IEC 18013-5:2021 (mdoc), ISO/IEC TS 18013-7 Annex B, RFC 8949 (CBOR), RFC 9052/9053 (COSE), RFC 9360
(`x5chain`).
