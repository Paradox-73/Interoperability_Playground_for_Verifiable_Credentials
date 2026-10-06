# Inji Certify mso_mdoc departs from ISO/IEC 18013-5: MSO not wrapped in tag 24, validity dates as text, no signed date (G27)

**Repository:** [inji/inji-certify](https://github.com/inji/inji-certify)

**Version:** 0.14.0

**Case:** TC_PG_WEB_09 (certify-ac -> reference wallet -> reference verifier, `mso_mdoc`) and TC_PG_LIVE_15

**Date:** 2026-10-06

**Severity:** medium; **status:** new; no upstream issue found

## Summary

In a Certify mdoc (`MDocProcessor`), the `issuerAuth` payload is the MobileSecurityObject itself, not
MobileSecurityObjectBytes `#6.24(bstr .cbor MobileSecurityObject)`; `validityInfo.validFrom` and `validUntil` are
text strings instead of `tdate` (`#6.0(tstr)`); `validityInfo.signed` is missing. ISO/IEC 18013-5 section 9.1.2.4
requires all three. The issuer signature (ES256, `CERTIFY_VC_SIGN_EC_R1` certificate in `x5chain`), the value
digests and the device key are correct.

## Steps

1. Issue `FarmerMdoc` (`mso_mdoc`) from certify-ac or Certify.
2. Decode `issuerSigned.issuerAuth` and its payload.

## Expected

Payload `#6.24(bstr .cbor MSO)`; `validityInfo` with `signed`, `validFrom`, `validUntil` as `tdate`.

## Actual

Payload is the MSO map; `validFrom` and `validUntil` are plain strings; no `signed`. The reference verifier
verifies the signature, digests, validity and device signature, then fails the mdoc with these three points;
readers that decode the MSO strictly reject it outright. `issuerAuth` is also a tagged COSE_Sign1 (tag 18),
which RFC 9052 allows and the reference verifier accepts.

## Suggested change

Wrap the MSO in tag 24 before signing, write the dates as `tdate` and add `signed`.

## Reproduce with the playground

Start the local Inji stack (`npm run stack:up`) and the playground server on 28100 in host mode (see
[docs/setup.md](../../setup.md)), run the case above (`npm run matrix:live -- --spec <spec>`, or the cell
in the UI), and attach the redacted export of the run (`GET /api/runs/{id}/export`): it holds every HTTP
exchange with secrets replaced.
