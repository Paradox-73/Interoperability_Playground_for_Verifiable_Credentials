/**
 * Upstream URLs of the Inji services behind `/proxy/:target/*` and `/v1/verify/*`.
 *
 * In the bundle the playground container is on the stack's compose network and uses the service
 * names; on the host (development, and `PLAYGROUND_STACK=off`) it uses the published ports of
 * `deploy/inji-stack/compose.yaml`. `INJI_*_URL` variables override either.
 */
import type { Config } from '../config/index.js';
import type { ProxyTarget } from './proxy.js';

const HOST_DEFAULTS = {
  certify: 'http://localhost:28091',
  'certify-ac': 'http://localhost:28093',
  verify: 'http://localhost:28080',
  mimoto: 'http://localhost:28099',
};

const BUNDLE_DEFAULTS = {
  certify: 'http://certify-nginx:80',
  'certify-ac': 'http://certify-ac:8090',
  verify: 'http://verify-service:8080',
  mimoto: 'http://mimoto-service:8099',
};

/** Proxy targets by name; the label is the role id drawn on the sequence diagram. */
export function proxyTargets(config: Config): Record<string, ProxyTarget> {
  const defaults = config.stack === 'bundle' ? BUNDLE_DEFAULTS : HOST_DEFAULTS;
  return {
    certify: { url: config.injiCertifyUrl ?? defaults.certify, label: 'inji-certify' },
    'certify-ac': { url: config.injiCertifyAcUrl ?? defaults['certify-ac'], label: 'inji-certify-ac' },
    verify: { url: config.injiVerifyUrl ?? defaults.verify, label: 'inji-verify' },
    mimoto: { url: config.injiMimotoUrl ?? defaults.mimoto, label: 'mimoto' },
  };
}
