/**
 * An mso_mdoc as Inji Certify 0.14.0 issues it (recorded from the ps02-inji stack on 2026-10-06, gaps G26 and
 * G27): the reader accepts its departures from ISO/IEC 18013-5 and lists them, so a wallet can hold and
 * present it while a verifier fails it with the exact reasons.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMdocCredential, validateX5c, verifyCoseSign1, x5chainOf } from '../src/index.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/inji-certify-mdoc.recorded.json', import.meta.url), 'utf8'),
) as { credential: string };

describe('Inji Certify 0.14.0 mso_mdoc (recorded)', () => {
  const decoded = decodeMdocCredential(fixture.credential);

  it("reads Certify's {docType, issuerSigned} wrapper with a tagged COSE_Sign1 issuerAuth", () => {
    expect(decoded.docType).toBe('test.ps02.playground.farmer.1');
    expect(decoded.encoding).toBe('inji-certify');
    expect(decoded.issuerSigned.mso.docType).toBe('test.ps02.playground.farmer.1');
  });

  it('lists every departure from ISO/IEC 18013-5 section 9.1.2.4 (G27)', () => {
    const deviations = decoded.issuerSigned.deviations.join('\n');
    expect(decoded.issuerSigned.deviations).toHaveLength(4);
    expect(deviations).toMatch(/not MobileSecurityObjectBytes #6\.24/);
    expect(deviations).toMatch(/no signed date/);
    expect(deviations).toMatch(/validFrom is a text string, not a tdate/);
    expect(deviations).toMatch(/validUntil is a text string, not a tdate/);
  });

  it('its issuer signature verifies with the x5chain leaf (CERTIFY_VC_SIGN_EC_R1)', async () => {
    const chain = x5chainOf(decoded.issuerSigned.issuerAuth)!;
    const validation = await validateX5c(chain, { now: new Date('2026-10-06T15:00:00Z') });
    expect(validation.leafSubject).toMatch(/CERTIFY_VC_SIGN_EC_R1/);
    expect(verifyCoseSign1(decoded.issuerSigned.issuerAuth, validation.leafJwk)).toBe(true);
  });

  it('the pre-authorized profile leaves the template placeholders unfilled (G26)', () => {
    const values = (decoded.issuerSigned.nameSpaces.get('test.ps02.playground.farmer.1') ?? []).map(
      (item) => item.elementValue,
    );
    expect(values).toContain('${farmerID}');
    expect(values).toContain('${fullName}');
  });
});
