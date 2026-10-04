/**
 * Helpers shared by the reference role adapters: turning library errors into report errors, reading
 * the facts a report needs out of a credential, and the fetch a role passes to the protocol clients.
 */
import {
  RoleError,
  isRoleError,
  type CredentialFormat,
  type Health,
  type RunContext,
} from '@inji-playground/protocol';
import { Oid4vciClientError } from '@inji-playground/oid4vci';
import { Oid4vpError } from '@inji-playground/oid4vp';

/** Reference roles live in this process: they are up whenever the server answers. */
export function processHealth(): Promise<Health> {
  return Promise.resolve({
    status: 'up',
    checkedAt: new Date().toISOString(),
    detail: 'runs in the playground server',
  });
}

/**
 * The run's recording fetch as the plain `(url, init) => Response` the protocol clients take. The
 * run's abort signal is added, so a timeout or cancel also stops a call the client made without one.
 */
export function runFetch(ctx: RunContext): (url: string, init?: RequestInit) => Promise<Response> {
  return (url, init) => ctx.http.fetch(url, { signal: ctx.signal, ...init });
}

/**
 * The `RoleError` for anything a protocol client threw. A network failure underneath (already a
 * `RoleError` from the recording client, category `environment`) is kept as it is, so an unreachable
 * container is not reported as an interoperability failure.
 */
export function toRoleError(error: unknown, prefix: 'vci' | 'vp'): unknown {
  if (isRoleError(error)) return error;
  let cause: unknown = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; cause !== undefined && depth < 5; depth += 1) {
    if (isRoleError(cause)) return cause;
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  if (error instanceof Oid4vciClientError) {
    const status =
      error.status === undefined
        ? ''
        : ` (HTTP ${error.status}${error.oauthError ? `, ${error.oauthError}` : ''})`;
    return new RoleError(`${prefix}.${error.code}`, `${error.message}${status}`, { cause: error });
  }
  if (error instanceof Oid4vpError) {
    return new RoleError(`${prefix}.${error.code}`, error.message, { cause: error });
  }
  // An abort (timeout, cancel) passes through unchanged: the orchestrator classifies it.
  return error;
}

export interface CredentialFacts {
  proofType?: string;
  issuerDid?: string;
}

/** Proof type and issuer of a credential, for the report. Never throws: unknown shapes give `{}`. */
export function credentialFacts(raw: string, format: CredentialFormat): CredentialFacts {
  try {
    if (format === 'ldp_vc') {
      const json = JSON.parse(raw) as {
        issuer?: string | { id?: string };
        proof?: { type?: string; cryptosuite?: string } | Array<{ type?: string; cryptosuite?: string }>;
      };
      const proof = Array.isArray(json.proof) ? json.proof[0] : json.proof;
      const issuer = typeof json.issuer === 'string' ? json.issuer : json.issuer?.id;
      const proofType = proof?.cryptosuite ?? proof?.type;
      return { ...(proofType ? { proofType } : {}), ...(issuer ? { issuerDid: issuer } : {}) };
    }
    if (format === 'vc+sd-jwt' || format === 'dc+sd-jwt') {
      const [jwt = ''] = raw.split('~');
      const [header = '', payload = ''] = jwt.split('.');
      const decode = (part: string): Record<string, unknown> =>
        JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
      const { alg, kid } = decode(header);
      const { iss } = decode(payload);
      const issuer = typeof iss === 'string' ? iss : typeof kid === 'string' ? kid.split('#')[0] : undefined;
      return {
        ...(typeof alg === 'string' ? { proofType: alg } : {}),
        ...(issuer ? { issuerDid: issuer } : {}),
      };
    }
  } catch {
    // The verifier reports a malformed credential; the report just lacks the two facts.
  }
  return {};
}
