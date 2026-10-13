/**
 * Upstream URLs of the Inji services behind `/proxy/:target/*` and `/v1/verify/*`.
 *
 * In the bundle the playground container is on the stack's compose network and uses the service
 * names; on the host (development, and `PLAYGROUND_STACK=off`) it uses the published ports of
 * `deploy/inji-stack/compose.yaml`. `INJI_*_URL` variables override either.
 */
import type { Config } from '../config/index.js';
import type { NetworkMap } from './network-map.js';
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

/** Hosts the stack's services answer on inside its compose network and on the TLS front. */
const INTERNAL_HOSTS: Record<string, string> = {
  'certify-nginx': 'inji-certify',
  'certify-nginx:80': 'inji-certify',
  'certify:8090': 'inji-certify',
  'certify.ps02.test': 'inji-certify',
  'certify-ac:8090': 'inji-certify-ac',
  'verify-service:8080': 'inji-verify',
  'verify.ps02.test': 'inji-verify',
  'mimoto-service:8099': 'mimoto',
};

/**
 * Diagram names by host (`host:port` as `URL.host` writes it): every proxy target's upstream plus the
 * names the stack advertises, so an outbound call to Certify is drawn as `inji-certify`, not as a port.
 */
export function serviceLabels(config: Config): (url: URL) => string | undefined {
  const labels = new Map(Object.entries(INTERNAL_HOSTS));
  for (const target of Object.values(proxyTargets(config)))
    labels.set(new URL(target.url).host, target.label);
  return (url) => labels.get(url.host);
}

/** Proxy targets by name; the label is the role id drawn on the sequence diagram. */
export function proxyTargets(config: Config): Record<string, ProxyTarget> {
  const defaults = config.stack === 'bundle' ? BUNDLE_DEFAULTS : HOST_DEFAULTS;
  return {
    certify: { url: config.injiCertifyUrl ?? defaults.certify, label: 'inji-certify' },
    'certify-ac': {
      url: config.injiCertifyAcUrl ?? defaults['certify-ac'],
      label: 'inji-certify-ac',
      wellKnownBase: '/v1/certify',
    },
    verify: { url: config.injiVerifyUrl ?? defaults.verify, label: 'inji-verify' },
    mimoto: { url: config.injiMimotoUrl ?? defaults.mimoto, label: 'mimoto' },
  };
}

/**
 * Hosts of the Inji stack the reference verifier may fetch status lists and did:web documents from
 * although they are compose-network or loopback addresses: the proxy targets (`INJI_*_URL` or their
 * defaults) and the network map's names. They are configured, not chosen by a credential. None when the
 * stack is off.
 */
export function stackFetchHosts(config: Config, networkMap: NetworkMap): string[] {
  if (config.stack === 'off') return [];
  return [
    ...Object.values(proxyTargets(config)).map((target) => new URL(target.url).host),
    ...networkMap.hosts,
  ];
}
