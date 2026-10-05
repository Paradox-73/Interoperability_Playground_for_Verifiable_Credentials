# Third-party licences

Generated on 2026-10-05 by `npm run test:report` (`scripts/lib/licenses.mjs`). The playground itself is MIT-licensed ([LICENSE](LICENSE)); the files imported unchanged from Inji repositories under `deploy/inji-stack/` keep their MPL-2.0 licence ([deploy/inji-stack/UPSTREAM.md](deploy/inji-stack/UPSTREAM.md)).

Every licence below is OSI-approved. Development-only packages (build, test and lint tools: 367 packages) are not distributed and not listed.

## Container images of the Inji stack

| Image | Licence of the software | Source |
| ----- | ----------------------- | ------ |
| `injistack/inji-certify-with-plugins:0.14.0` | MPL-2.0 | <https://github.com/inji/inji-certify> |
| `injistack/inji-verify-service:0.18.2` | MPL-2.0 | <https://github.com/inji/inji-verify> |
| `injistack/inji-verify-ui:0.18.2` | MPL-2.0 | <https://github.com/inji/inji-verify> |
| `injistack/mimoto:0.22.0` | MPL-2.0 | <https://github.com/inji/mimoto> |
| `injistack/inji-web:0.17.0` | MPL-2.0 | <https://github.com/inji/inji-web> |
| `postgres:15` | PostgreSQL | <https://www.postgresql.org/about/licence/> |
| `nginx:stable` | BSD-2-Clause | <https://nginx.org/LICENSE> |

Base images contain operating system packages under their own licences; see each image's documentation.

## npm packages in the playground image (442)

| Licence | Packages |
| ------- | -------- |
| MIT | 310 |
| ISC | 53 |
| BSD-3-Clause | 40 |
| Apache-2.0 | 16 |
| BlueOak-1.0.0 | 5 |
| (MIT AND Zlib) | 3 |
| (MIT OR CC0-1.0) | 2 |
| 0BSD | 2 |
| Apache-2.0 OR MIT | 2 |
| MPL-2.0 | 2 |
| Unlicense | 2 |
| W3C-20150513 AND BSD-3-Clause | 2 |
| (Apache-2.0 OR MIT) | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |

