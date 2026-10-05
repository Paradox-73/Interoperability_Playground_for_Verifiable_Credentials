# Test report

Generated on 2026-10-06 by `npm run test:report` at commit `d350e56 (with uncommitted changes)` (Windows_NT 10.0.26200, Node 24.19.0, dates in Asia/Calcutta). Every number below was measured by the command named next to it, on the date given; nothing is estimated.

## Summary

| Suite | Measured on | Tests | Passed | Failed | Skipped |
| ----- | ----------- | ----- | ------ | ------ | ------- |
| Unit and integration (`npm test`) | 2026-10-06 | 972 | 972 | 0 | 0 |
| Browser, reference mode (`npm run e2e`) | 2026-10-06 | 7 | 7 | 0 | 0 |
| Live against the Inji stack (`npm run test:live`) | 2026-10-06 | 20 | 20 | 0 | 0 |

## Unit and integration tests per package

`npm test` on 2026-10-06: 68 files in 47 s.

| Package | Files | Tests | Passed | Failed | Skipped |
| ------- | ----- | ----- | ------ | ------ | ------- |
| cli | 2 | 25 | 25 | 0 | 0 |
| deploy | 3 | 47 | 47 | 0 | 0 |
| formats | 7 | 148 | 148 | 0 | 0 |
| oid4vci | 5 | 49 | 49 | 0 | 0 |
| oid4vp | 5 | 83 | 83 | 0 | 0 |
| protocol | 3 | 30 | 30 | 0 | 0 |
| scenarios | 2 | 100 | 100 | 0 | 0 |
| server | 24 | 250 | 250 | 0 | 0 |
| web | 17 | 240 | 240 | 0 | 0 |

## Live tests

`npm run test:live` on 2026-10-06 against a stack started for it, in 56 s.

| Group | Files | Tests | Passed | Failed |
| ----- | ----- | ----- | ------ | ------ |
| server | 2 | 20 | 20 | 0 |

## Browser tests

`npm run e2e` on 2026-10-06 (Chromium, server in reference mode): 7 of 7 passed in 24 s. They include axe accessibility checks (WCAG 2.1 A and AA) on every page they open.

## Compatibility matrices

| Matrix | Spec | Run on | Cells | As specified | Pass | Fail | Error | Not supported |
| ------ | ---- | ------ | ----- | ------------ | ---- | ---- | ----- | ------------- |
| reference (no Docker) | [reference](../interop-report/reference/matrix.md) | 2026-10-06 | 82 | 82 | 78 | 0 | 0 | 4 |
| live (Inji stack) | [live-core](../interop-report/live/live-core/matrix.md) | 2026-10-06 | 14 | 14 | 10 | 3 | 0 | 1 |
| live (Inji stack) | [live-holder-web](../interop-report/live/live-holder-web/matrix.md) | 2026-10-06 | 6 | 6 | 1 | 5 | 0 | 0 |

A live cell whose spec expects `fail` is blocked by a gap in an Inji module; the spec names the gap and [docs/gaps/gaps.json](../gaps/gaps.json) describes it.

## Inji stack: start time and memory

Measured on 2026-10-06: `npm run stack:up` with every profile took 71 s until every service answered (images already pulled).

Memory after the live tests (`docker stats`): 2.52 GiB in total.

| Container | MiB |
| --------- | --- |
| mimoto-service | 735 |
| certify-ac | 656 |
| certify | 618 |
| verify-service | 382 |
| database | 87 |
| database-ac | 50 |
| tls-front | 19 |
| certify-nginx | 12 |
| verify-ui | 11 |
| inji-web | 10 |

## Licence audit

Checked on 2026-10-06 (`scripts/lib/licenses.mjs`; the full list is in [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md)). Every shipped licence is OSI-approved.

- npm packages in the playground image: 445, under MIT (308), ISC (53), BSD-3-Clause (40), Apache-2.0 (20), BlueOak-1.0.0 (5), (MIT AND Zlib) (3), (MIT OR CC0-1.0) (2), 0BSD (2), Apache-2.0 OR MIT (2), MPL-2.0 (2), Unlicense (2), W3C-20150513 AND BSD-3-Clause (2), (Apache-2.0 OR MIT) (1), (MIT OR GPL-3.0-or-later) (1), (MPL-2.0 OR Apache-2.0) (1), EPL-2.0 (1).
- Container images of the Inji stack: injistack/inji-certify-with-plugins (MPL-2.0), injistack/inji-verify-service (MPL-2.0), injistack/inji-verify-ui (MPL-2.0), injistack/mimoto (MPL-2.0), injistack/inji-web (MPL-2.0), postgres (PostgreSQL), nginx (BSD-2-Clause).
- Development-only packages (not distributed): 367; not OSI-approved among them: caniuse-lite (CC-BY-4.0), language-subtag-registry (CC0-1.0), mdn-data (CC0-1.0) (data files used by build tools).
