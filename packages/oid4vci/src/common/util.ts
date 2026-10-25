// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Small helpers shared by the issuer, the authorization server and the client: random values, PKCE,
 * a single-use store with expiry, and the Fastify glue both servers need.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { OAuthError } from './errors.js';

/** Milliseconds since the epoch; injectable so expiry tests do not sleep. */
export type Clock = () => number;
export const systemClock: Clock = () => Date.now();

export const epochSeconds = (ms: number): number => Math.floor(ms / 1000);

/** 256 bits of randomness, base64url: codes, tokens and nonces nobody can guess (RFC 6749 section 10.10). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** A numeric transaction code of `length` digits (d13 section 4.1.1 `tx_code.input_mode` = numeric). */
export function randomDigits(length: number): string {
  return Array.from({ length }, () => String(randomInt(10))).join('');
}

/** RFC 7636 section 4.2: `code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))`. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** RFC 7636 section 4.1: 43 to 128 characters from the unreserved set. */
export function isValidCodeVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

interface Entry<T> {
  value: T;
  expiresAt: number;
  used: boolean;
}

/**
 * In-memory map with an expiry per entry and a "used" mark, for codes, tokens and nonces. A used
 * entry is kept until it expires, so a second redemption can be told apart from an unknown value
 * (both are `invalid_grant`, but the description differs, which helps whoever reads the inspector).
 */
export class ExpiringStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly clock: Clock) {}

  set(key: string, value: T, ttlSeconds: number): void {
    this.prune();
    this.entries.set(key, { value, expiresAt: this.clock() + ttlSeconds * 1000, used: false });
  }

  /** Looks a key up without consuming it. */
  peek(key: string): { status: 'unknown' | 'expired' | 'used' | 'valid'; value?: T } {
    const entry = this.entries.get(key);
    if (!entry) return { status: 'unknown' };
    if (entry.expiresAt <= this.clock()) return { status: 'expired', value: entry.value };
    if (entry.used) return { status: 'used', value: entry.value };
    return { status: 'valid', value: entry.value };
  }

  /** Marks the key used; returns what `peek` returned before. */
  consume(key: string): { status: 'unknown' | 'expired' | 'used' | 'valid'; value?: T } {
    const result = this.peek(key);
    const entry = this.entries.get(key);
    if (entry && result.status === 'valid') entry.used = true;
    return result;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  private prune(): void {
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      // Keep expired entries for a minute, so "expired" is reported instead of "unknown".
      if (entry.expiresAt + 60_000 <= now) this.entries.delete(key);
    }
  }
}

/**
 * Adds a parser for `application/x-www-form-urlencoded` (token requests, RFC 6749 section 4.1.3) unless
 * the host server already has one. Registering it twice in one Fastify context throws, and the
 * playground server registers its own, so the plugins check first. Repeated keys keep the first value.
 */
export function ensureFormParser(app: FastifyInstance): void {
  if (app.hasContentTypeParser('application/x-www-form-urlencoded')) return;
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      const params = new URLSearchParams(typeof body === 'string' ? body : body.toString('utf8'));
      const result: Record<string, string> = {};
      for (const [key, value] of params) if (!(key in result)) result[key] = value;
      done(null, result);
    },
  );
}

/** Reads one string parameter from a parsed form or JSON body. */
export function stringParam(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Sends an OAuth error. Token responses must not be cached (RFC 6749 section 5.1), and a 401 for a
 * bearer token carries `WWW-Authenticate` (RFC 6750 section 3).
 */
export function sendOAuthError(reply: FastifyReply, error: OAuthError): FastifyReply {
  reply.header('cache-control', 'no-store');
  if (error.status === 401 && error.error === 'invalid_token') {
    reply.header(
      'www-authenticate',
      `Bearer error="invalid_token", error_description="${error.message.replace(/"/g, "'")}"`,
    );
  }
  return reply.code(error.status).send(error.toBody());
}

/**
 * Error handler for a plugin's routes: an `OAuthError` becomes its JSON body, a body that does not
 * parse becomes `invalid_request`, anything else `server_error` (with the message, because this is a
 * test system and the message is what a person debugging interoperability needs).
 */
export function installOAuthErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof OAuthError) return sendOAuthError(reply, error);
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status >= 400 && status < 500) {
      return sendOAuthError(reply, new OAuthError('invalid_request', message, status));
    }
    return sendOAuthError(reply, new OAuthError('server_error', message, 500));
  });
}
