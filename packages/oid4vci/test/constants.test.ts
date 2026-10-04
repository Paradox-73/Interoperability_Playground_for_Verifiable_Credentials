import { describe, expect, it } from 'vitest';
import { WELL_KNOWN, wellKnownUrl } from '../src/index.js';

describe('wellKnownUrl (RFC 8615 placement)', () => {
  it('appends the well-known path to a host-only issuer', () => {
    expect(wellKnownUrl('https://certify.ps02.test', WELL_KNOWN.credentialIssuer)).toBe(
      'https://certify.ps02.test/.well-known/openid-credential-issuer',
    );
  });

  it('inserts the well-known path between host and issuer path', () => {
    expect(wellKnownUrl('http://localhost:28100/ref/issuer/', WELL_KNOWN.oauthAuthorizationServer)).toBe(
      'http://localhost:28100/.well-known/oauth-authorization-server/ref/issuer',
    );
  });

  it('appends the well-known path for OpenID4VCI draft 13 issuer metadata', () => {
    expect(wellKnownUrl('http://localhost:28100/ref/issuer', WELL_KNOWN.credentialIssuer, 'append')).toBe(
      'http://localhost:28100/ref/issuer/.well-known/openid-credential-issuer',
    );
  });
});
