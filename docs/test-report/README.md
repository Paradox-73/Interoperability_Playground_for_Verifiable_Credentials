# Test report

Generated on 2026-10-14 by `npm run test:report` at commit `8a07d51 (with uncommitted changes)` (Windows_NT 10.0.26200, Node 24.19.0, dates in Asia/Calcutta). Every number below was measured by the command named next to it, on the date given; nothing is estimated.

## Summary

| Suite | Measured on | Tests | Passed | Failed | Skipped |
| ----- | ----------- | ----- | ------ | ------ | ------- |
| Unit and integration (`npm test`) | 2026-10-14 | 1246 | 1246 | 0 | 0 |
| Browser, reference mode (`npm run e2e`) | 2026-10-14 | 12 | 12 | 0 | 0 |
| Live against the Inji stack (`npm run test:live`) | 2026-10-14 | 20 | 20 | 0 | 0 |

## Unit and integration tests per package

`npm test` on 2026-10-14: 82 files in 67 s.

| Package | Files | Tests | Passed | Failed | Skipped |
| ------- | ----- | ----- | ------ | ------ | ------- |
| cli | 2 | 25 | 25 | 0 | 0 |
| deploy | 4 | 59 | 59 | 0 | 0 |
| formats | 11 | 218 | 218 | 0 | 0 |
| oid4vci | 8 | 64 | 64 | 0 | 0 |
| oid4vp | 9 | 155 | 155 | 0 | 0 |
| protocol | 3 | 30 | 30 | 0 | 0 |
| scenarios | 2 | 137 | 137 | 0 | 0 |
| server | 26 | 314 | 314 | 0 | 0 |
| web | 17 | 244 | 244 | 0 | 0 |

## Live tests

`npm run test:live` on 2026-10-14 against a stack started for it, in 129 s.

| Group | Files | Tests | Passed | Failed |
| ----- | ----- | ----- | ------ | ------ |
| server | 2 | 20 | 20 | 0 |

## Browser tests

`npm run e2e` on 2026-10-14 (Chromium, server in reference mode): 12 of 12 passed in 70 s. They include axe accessibility checks (WCAG 2.1 A and AA) on every page they open.

## Compatibility matrices

| Matrix | Spec | Run on | Cells | As specified | Pass | Fail | Error | Not supported |
| ------ | ---- | ------ | ----- | ------------ | ---- | ---- | ----- | ------------- |
| reference (no Docker) | [reference](../interop-report/reference/matrix.md) | 2026-10-14 | 123 | 123 | 119 | 0 | 0 | 4 |
| live (Inji stack) | [live-core](../interop-report/live/live-core/matrix.md) | 2026-10-14 | 16 | 16 | 11 | 4 | 0 | 1 |
| live (Inji stack) | [live-holder-web](../interop-report/live/live-holder-web/matrix.md) | 2026-10-14 | 10 | 10 | 4 | 6 | 0 | 0 |

A live cell whose spec expects `fail` is blocked by a gap in an Inji module; the spec names the gap and [docs/gaps/gaps.json](../gaps/gaps.json) describes it.

## Inji stack: start time and memory

Measured on 2026-10-14: `npm run stack:up` with every profile took 242 s until every service answered (images already pulled).

Memory after the live tests (`docker stats`): 2.47 GiB in total.

| Container | MiB |
| --------- | --- |
| certify-ac | 677 |
| mimoto-service | 662 |
| certify | 550 |
| verify-service | 408 |
| database | 104 |
| database-ac | 54 |
| tls-front | 25 |
| inji-web | 18 |
| certify-nginx | 18 |
| verify-ui | 17 |

## Hosted CI

The hosted `ci` and `interop-nightly` runs, with their run ids, are in [README, Continuous integration](../../README.md#continuous-integration).

## Licence audit

Checked on 2026-10-14 (`scripts/lib/licenses.mjs`; the full list is in [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md)). Every shipped licence is OSI-approved.

- npm packages in the playground image: 445, under MIT (308), ISC (53), BSD-3-Clause (40), Apache-2.0 (20), BlueOak-1.0.0 (5), (MIT AND Zlib) (3), (MIT OR CC0-1.0) (2), 0BSD (2), Apache-2.0 OR MIT (2), MPL-2.0 (2), Unlicense (2), W3C-20150513 AND BSD-3-Clause (2), (Apache-2.0 OR MIT) (1), (MIT OR GPL-3.0-or-later) (1), (MPL-2.0 OR Apache-2.0) (1), EPL-2.0 (1).
- Container images of the Inji stack: injistack/inji-certify-with-plugins (MPL-2.0), injistack/inji-verify-service (MPL-2.0), injistack/inji-verify-ui (MPL-2.0), injistack/mimoto (MPL-2.0), injistack/inji-web (MPL-2.0), postgres (PostgreSQL), nginx (BSD-2-Clause).
- Development-only packages (not distributed): 367; not OSI-approved among them: caniuse-lite (CC-BY-4.0), language-subtag-registry (CC0-1.0), mdn-data (CC0-1.0) (data files used by build tools).
