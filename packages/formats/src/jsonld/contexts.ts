// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packages that compile these sources need the declarations too (vendor.d.ts)
/// <reference path="../vendor.d.ts" />
/**
 * JSON-LD contexts available without network access.
 *
 * - The W3C and security contexts come from the npm packages that `@digitalbazaar/security-document-loader`
 *   bundles (credentials v1 and v2, DID v1, ed25519-2020, x25519-2020, veres-one). Their versions are
 *   fixed by package-lock.json, so the bytes canonicalised in a test never change between runs.
 * - The playground vocabulary below is written for this project.
 */
import { securityLoader } from '@digitalbazaar/security-document-loader';

export const CREDENTIALS_V1_URL = 'https://www.w3.org/2018/credentials/v1';
export const CREDENTIALS_V2_URL = 'https://www.w3.org/ns/credentials/v2';
export const ED25519_2020_SUITE_URL = 'https://w3id.org/security/suites/ed25519-2020/v1';

/**
 * Vocabulary for the claims of the playground's reference credentials. `@vocab` maps every term not
 * defined elsewhere into one namespace, so no claim is silently dropped during canonicalisation (a term
 * without a definition would otherwise not be signed at all).
 *
 * The URL is under `.test` (RFC 6761), which never resolves on the internet: verifiers outside the
 * playground get the document from the playground server, which serves it at this URL's path.
 */
export const PLAYGROUND_CONTEXT_V1_URL = 'https://playground.ps02.test/contexts/v1.jsonld';

export const PLAYGROUND_CONTEXT_V1 = {
  '@context': {
    '@version': 1.1,
    '@protected': true,
    '@vocab': 'https://playground.ps02.test/vocab#',
    // `id`, `type` and `name` are left to the credentials contexts, which define them as protected terms.
    PlaygroundCredential: 'https://playground.ps02.test/vocab#PlaygroundCredential',
    FarmerCredential: 'https://playground.ps02.test/vocab#FarmerCredential',
    givenName: 'https://schema.org/givenName',
    familyName: 'https://schema.org/familyName',
    birthDate: { '@id': 'https://schema.org/birthDate', '@type': 'http://www.w3.org/2001/XMLSchema#date' },
    email: 'https://schema.org/email',
  },
} as const;

/** Every context this package can serve offline, by URL. Each call returns fresh copies. */
export function pinnedContexts(): Map<string, unknown> {
  const contexts = new Map<string, unknown>();
  for (const [url, document] of securityLoader().documents) contexts.set(url, structuredClone(document));
  contexts.set(PLAYGROUND_CONTEXT_V1_URL, structuredClone(PLAYGROUND_CONTEXT_V1));
  return contexts;
}
