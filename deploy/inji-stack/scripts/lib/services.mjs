// SPDX-License-Identifier: MIT
/**
 * Readiness probes for the stack as seen from the host, and the warm-up call. Compose health checks decide
 * start order inside the network; these probes decide when the host (smoke test, playground in host mode)
 * can use a service.
 */
import { readFileSync, existsSync } from 'node:fs';
import { httpsGetVia, request } from './http.mjs';

/**
 * Host probes per service: the URL and the condition for "ready". `profile` is the compose profile the
 * service belongs to (undefined = core).
 */
export function serviceProbes(urls) {
  return [
    {
      service: 'certify',
      profile: undefined,
      label: 'Certify issuer metadata (through certify-nginx)',
      url: `${urls.certifyNginx}/v1/certify/issuance/.well-known/openid-credential-issuer`,
      // The first call after start can take close to a minute (52 s measured in the trial): one warm-up.
      timeoutMs: 120_000,
    },
    {
      service: 'tls-front',
      profile: undefined,
      label: 'TLS front: did:web document of did:web:certify.ps02.test',
      url: `${urls.tlsFront}/.well-known/did.json`,
      hostHeader: 'certify.ps02.test',
    },
    {
      service: 'verify-service',
      profile: undefined,
      label: 'Inji Verify did.json',
      url: `${urls.verifyService}/v1/verify/did.json`,
    },
    {
      service: 'mimoto-service',
      profile: 'holder-web',
      label: 'Mimoto issuer list',
      url: `${urls.mimoto}/v1/mimoto/issuers`,
    },
    { service: 'inji-web', profile: 'holder-web', label: 'Inji Web', url: `${urls.injiWeb}/` },
    { service: 'verify-ui', profile: 'verify-ui', label: 'Inji Verify UI', url: `${urls.verifyUi}/` },
  ];
}

/** Probes for the services the given profiles start. */
export function probesFor(urls, profiles) {
  return serviceProbes(urls).filter((p) => p.profile === undefined || profiles.includes(p.profile));
}

/** Runs one probe; returns the exchange. HTTPS probes use the test CA from the run directory. */
export async function runProbe(probe, { caFile }) {
  if (probe.hostHeader) {
    if (!existsSync(caFile)) {
      return {
        label: probe.label,
        method: 'GET',
        url: probe.url,
        status: 0,
        ms: 0,
        body: '',
        error: `missing ${caFile}`,
      };
    }
    return httpsGetVia(probe.label, probe.url, {
      hostHeader: probe.hostHeader,
      caPem: readFileSync(caFile),
      timeoutMs: probe.timeoutMs ?? 15_000,
    });
  }
  return request(probe.label, probe.url, { timeoutMs: probe.timeoutMs ?? 15_000 });
}
