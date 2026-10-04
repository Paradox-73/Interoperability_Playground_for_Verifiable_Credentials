/**
 * Well-known documents at the host root.
 *
 * The reference issuer and the test authorization server live under a path (`/ref/issuer`,
 * `/ref/as`). Their plugins serve the "append" form of each well-known URL themselves
 * (`/ref/as/.well-known/oauth-authorization-server`). The "insert" form required by RFC 8414 section 3
 * and OpenID4VCI 1.0 section 12.2.2 (`/.well-known/oauth-authorization-server/ref/as`) sits outside the
 * plugin's prefix, so the host server registers it at the root with `registerRootWellKnown`. The
 * local Inji trial showed Mimoto building one form and Certify serving the other (gap G3), so both
 * are served.
 */
import type { FastifyInstance } from 'fastify';
import { wellKnownUrl } from './constants.js';

export interface WellKnownDocument {
  /** Identifier the document belongs to, for example the issuer URL `http://host/ref/as`. */
  identifier: string;
  /** One of `WELL_KNOWN`. */
  wellKnownPath: string;
  document(): unknown;
}

/**
 * Registers the RFC 8615 "insert" location of each document on a root-level Fastify instance.
 * Identifiers without a path are skipped: for them the insert and append forms are the same URL,
 * which the plugin already serves when it is mounted at the root.
 */
export function registerRootWellKnown(app: FastifyInstance, documents: readonly WellKnownDocument[]): void {
  for (const entry of documents) {
    const identifierPath = new URL(entry.identifier).pathname.replace(/\/$/, '');
    if (identifierPath === '') continue;
    const path = new URL(wellKnownUrl(entry.identifier, entry.wellKnownPath, 'insert')).pathname;
    if (app.hasRoute({ method: 'GET', url: path })) continue;
    app.get(path, async (_request, reply) =>
      reply.header('cache-control', 'no-store').send(entry.document()),
    );
  }
}