| Package | Version | Licence | Source |
| ------- | ------- | ------- | ------ |
| `@ant-design/colors` | 8.0.1 | MIT | <https://github.com/ant-design/ant-design-colors> |
| `@ant-design/fast-color` | 3.0.1 | MIT | <https://github.com/ant-design/fast-color> |
| `@ant-design/icons` | 6.3.4 | MIT | <https://github.com/ant-design/ant-design-icons/tree/master/packages/icons-react> |
| `@ant-design/icons-svg` | 4.6.0 | MIT | <https://github.com/ant-design/ant-design-icons> |
| `@antfu/install-pkg` | 2.1.0 | MIT | <https://github.com/antfu-collective/install-pkg> |
| `@babel/code-frame` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/generator` | 7.29.8 | MIT | <https://github.com/babel/babel> |
| `@babel/helper-globals` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/helper-module-imports` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/helper-string-parser` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/helper-validator-identifier` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/parser` | 7.29.9 | MIT | <https://github.com/babel/babel> |
| `@babel/runtime` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/template` | 7.29.7 | MIT | <https://github.com/babel/babel> |
| `@babel/traverse` | 7.29.8 | MIT | <https://github.com/babel/babel> |
| `@babel/types` | 7.29.8 | MIT | <https://github.com/babel/babel> |
| `@braintree/sanitize-url` | 7.1.2 | MIT | <https://github.com/braintree/sanitize-url> |
| `@cbor-extract/cbor-extract-win32-x64` | 2.2.2 | MIT | <http://github.com/kriszyp/cbor-extract> |
| `@chevrotain/types` | 11.1.2 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> |
| `@digitalbazaar/credentials-context` | 3.2.0 | W3C-20150513 AND BSD-3-Clause | <https://github.com/digitalbazaar/credentials-context> |
| `@digitalbazaar/data-integrity` | 2.5.0 | BSD-3-Clause | <https://github.com/digitalbazaar/data-integrity> |
| `@digitalbazaar/data-integrity-context` | 2.0.1 | BSD-3-Clause | <https://github.com/digitalbazaar/data-integrity-context> |
| `@digitalbazaar/did-io` | 2.2.0 | BSD-3-Clause | <https://github.com/digitalbazaar/did-io> |
| `@digitalbazaar/did-method-key` | 5.3.0 | BSD-3-Clause | <https://github.com/digitalbazaar/did-method-key> |
| `@digitalbazaar/ecdsa-multikey` | 1.8.0 | BSD-3-Clause | <https://github.com/digitalbazaar/ecdsa-multikey> |
| `@digitalbazaar/ecdsa-rdfc-2019-cryptosuite` | 1.3.0 | BSD-3-Clause | <https://github.com/digitalbazaar/ecdsa-rdfc-2019-cryptosuite> |
| `@digitalbazaar/ed25519-multikey` | 1.3.1 | BSD-3-Clause | <https://github.com/digitalbazaar/ed25519-multikey> |
| `@digitalbazaar/ed25519-signature-2020` | 5.4.0 | BSD-3-Clause | <https://github.com/digitalbazaar/ed25519-signature-2020> |
| `@digitalbazaar/ed25519-verification-key-2020` | 4.2.0 | BSD-3-Clause | <https://github.com/digitalbazaar/ed25519-verification-key-2020> |
| `@digitalbazaar/eddsa-rdfc-2022-cryptosuite` | 1.3.0 | BSD-3-Clause | <https://github.com/digitalbazaar/eddsa-rdfc-2022-cryptosuite> |
| `@digitalbazaar/http-client` | 4.4.0 | BSD-3-Clause | <https://github.com/digitalbazaar/http-client> |
| `@digitalbazaar/lru-memoize` | 4.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/lru-memoize> |
| `@digitalbazaar/security-context` | 1.0.1 | BSD-3-Clause | <https://github.com/digitalbazaar/security-context> |
| `@digitalbazaar/security-document-loader` | 3.2.0 | BSD-3-Clause | <https://github.com/digitalbazaar/security-document-loader> |
| `@digitalbazaar/vc` | 7.3.0 | BSD-3-Clause | <https://github.com/digitalbazaar/vc> |
| `@digitalbazaar/x25519-key-agreement-key-2020` | 3.0.1 | BSD-3-Clause | <https://github.com/digitalbazaar/x25519-key-agreement-key-2020> |
| `@emotion/babel-plugin` | 11.13.5 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/babel-plugin> |
| `@emotion/cache` | 11.14.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/cache> |
| `@emotion/hash` | 0.9.2 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/hash> |
| `@emotion/is-prop-valid` | 1.4.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/is-prop-valid> |
| `@emotion/memoize` | 0.9.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/memoize> |
| `@emotion/react` | 11.14.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/react> |
| `@emotion/serialize` | 1.3.3 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/serialize> |
| `@emotion/sheet` | 1.4.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/sheet> |
| `@emotion/styled` | 11.14.1 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/styled> |
| `@emotion/unitless` | 0.10.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/unitless> |
| `@emotion/use-insertion-effect-with-fallbacks` | 1.2.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/use-insertion-effect-with-fallbacks> |
| `@emotion/utils` | 1.4.2 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/utils> |
| `@emotion/weak-memoize` | 0.4.0 | MIT | <https://github.com/emotion-js/emotion/tree/main/packages/weak-memoize> |
| `@fastify/accept-negotiator` | 2.1.0 | MIT | <https://github.com/fastify/accept-negotiator> |
| `@fastify/ajv-compiler` | 4.0.6 | MIT | <https://github.com/fastify/ajv-compiler> |
| `@fastify/error` | 4.2.0 | MIT | <https://github.com/fastify/fastify-error> |
| `@fastify/fast-json-stringify-compiler` | 5.1.0 | MIT | <https://github.com/fastify/fast-json-stringify-compiler> |
| `@fastify/formbody` | 9.0.0 | MIT | <https://github.com/fastify/fastify-formbody> |
| `@fastify/forwarded` | 3.0.2 | MIT | <https://github.com/fastify/forwarded> |
| `@fastify/merge-json-schemas` | 0.2.1 | MIT | <https://github.com/fastify/merge-json-schemas> |
| `@fastify/proxy-addr` | 5.1.1 | MIT | <https://github.com/fastify/proxy-addr> |
| `@fastify/send` | 4.1.1 | MIT | <https://github.com/fastify/send> |
| `@fastify/static` | 10.1.5 | MIT | <https://github.com/fastify/fastify-static> |
| `@fastify/swagger` | 9.9.1 | MIT | <https://github.com/fastify/fastify-swagger> |
| `@fastify/swagger-ui` | 6.1.1 | MIT | <https://github.com/fastify/fastify-swagger-ui> |
| `@fastify/websocket` | 11.3.3 | MIT | <https://github.com/fastify/fastify-websocket> |
| `@iconify/types` | 2.0.0 | MIT | <https://github.com/iconify/iconify> |
| `@iconify/utils` | 3.1.7 | MIT | <https://github.com/iconify/iconify> |
| `@injistack/pixelpass` | 0.8.0 | MPL-2.0 | <https://github.com/inji/pixelpass> |
| `@injistack/react-inji-verify-sdk` | 0.18.1 | MPL-2.0 | <https://github.com/inji/inji-verify> |
| `@jridgewell/gen-mapping` | 0.3.13 | MIT | <https://github.com/jridgewell/sourcemaps> |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | <https://github.com/jridgewell/resolve-uri> |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | <https://github.com/jridgewell/sourcemaps> |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | <https://github.com/jridgewell/sourcemaps> |
| `@jsep-plugin/assignment` | 1.3.0 | MIT | <EricSmekens/jsep> |
| `@jsep-plugin/regex` | 1.0.4 | MIT | <EricSmekens/jsep> |
| `@lukeed/ms` | 2.0.2 | MIT | <lukeed/ms> |
| `@mermaid-js/parser` | 1.2.1 | MIT | <https://github.com/mermaid-js/mermaid> |
| `@mui/core-downloads-tracker` | 7.3.11 | MIT | <https://github.com/mui/material-ui> |
| `@mui/material` | 7.3.11 | MIT | <https://github.com/mui/material-ui> |
| `@mui/private-theming` | 7.3.11 | MIT | <https://github.com/mui/material-ui> |
| `@mui/styled-engine` | 7.3.10 | MIT | <https://github.com/mui/material-ui> |
| `@mui/system` | 7.3.11 | MIT | <https://github.com/mui/material-ui> |
| `@mui/types` | 7.4.12 | MIT | <https://github.com/mui/material-ui> |
| `@mui/utils` | 7.3.11 | MIT | <https://github.com/mui/material-ui> |
| `@napi-rs/canvas` | 0.1.100 | MIT | <https://github.com/Brooooooklyn/canvas> |
| `@napi-rs/canvas-win32-x64-msvc` | 0.1.100 | MIT | <https://github.com/Brooooooklyn/canvas> |
| `@noble/curves` | 1.9.7 | MIT | <https://github.com/paulmillr/noble-curves> |
| `@noble/ed25519` | 1.7.5 | MIT | <https://github.com/paulmillr/noble-ed25519> |
| `@noble/hashes` | 1.8.0 | MIT | <https://github.com/paulmillr/noble-hashes> |
| `@owf/cose` | 0.4.1 | Apache-2.0 | <https://github.com/openwallet-foundation-labs/identity-common-ts> |
| `@owf/identity-common` | 0.4.1 | Apache-2.0 | <https://github.com/openwallet-foundation-labs/identity-common-ts> |
| `@owf/token-status-list` | 0.4.1 | Apache-2.0 | <https://github.com/openwallet-foundation-labs/identity-common-ts> |
| `@peculiar/asn1-asym-key` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-cms` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-csr` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-ecc` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-pfx` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-pkcs8` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-pkcs9` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-rsa` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-schema` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-x509` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-x509-attr` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/asn1-x509-post-quantum` | 2.10.0 | MIT | <https://github.com/PeculiarVentures/asn1-schema> |
| `@peculiar/utils` | 2.0.3 | MIT | <https://github.com/PeculiarVentures/pvtsutils> |
| `@peculiar/x509` | 2.1.0 | MIT | <https://github.com/PeculiarVentures/x509> |
| `@pinojs/redact` | 0.4.0 | MIT | <https://github.com/pinojs/redact> |
| `@popperjs/core` | 2.11.8 | MIT | <github:popperjs/popper-core> |
| `@rc-component/util` | 1.13.0 | MIT | <https://github.com/react-component/util> |
| `@sd-jwt/core` | 0.21.1 | Apache-2.0 | <https://github.com/openwallet-foundation-labs/identity-common-ts> |
| `@sd-jwt/sd-jwt-vc` | 0.21.1 | Apache-2.0 | <https://github.com/openwallet-foundation-labs/identity-common-ts> |
| `@tanstack/query-core` | 5.104.1 | MIT | <https://github.com/TanStack/query> |
| `@tanstack/react-query` | 5.104.1 | MIT | <https://github.com/TanStack/query> |
| `@types/d3` | 7.4.3 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-array` | 3.2.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-axis` | 3.0.6 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-brush` | 3.0.6 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-chord` | 3.0.6 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-color` | 3.1.3 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-contour` | 3.0.6 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-delaunay` | 6.0.4 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-dispatch` | 3.0.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-drag` | 3.0.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-dsv` | 3.0.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-ease` | 3.0.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-fetch` | 3.0.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-force` | 3.0.10 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-format` | 3.0.4 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-geo` | 3.1.1 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-hierarchy` | 3.1.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-interpolate` | 3.0.4 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-path` | 3.1.1 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-polygon` | 3.0.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-quadtree` | 3.0.6 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-random` | 3.0.4 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-scale` | 4.0.9 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-scale-chromatic` | 3.1.0 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-selection` | 3.0.12 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-shape` | 3.2.0 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-time` | 3.0.4 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-time-format` | 4.0.3 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-timer` | 3.0.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-transition` | 3.0.9 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/d3-zoom` | 3.0.9 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/emscripten` | 1.41.6 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/geojson` | 7946.0.16 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/parse-json` | 4.0.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/prop-types` | 15.7.15 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/react` | 18.3.31 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/react-transition-group` | 4.4.12 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/trusted-types` | 2.0.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@upsetjs/venn.js` | 2.0.0 | MIT | <https://github.com/upsetjs/venn.js> |
| `abstract-logging` | 2.0.1 | MIT | <https://github.com/jsumners/abstract-logging> |
| `ajv` | 8.20.0 | MIT | <ajv-validator/ajv> |
| `ajv-formats` | 3.0.1 | MIT | <https://github.com/ajv-validator/ajv-formats> |
| `ansi-regex` | 5.0.1 | MIT | <chalk/ansi-regex> |
| `ansi-styles` | 4.3.0 | MIT | <chalk/ansi-styles> |
| `asn1js` | 3.0.10 | BSD-3-Clause | <https://github.com/PeculiarVentures/ASN1.js> |
| `atomic-sleep` | 1.0.0 | MIT | <https://github.com/davidmarkclements/atomic-sleep> |
| `avvio` | 9.3.0 | MIT | <https://github.com/fastify/avvio> |
| `babel-plugin-macros` | 3.1.0 | MIT | <https://github.com/kentcdodds/babel-plugin-macros> |
| `balanced-match` | 4.0.4 | MIT | <https://github.com/juliangruber/balanced-match> |
| `base45-web` | 1.0.2 | Apache-2.0 | <https://github.com/pablomaurer/base45-js> |
| `base58-universal` | 2.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/base58-universal> |
| `base64url` | 3.0.1 | MIT | <https://github.com/brianloveswords/base64url> |
| `base64url-universal` | 2.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/base64url-universal> |
| `brace-expansion` | 5.0.12 | MIT | <https://github.com/juliangruber/brace-expansion> |
| `callsites` | 3.1.0 | MIT | <sindresorhus/callsites> |
| `camelcase` | 5.3.1 | MIT | <sindresorhus/camelcase> |
| `canonicalize` | 2.1.0 | Apache-2.0 | <https://github.com/erdtman/canonicalize> |
| `cbor-extract` | 2.2.2 | MIT | <http://github.com/kriszyp/cbor-extract> |
| `cbor-web` | 9.0.2 | MIT | <http://github.com/hildjj/node-cbor> |
| `cbor-x` | 1.6.6 | MIT | <http://github.com/kriszyp/cbor-x> |
| `cliui` | 6.0.0 | ISC | <http://github.com/yargs/cliui> |
| `clsx` | 2.1.1 | MIT | <lukeed/clsx> |
| `color-convert` | 2.0.1 | MIT | <Qix-/color-convert> |
| `color-name` | 1.1.4 | MIT | <git@github.com:colorjs/color-name> |
| `commander` | 7.2.0 | MIT | <https://github.com/tj/commander.js> |
| `commander` | 8.3.0 | MIT | <https://github.com/tj/commander.js> |
| `content-disposition` | 3.0.0 | MIT | <jshttp/content-disposition> |
| `convert-source-map` | 1.9.0 | MIT | <https://github.com/thlorenz/convert-source-map> |
| `cookie` | 1.1.1 | MIT | <jshttp/cookie> |
| `core-util-is` | 1.0.3 | MIT | <https://github.com/isaacs/core-util-is> |
| `cose-base` | 1.0.3 | MIT | <https://github.com/iVis-at-Bilkent/cose-base> |
| `cose-base` | 2.2.0 | MIT | <https://github.com/iVis-at-Bilkent/cose-base> |
| `cosmiconfig` | 7.1.0 | MIT | <https://github.com/davidtheclark/cosmiconfig> |
| `crypto-ld` | 7.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/crypto-ld> |
| `csstype` | 3.2.3 | MIT | <https://github.com/frenic/csstype> |
| `cytoscape` | 3.34.3 | MIT | <https://github.com/cytoscape/cytoscape.js> |
| `cytoscape-cose-bilkent` | 4.1.0 | MIT | <https://github.com/cytoscape/cytoscape.js-cose-bilkent> |
| `cytoscape-fcose` | 2.2.0 | MIT | <https://github.com/iVis-at-Bilkent/cytoscape.js-fcose> |
| `d3` | 7.9.0 | ISC | <https://github.com/d3/d3> |
| `d3-array` | 2.12.1 | BSD-3-Clause | <https://github.com/d3/d3-array> |
| `d3-array` | 3.2.4 | ISC | <https://github.com/d3/d3-array> |
| `d3-axis` | 3.0.0 | ISC | <https://github.com/d3/d3-axis> |
| `d3-brush` | 3.0.0 | ISC | <https://github.com/d3/d3-brush> |
| `d3-chord` | 3.0.1 | ISC | <https://github.com/d3/d3-chord> |
| `d3-color` | 3.1.0 | ISC | <https://github.com/d3/d3-color> |
| `d3-contour` | 4.0.2 | ISC | <https://github.com/d3/d3-contour> |
| `d3-delaunay` | 6.0.4 | ISC | <https://github.com/d3/d3-delaunay> |
| `d3-dispatch` | 3.0.1 | ISC | <https://github.com/d3/d3-dispatch> |
| `d3-drag` | 3.0.0 | ISC | <https://github.com/d3/d3-drag> |
| `d3-dsv` | 3.0.1 | ISC | <https://github.com/d3/d3-dsv> |
| `d3-ease` | 3.0.1 | BSD-3-Clause | <https://github.com/d3/d3-ease> |
| `d3-fetch` | 3.0.1 | ISC | <https://github.com/d3/d3-fetch> |
| `d3-force` | 3.0.0 | ISC | <https://github.com/d3/d3-force> |
| `d3-format` | 3.1.2 | ISC | <https://github.com/d3/d3-format> |
| `d3-geo` | 3.1.1 | ISC | <https://github.com/d3/d3-geo> |
| `d3-hierarchy` | 3.1.2 | ISC | <https://github.com/d3/d3-hierarchy> |
| `d3-interpolate` | 3.0.1 | ISC | <https://github.com/d3/d3-interpolate> |
| `d3-path` | 1.0.9 | BSD-3-Clause | <https://github.com/d3/d3-path> |
| `d3-path` | 3.1.0 | ISC | <https://github.com/d3/d3-path> |
| `d3-polygon` | 3.0.1 | ISC | <https://github.com/d3/d3-polygon> |
| `d3-quadtree` | 3.0.1 | ISC | <https://github.com/d3/d3-quadtree> |
| `d3-random` | 3.0.1 | ISC | <https://github.com/d3/d3-random> |
| `d3-sankey` | 0.12.3 | BSD-3-Clause | <https://github.com/d3/d3-sankey> |
| `d3-scale` | 4.0.2 | ISC | <https://github.com/d3/d3-scale> |
| `d3-scale-chromatic` | 3.1.0 | ISC | <https://github.com/d3/d3-scale-chromatic> |
| `d3-selection` | 3.0.0 | ISC | <https://github.com/d3/d3-selection> |
| `d3-shape` | 1.3.7 | BSD-3-Clause | <https://github.com/d3/d3-shape> |
| `d3-shape` | 3.2.0 | ISC | <https://github.com/d3/d3-shape> |
| `d3-time` | 3.1.0 | ISC | <https://github.com/d3/d3-time> |
| `d3-time-format` | 4.1.0 | ISC | <https://github.com/d3/d3-time-format> |
| `d3-timer` | 3.0.1 | ISC | <https://github.com/d3/d3-timer> |
| `d3-transition` | 3.0.1 | ISC | <https://github.com/d3/d3-transition> |
| `d3-zoom` | 3.0.0 | ISC | <https://github.com/d3/d3-zoom> |
| `dagre-d3-es` | 7.0.14 | MIT | <https://github.com/tbo47/dagre-es> |
| `dayjs` | 1.11.23 | MIT | <https://github.com/iamkun/dayjs> |
| `dcql` | 4.0.0 | Apache-2.0 | <https://github.com/openwallet-foundation-labs/identity-common-ts> |
| `debug` | 4.4.3 | MIT | <https://github.com/debug-js/debug> |
| `decamelize` | 1.2.0 | MIT | <sindresorhus/decamelize> |
| `delaunator` | 5.1.0 | ISC | <https://github.com/mapbox/delaunator> |
| `depd` | 2.0.0 | MIT | <dougwilson/nodejs-depd> |
| `dequal` | 2.0.3 | MIT | <lukeed/dequal> |
| `detect-libc` | 2.1.2 | Apache-2.0 | <https://github.com/lovell/detect-libc> |
| `did-context` | 3.1.1 | W3C-20150513 AND BSD-3-Clause | <https://github.com/digitalbazaar/did-context> |
| `did-resolver` | 4.1.0 | Apache-2.0 | <git@github.com:decentralized-identity/did-resolver> |
| `did-resolver` | 6.0.0 | Apache-2.0 | <https://github.com/decentralized-identity/did-resolver> |
| `dijkstrajs` | 1.0.3 | MIT | <https://github.com/tcort/dijkstrajs> |
| `dom-helpers` | 5.2.1 | MIT | <https://github.com/react-bootstrap/dom-helpers> |
| `dompurify` | 3.4.16 | (MPL-2.0 OR Apache-2.0) | <https://github.com/cure53/DOMPurify> |
| `duplexify` | 4.1.3 | MIT | <https://github.com/mafintosh/duplexify> |
| `ed25519-signature-2020-context` | 1.1.0 | BSD-3-Clause | <https://github.com/digitalbazaar/ed25519-signature-2020-context> |
| `emoji-regex` | 8.0.0 | MIT | <https://github.com/mathiasbynens/emoji-regex> |
| `end-of-stream` | 1.4.5 | MIT | <https://github.com/mafintosh/end-of-stream> |
| `error-ex` | 1.3.4 | MIT | <qix-/node-error-ex> |
| `es-errors` | 1.3.0 | MIT | <https://github.com/ljharb/es-errors> |
| `es-toolkit` | 1.52.0 | MIT | <https://github.com/toss/es-toolkit> |
| `escape-html` | 1.0.3 | MIT | <component/escape-html> |
| `escape-string-regexp` | 4.0.0 | MIT | <sindresorhus/escape-string-regexp> |
| `fast-decode-uri-component` | 1.0.1 | MIT | <https://github.com/delvedor/fast-decode-uri-component> |
| `fast-deep-equal` | 3.1.3 | MIT | <https://github.com/epoberezkin/fast-deep-equal> |
| `fast-json-stringify` | 7.0.1 | MIT | <https://github.com/fastify/fast-json-stringify> |
| `fast-querystring` | 1.1.2 | MIT | <https://github.com/anonrig/fast-querystring> |
| `fast-uri` | 3.1.8 | BSD-3-Clause | <https://github.com/fastify/fast-uri> |
| `fast-uri` | 4.2.1 | BSD-3-Clause | <https://github.com/fastify/fast-uri> |
| `fastdom` | 1.0.12 | MIT | <https://github.com/wilsonpage/fastdom> |
| `fastify` | 5.12.5 | MIT | <https://github.com/fastify/fastify> |
| `fastify-plugin` | 6.0.0 | MIT | <https://github.com/fastify/fastify-plugin> |
| `fastify-type-provider-zod` | 7.0.0 | MIT | <https://github.com/turkerdev/fastify-type-provider-zod> |
| `fastq` | 1.20.3 | ISC | <https://github.com/mcollina/fastq> |
| `find-my-way` | 9.9.0 | MIT | <https://github.com/delvedor/find-my-way> |
| `find-root` | 1.1.0 | MIT | <git@github.com:js-n/find-root> |
| `find-up` | 4.1.0 | MIT | <sindresorhus/find-up> |
| `function-bind` | 1.1.2 | MIT | <https://github.com/Raynos/function-bind> |
| `get-caller-file` | 2.0.5 | ISC | <https://github.com/stefanpenner/get-caller-file> |
| `glob` | 13.0.6 | BlueOak-1.0.0 | <git@github.com:isaacs/node-glob> |
| `hachure-fill` | 0.5.2 | MIT | <https://github.com/pshihn/hachure-fill> |
| `hasown` | 2.0.4 | MIT | <https://github.com/inspect-js/hasOwn> |
| `hoist-non-react-statics` | 3.3.2 | BSD-3-Clause | <https://github.com/mridgway/hoist-non-react-statics> |
| `html-parse-stringify` | 4.0.1 | MIT | <https://github.com/i18next/html-parse-stringify> |
| `http-errors` | 2.0.1 | MIT | <jshttp/http-errors> |
| `i18next` | 26.4.2 | MIT | <https://github.com/i18next/i18next> |
| `iconv-lite` | 0.6.3 | MIT | <https://github.com/ashtuchkin/iconv-lite> |
| `immediate` | 3.0.6 | MIT | <https://github.com/calvinmetcalf/immediate> |
| `import-fresh` | 3.3.1 | MIT | <sindresorhus/import-fresh> |
| `import-meta-resolve` | 4.2.0 | MIT | <wooorm/import-meta-resolve> |
| `inherits` | 2.0.4 | ISC | <https://github.com/isaacs/inherits> |
| `internmap` | 1.0.1 | ISC | <https://github.com/mbostock/internmap> |
| `internmap` | 2.0.3 | ISC | <https://github.com/mbostock/internmap> |
| `ipaddr.js` | 2.5.0 | MIT | <https://github.com/whitequark/ipaddr.js> |
| `is-arrayish` | 0.2.1 | MIT | <https://github.com/qix-/node-is-arrayish> |
| `is-core-module` | 2.17.0 | MIT | <https://github.com/inspect-js/is-core-module> |
| `is-fullwidth-code-point` | 3.0.0 | MIT | <sindresorhus/is-fullwidth-code-point> |
| `is-mobile` | 5.0.0 | MIT | <https://github.com/juliangruber/is-mobile> |
| `isarray` | 1.0.0 | MIT | <https://github.com/juliangruber/isarray> |
| `jose` | 6.2.12 | MIT | <panva/jose> |
| `js-tokens` | 4.0.0 | MIT | <lydell/js-tokens> |
| `jsep` | 1.4.0 | MIT | <https://github.com/EricSmekens/jsep> |
| `jsesc` | 3.1.0 | MIT | <https://github.com/mathiasbynens/jsesc> |
| `json-parse-even-better-errors` | 2.3.1 | MIT | <https://github.com/npm/json-parse-even-better-errors> |
| `json-schema-ref-resolver` | 3.0.0 | MIT | <https://github.com/fastify/json-schema-ref-resolver> |
| `json-schema-resolver` | 3.0.0 | MIT | <https://github.com/Eomm/json-schema-resolver> |
| `json-schema-traverse` | 1.0.0 | MIT | <https://github.com/epoberezkin/json-schema-traverse> |
| `jsonld` | 9.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/jsonld.js> |
| `jsonld-document-loader` | 2.3.0 | BSD-3-Clause | <https://github.com/digitalbazaar/jsonld-document-loader> |
| `jsonld-signatures` | 11.6.0 | BSD-3-Clause | <https://github.com/digitalbazaar/jsonld-signatures> |
| `jsonpath-plus` | 11.1.1 | MIT | <https://github.com/s3u/JSONPath> |
| `jszip` | 3.10.2 | (MIT OR GPL-3.0-or-later) | <https://github.com/Stuk/jszip> |
| `katex` | 0.16.47 | MIT | <https://github.com/KaTeX/KaTeX> |
| `key-did-resolver` | 4.0.0 | (Apache-2.0 OR MIT) | <https://github.com/ceramicnetwork/js-did> |
| `khroma` | 2.1.0 | MIT | <github:fabiospampinato/khroma> |
| `ky` | 1.14.3 | MIT | <sindresorhus/ky> |
| `layout-base` | 1.0.2 | MIT | <https://github.com/iVis-at-Bilkent/layout-base> |
| `layout-base` | 2.0.1 | MIT | <https://github.com/iVis-at-Bilkent/layout-base> |
| `lie` | 3.3.0 | MIT | <https://github.com/calvinmetcalf/lie> |
| `light-my-request` | 6.6.0 | BSD-3-Clause | <https://github.com/fastify/light-my-request> |
| `lines-and-columns` | 1.2.4 | MIT | <https://github.com/eventualbuddha/lines-and-columns> |
| `locate-path` | 5.0.0 | MIT | <sindresorhus/locate-path> |
| `lodash-es` | 4.18.1 | MIT | <lodash/lodash> |
| `loose-envify` | 1.4.0 | MIT | <https://github.com/zertosh/loose-envify> |
| `lru-cache` | 11.5.3 | BlueOak-1.0.0 | <ssh://git@github.com/isaacs/node-lru-cache> |
| `lru-cache` | 6.0.0 | ISC | <https://github.com/isaacs/node-lru-cache> |
| `marked` | 16.4.2 | MIT | <https://github.com/markedjs/marked> |
| `mermaid` | 11.17.2 | MIT | <https://github.com/mermaid-js/mermaid> |
| `mime` | 3.0.0 | MIT | <https://github.com/broofa/mime> |
| `minimatch` | 10.2.6 | BlueOak-1.0.0 | <git@github.com:isaacs/minimatch> |
| `minipass` | 7.1.3 | BlueOak-1.0.0 | <https://github.com/isaacs/minipass> |
| `ms` | 2.1.3 | MIT | <vercel/ms> |
| `multiformats` | 13.4.2 | Apache-2.0 OR MIT | <https://github.com/multiformats/js-multiformats> |
| `node-gyp-build-optional-packages` | 5.1.1 | MIT | <https://github.com/prebuild/node-gyp-build> |
| `object-assign` | 4.1.1 | MIT | <sindresorhus/object-assign> |
| `on-exit-leak-free` | 2.1.2 | MIT | <https://github.com/mcollina/on-exit-or-gc> |
| `once` | 1.4.0 | ISC | <https://github.com/isaacs/once> |
| `openapi-types` | 12.1.3 | MIT | <https://github.com/kogosoftwarellc/open-api/tree/master/packages/openapi-types> |
| `p-limit` | 2.3.0 | MIT | <sindresorhus/p-limit> |
| `p-locate` | 4.1.0 | MIT | <sindresorhus/p-locate> |
| `p-try` | 2.2.0 | MIT | <sindresorhus/p-try> |
| `package-manager-detector` | 1.8.0 | MIT | <https://github.com/antfu-collective/package-manager-detector> |
| `pako` | 1.0.11 | (MIT AND Zlib) | <nodeca/pako> |
| `pako` | 2.2.0 | (MIT AND Zlib) | <nodeca/pako> |
| `pako` | 3.0.2 | (MIT AND Zlib) | <nodeca/pako> |
| `parent-module` | 1.0.1 | MIT | <sindresorhus/parent-module> |
| `parse-json` | 5.2.0 | MIT | <sindresorhus/parse-json> |
| `path-data-parser` | 0.1.0 | MIT | <https://github.com/pshihn/path-data-parser> |
| `path-exists` | 4.0.0 | MIT | <sindresorhus/path-exists> |
| `path-parse` | 1.0.7 | MIT | <https://github.com/jbgutierrez/path-parse> |
| `path-scurry` | 2.0.2 | BlueOak-1.0.0 | <https://github.com/isaacs/path-scurry> |
| `path-type` | 4.0.0 | MIT | <sindresorhus/path-type> |
| `pdfjs-dist` | 5.2.133 | Apache-2.0 | <https://github.com/mozilla/pdf.js> |
| `picocolors` | 1.1.1 | ISC | <alexeyraspopov/picocolors> |
| `pino` | 10.4.0 | MIT | <https://github.com/pinojs/pino> |
| `pino-abstract-transport` | 3.0.0 | MIT | <https://github.com/pinojs/pino-abstract-transport> |
| `pino-std-serializers` | 7.1.0 | MIT | <ssh://git@github.com/pinojs/pino-std-serializers> |
| `pngjs` | 5.0.0 | MIT | <https://github.com/lukeapage/pngjs> |
| `points-on-curve` | 0.2.0 | MIT | <https://github.com/pshihn/bezier-points> |
| `points-on-path` | 0.2.1 | MIT | <https://github.com/pshihn/points-on-path> |
| `process-nextick-args` | 2.0.1 | MIT | <https://github.com/calvinmetcalf/process-nextick-args> |
| `process-warning` | 4.0.1 | MIT | <https://github.com/fastify/process-warning> |
| `process-warning` | 5.1.0 | MIT | <https://github.com/fastify/process-warning> |
| `prop-types` | 15.8.1 | MIT | <facebook/prop-types> |
| `pvtsutils` | 1.3.6 | MIT | <https://github.com/PeculiarVentures/pvtsutils> |
| `pvutils` | 1.2.0 | MIT | <https://github.com/PeculiarVentures/pvutils> |
| `qrcode` | 1.5.4 | MIT | <https://github.com/soldair/node-qrcode> |
| `qrcode.react` | 4.2.0 | ISC | <https://github.com/zpao/qrcode.react> |
| `quick-format-unescaped` | 4.0.4 | MIT | <https://github.com/davidmarkclements/quick-format> |
| `rdf-canonize` | 5.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/rdf-canonize> |
| `react` | 18.3.1 | MIT | <https://github.com/facebook/react> |
| `react-dom` | 18.3.1 | MIT | <https://github.com/facebook/react> |
| `react-i18next` | 17.0.15 | MIT | <https://github.com/i18next/react-i18next> |
| `react-icons` | 5.7.0 | MIT | <ssh://git@github.com:react-icons/react-icons> |
| `react-is` | 16.13.1 | MIT | <https://github.com/facebook/react> |
| `react-is` | 19.3.0 | MIT | <https://github.com/react/react> |
| `react-router` | 7.18.4 | MIT | <https://github.com/remix-run/react-router> |
| `react-router-dom` | 7.18.4 | MIT | <https://github.com/remix-run/react-router> |
| `react-transition-group` | 4.4.5 | BSD-3-Clause | <https://github.com/reactjs/react-transition-group> |
| `readable-stream` | 2.3.8 | MIT | <https://github.com/nodejs/readable-stream> |
| `readable-stream` | 3.6.2 | MIT | <https://github.com/nodejs/readable-stream> |
| `real-require` | 1.0.0 | MIT | <https://github.com/pinojs/real-require> |
| `reflect-metadata` | 0.2.2 | Apache-2.0 | <https://github.com/rbuckton/reflect-metadata> |
| `require-directory` | 2.1.1 | MIT | <https://github.com/troygoode/node-require-directory> |
| `require-from-string` | 2.0.2 | MIT | <floatdrop/require-from-string> |
| `require-main-filename` | 2.0.0 | ISC | <ssh://git@github.com/yargs/require-main-filename> |
| `resolve` | 1.22.12 | MIT | <ssh://github.com/browserify/resolve> |
| `resolve-from` | 4.0.0 | MIT | <sindresorhus/resolve-from> |
| `ret` | 0.5.0 | MIT | <https://github.com/fent/ret.js> |
| `reusify` | 1.1.0 | MIT | <https://github.com/mcollina/reusify> |
| `rfdc` | 1.4.1 | MIT | <https://github.com/davidmarkclements/rfdc> |
| `robust-predicates` | 3.0.3 | Unlicense | <https://github.com/mourner/robust-predicates> |
| `roughjs` | 4.6.6 | MIT | <https://github.com/pshihn/rough> |
| `rw` | 1.3.3 | BSD-3-Clause | <http://github.com/mbostock/rw> |
| `safe-buffer` | 5.1.2 | MIT | <https://github.com/feross/safe-buffer> |
| `safe-buffer` | 5.2.1 | MIT | <https://github.com/feross/safe-buffer> |
| `safe-regex2` | 5.1.1 | MIT | <https://github.com/fastify/safe-regex2> |
| `safe-stable-stringify` | 2.5.0 | MIT | <https://github.com/BridgeAR/safe-stable-stringify> |
| `safer-buffer` | 2.1.2 | MIT | <https://github.com/ChALkeR/safer-buffer> |
| `scheduler` | 0.23.2 | MIT | <https://github.com/facebook/react> |
| `secure-json-parse` | 4.1.0 | BSD-3-Clause | <https://github.com/fastify/secure-json-parse> |
| `semver` | 7.8.5 | ISC | <https://github.com/npm/node-semver> |
| `serialize-error` | 8.1.0 | MIT | <sindresorhus/serialize-error> |
| `set-blocking` | 2.0.0 | ISC | <https://github.com/yargs/set-blocking> |
| `set-cookie-parser` | 2.7.2 | MIT | <nfriedly/set-cookie-parser> |
| `setimmediate` | 1.0.5 | MIT | <YuzuJS/setImmediate> |
| `setprototypeof` | 1.2.0 | ISC | <https://github.com/wesleytodd/setprototypeof> |
| `sonic-boom` | 4.2.1 | MIT | <https://github.com/pinojs/sonic-boom> |
| `source-map` | 0.5.7 | BSD-3-Clause | <http://github.com/mozilla/source-map> |
| `split2` | 4.2.0 | ISC | <https://github.com/mcollina/split2> |
| `statuses` | 2.0.2 | MIT | <jshttp/statuses> |
| `stream-shift` | 1.0.3 | MIT | <https://github.com/mafintosh/stream-shift> |
| `strictdom` | 1.0.1 | MIT | <https://github.com/wilsonpage/strictdom> |
| `string_decoder` | 1.1.1 | MIT | <https://github.com/nodejs/string_decoder> |
| `string_decoder` | 1.3.0 | MIT | <https://github.com/nodejs/string_decoder> |
| `string-width` | 4.2.3 | MIT | <sindresorhus/string-width> |
| `strip-ansi` | 6.0.1 | MIT | <chalk/strip-ansi> |
| `stylis` | 4.2.0 | MIT | <https://github.com/thysultan/stylis.js> |
| `stylis` | 4.4.0 | MIT | <https://github.com/thysultan/stylis.js> |
| `supports-preserve-symlinks-flag` | 1.0.0 | MIT | <https://github.com/inspect-js/node-supports-preserve-symlinks-flag> |
| `tagged-tag` | 1.0.0 | MIT | <sindresorhus/tagged-tag> |
| `thread-stream` | 4.2.0 | MIT | <https://github.com/mcollina/thread-stream> |
| `tinyexec` | 1.3.1 | MIT | <https://github.com/tinylibs/tinyexec> |
| `toad-cache` | 3.7.4 | MIT | <https://github.com/kibertoad/toad-cache> |
| `toidentifier` | 1.0.1 | MIT | <component/toidentifier> |
| `ts-dedent` | 2.3.0 | MIT | <https://github.com/tamino-martinius/node-ts-dedent> |
| `tslib` | 1.14.1 | 0BSD | <https://github.com/Microsoft/tslib> |
| `tslib` | 2.8.1 | 0BSD | <https://github.com/Microsoft/tslib> |
| `tsyringe` | 4.10.0 | MIT | <https://github.com/Microsoft/tsyringe> |
| `tweetnacl` | 1.0.3 | Unlicense | <https://github.com/dchest/tweetnacl-js> |
| `type-fest` | 0.20.2 | (MIT OR CC0-1.0) | <sindresorhus/type-fest> |
| `type-fest` | 5.10.0 | (MIT OR CC0-1.0) | <sindresorhus/type-fest> |
| `typescript` | 5.9.3 | Apache-2.0 | <https://github.com/microsoft/TypeScript> |
| `uint8arrays` | 5.1.1 | Apache-2.0 OR MIT | <https://github.com/achingbrain/uint8arrays> |
| `undici` | 6.29.0 | MIT | <https://github.com/nodejs/undici> |
| `undici` | 8.11.2 | MIT | <https://github.com/nodejs/undici> |
| `use-sync-external-store` | 1.7.0 | MIT | <https://github.com/react/react> |
| `util-deprecate` | 1.0.2 | MIT | <https://github.com/TooTallNate/util-deprecate> |
| `uuid` | 14.0.2 | MIT | <https://github.com/uuidjs/uuid> |
| `valibot` | 1.5.0 | MIT | <https://github.com/open-circle/valibot> |
| `varint` | 6.0.0 | MIT | <https://github.com/chrisdickinson/varint> |
| `veres-one-context` | 12.0.0 | BSD-3-Clause | <https://github.com/veres-one/veres-one-context> |
| `web-did-resolver` | 3.1.0 | Apache-2.0 | <git@github.com:decentralized-identity/web-did-resolver> |
| `which-module` | 2.0.1 | ISC | <https://github.com/nexdrew/which-module> |
| `wrap-ansi` | 6.2.0 | MIT | <chalk/wrap-ansi> |
| `wrappy` | 1.0.2 | ISC | <https://github.com/npm/wrappy> |
| `ws` | 8.22.0 | MIT | <https://github.com/websockets/ws> |
| `x25519-key-agreement-2020-context` | 1.0.0 | BSD-3-Clause | <https://github.com/digitalbazaar/x25519-key-agreement-2020-context> |
| `y18n` | 4.0.3 | ISC | <git@github.com:yargs/y18n> |
| `yallist` | 4.0.0 | ISC | <https://github.com/isaacs/yallist> |
| `yaml` | 1.10.3 | ISC | <github:eemeli/yaml> |
| `yaml` | 2.9.1 | ISC | <github:eemeli/yaml> |
| `yargs` | 15.4.1 | MIT | <https://github.com/yargs/yargs> |
| `yargs-parser` | 18.1.3 | ISC | <https://github.com/yargs/yargs-parser> |
| `zod` | 4.6.5 | MIT | <https://github.com/colinhacks/zod> |
| `zod-validation-error` | 5.0.0 | MIT | <https://github.com/causaly/zod-validation-error> |
| `zustand` | 5.0.15 | MIT | <https://github.com/pmndrs/zustand> |
| `zxing-wasm` | 2.2.4 | MIT | <https://github.com/Sec-ant/zxing-wasm> |
