/**
 * @inji-playground/oid4vp: reference OpenID4VP verifier (Presentation Exchange and DCQL) and the
 * wallet's presentation client, in two profiles: `inji-draft` (what Inji's stable releases speak) and
 * `final-1.0` (OpenID4VP 1.0). Both sides are written from the specifications, independent of Inji,
 * and share the credential formats of `@inji-playground/formats`.
 */
export * from './common/errors.js';
export * from './common/constants.js';
export * from './common/client-id.js';
export * from './common/request-uri.js';
export * from './common/request-object.js';
export * from './common/dc-api.js';
export { randomToken, type FetchFn } from './common/util.js';

export * from './query/credential-view.js';
export * from './query/presentation-exchange.js';
export * from './query/dcql.js';

export * from './verifier/verify-presentation.js';
export * from './verifier/verifier.js';
export * from './verifier/http.js';

export * from './wallet/presentation-client.js';
export * from './wallet/dc-api.js';

/** URI scheme wallets register for cross-device and same-device presentation requests. */
export const OPENID4VP_SCHEME = 'openid4vp:';
