/**
 * `inji-web`: Inji Web 0.17.0 through its backend Mimoto 0.22.0 as the wallet of a run, driven headless
 * with the requests Inji Web's pages make.
 *
 * Receiving (Inji Web's guest download): the role builds the authorization request Inji Web builds
 * (code flow, PKCE S256, Inji Web's /redirect), follows the test authorization server's automatic approval,
 * and posts the code to `POST /v1/mimoto/credentials/download`. Mimoto then redeems the code at the test
 * server with its private_key_jwt client and requests the credential from the issuer; those two requests
 * reach the playground (inbound recorder, recording proxy), which records them in this run. Mimoto answers
 * the browser with a PDF only, so the credential is read from the recorded credential response.
 *
 * Presenting (Inji Web's logged-in wallet): Mimoto signs in only with Google, whose provider settings the stack
 * points at the test authorization server (deploy/inji-stack/compose.yaml). The role signs in with an ID token
 * of the test server, opens a wallet, stores the credential in it (a second authorization), and answers the
 * verifier's request through `POST /wallets/{id}/presentations` and `PATCH .../{presentationId}`. State-changing
 * calls echo the XSRF-TOKEN cookie in X-XSRF-TOKEN, as Inji Web does.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  RoleError,
  type CredentialFormat,
  type Health,
  type HeldCredential,
  type IssuanceStart,
  type PresentationRequestRef,
  type RecordedExchange,
  type RoleDescriptor,
  type RunContext,
  type SubmissionReceipt,
  type WalletRole,
} from '@inji-playground/protocol';
import type { ReferenceHosting } from '../../hosting/reference-hosting.js';
import type { CaptureHub } from '../../recording/capture-hub.js';
import { INBOUND_TARGETS } from '../../recording/inbound.js';
import { INJI_VERSIONS, probe } from './common.js';

/** Client id of Mimoto's sign-in at the test authorization server (GOOGLE_OAUTH_CLIENT_ID in compose.yaml). */
export const MIMOTO_LOGIN_CLIENT_ID = 'ps02-mimoto-login';
/** The farmer CSV row the test authorization server logs in (FARMER_TEST_IDENTITY). */
const TEST_SUBJECT = '2154189532';
const WALLET_PIN = '246810';

export interface InjiWebOptions {
  /** Mimoto's base URL as this server reaches it (http://localhost:28099 on the host). */
  mimotoUrl: string;
  hub: CaptureHub;
  /** The hosted test authorization server, which signs the sign-in ID token. */
  reference: ReferenceHosting;
}

interface MimotoIssuer {
  issuer_id: string;
  credential_issuer_host?: string;
  client_id?: string;
  redirect_uri?: string;
}

/** Cookies of Mimoto's session, kept per run. */
class CookieJar {
  readonly #cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = ''] = header.split(';');
      const index = pair.indexOf('=');
      if (index > 0) this.#cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  header(): string {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get(name: string): string | undefined {
    return this.#cookies.get(name);
  }
}

export class InjiWebRole implements WalletRole {
  readonly #options: InjiWebOptions;
  readonly #mimoto: string;
  /** The issuance a run started with, to store the credential again in the signed-in wallet. */
  readonly #starts = new Map<string, Extract<IssuanceStart, { mode: 'wallet-initiated' }>>();
  /** Format of the credential each run downloaded, as recorded from the issuer's response. */
  readonly #formats = new Map<string, CredentialFormat>();

  constructor(options: InjiWebOptions) {
    this.#options = options;
    this.#mimoto = `${options.mimotoUrl.replace(/\/+$/, '')}/v1/mimoto`;
  }

  describe(): RoleDescriptor {
    return {
      id: 'inji-web',
      kind: 'wallet',
      name: 'Inji Web (through Mimoto)',
      ecosystem: 'inji',
      version: `${INJI_VERSIONS.injiWeb} + Mimoto ${INJI_VERSIONS.mimoto}`,
      interaction: 'automatic',
      description:
        'Inji Web and its backend Mimoto from the holder-web profile, driven headless with the requests Inji Web makes: guest download to receive, a signed-in wallet to present.',
      capabilities: {
        formats: ['ldp_vc', 'vc+sd-jwt'],
        proofTypes: ['RsaSignature2018', 'Ed25519Signature2020', 'RS256', 'ES256'],
        didMethods: ['did:jwk'],
        vciProfiles: ['draft13'],
        vpProfiles: ['inji-draft'],
        issuance: ['wallet-initiated'],
        responseModes: ['direct_post'],
      },
      notes: [
        'Starts from its issuer list with the authorization code flow; it cannot take a credential offer (gap G5).',
        'Signs in through Mimoto’s Google provider, which the stack points at the playground test authorization server.',
      ],
    };
  }

  health(): Promise<Health> {
    return probe(`${this.#mimoto}/issuers`);
  }

  async receiveCredential(ctx: RunContext, start: IssuanceStart): Promise<HeldCredential> {
    if (start.mode !== 'wallet-initiated') {
      throw new RoleError(
        'wallet.offer-unsupported',
        'Inji Web through Mimoto cannot take a credential offer (gap G5)',
      );
    }
    this.#starts.set(ctx.runId, start);
    // Mimoto's own requests reach the playground without naming the run; these claims record them here.
    for (const target of ['certify-ac', 'certify', INBOUND_TARGETS.as, INBOUND_TARGETS.issuer]) {
      this.#options.hub.claim(ctx.runId, target);
    }
    const issuer = await this.#issuerFor(ctx, start.credentialIssuer);
    const { code, verifier, redirectUri } = await this.#authorize(ctx, issuer, start);

    const download = await ctx.http.fetch(`${this.#mimoto}/credentials/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/pdf' },
      body: new URLSearchParams({
        issuer: issuer.issuer_id,
        credential: start.credentialConfigurationId,
        credentialConfigurationId: start.credentialConfigurationId,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: verifier,
        vcStorageExpiryLimitInTimes: '-1',
        locale: 'en',
      }).toString(),
      signal: ctx.signal,
      step: 'credential',
    });
    if (!download.ok) {
      throw new RoleError(
        'wallet.download-failed',
        `Mimoto refused the download: HTTP ${download.status} ${await download.text()}`,
      );
    }
    await download.arrayBuffer();
    const observed = await this.#recordedCredential(ctx);
    const raw = observed ? credentialOf(observed) : undefined;
    const format = formatOf(raw) ?? 'ldp_vc';
    this.#formats.set(ctx.runId, format);
    return {
      id: `${ctx.runId}-credential`,
      format,
      raw: raw ?? '(held by Mimoto; its credential response was not recorded)',
      credentialIssuer: start.credentialIssuer,
      credentialConfigurationId: start.credentialConfigurationId,
      receivedAt: new Date().toISOString(),
    };
  }

  async present(ctx: RunContext, request: PresentationRequestRef): Promise<SubmissionReceipt> {
    const start = this.#starts.get(ctx.runId);
    if (!start) {
      throw new RoleError(
        'wallet.state-missing',
        'the run has no issuance to store in the signed-in wallet',
        {
          category: 'environment',
        },
      );
    }
    const jar = new CookieJar();
    const call = async (
      path: string,
      init: RequestInit & { step?: Parameters<RunContext['enterStep']>[0] } = {},
    ) => {
      const headers = new Headers(init.headers);
      // Inji Web sends its language; Mimoto refuses to store a credential without a 2-letter locale.
      headers.set('accept-language', 'en');
      const cookies = jar.header();
      if (cookies) headers.set('cookie', cookies);
      const xsrf = jar.get('XSRF-TOKEN');
      if (xsrf && init.method && init.method !== 'GET') headers.set('x-xsrf-token', decodeURIComponent(xsrf));
      const response = await ctx.http.fetch(`${this.#mimoto}${path}`, {
        ...init,
        headers,
        signal: ctx.signal,
      });
      jar.absorb(response);
      return response;
    };
    const json = async (response: Response, what: string): Promise<Record<string, unknown>> => {
      const text = await response.text();
      if (!response.ok)
        throw new RoleError(
          `wallet.${what}-failed`,
          `Mimoto ${what}: HTTP ${response.status} ${text.slice(0, 300)}`,
        );
      try {
        return text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    };

    // 1. Sign in with an ID token of the test authorization server (Mimoto's "Google" provider).
    const idToken = await this.#options.reference.authorizationServer.issueIdToken({
      audience: MIMOTO_LOGIN_CLIENT_ID,
      sub: TEST_SUBJECT,
    });
    await json(
      await call('/auth/google/token-login', {
        method: 'POST',
        headers: { authorization: `Bearer ${idToken}` },
      }),
      'sign-in',
    );
    await call('/users/me');

    // 2. Open a wallet (create one the first time) and unlock it.
    const wallets = (await json(await call('/wallets'), 'wallet-list')) as unknown as
      Array<{ walletId: string }> | Record<string, unknown>;
    let walletId = Array.isArray(wallets) ? wallets[0]?.walletId : undefined;
    if (!walletId) {
      const created = await json(
        await call('/wallets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            walletName: 'playground',
            walletPin: WALLET_PIN,
            confirmWalletPin: WALLET_PIN,
          }),
        }),
        'wallet-create',
      );
      walletId = String(created.walletId);
    }
    await json(
      await call(`/wallets/${walletId}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walletPin: WALLET_PIN }),
      }),
      'wallet-unlock',
    );

    // 3. Store the run's credential in the wallet: Inji Web downloads into a signed-in wallet with a new code.
    const issuer = await this.#issuerFor(ctx, start.credentialIssuer);
    const { code, verifier, redirectUri } = await this.#authorize(ctx, issuer, start);
    const stored = await json(
      await call(`/wallets/${walletId}/credentials`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: issuer.issuer_id,
          credentialConfigurationId: start.credentialConfigurationId,
          code,
          grantType: 'authorization_code',
          redirectUri,
          codeVerifier: verifier,
        }),
        step: 'credential',
      }),
      'wallet-store',
    );
    const credentialId = idOf(stored.credentialId ?? stored.id);

    // 4. Answer the verifier's request with that credential.
    ctx.enterStep('wallet.fetch-request');
    const presentation = await json(
      await call(`/wallets/${walletId}/presentations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorizationRequestUrl: request.requestUri }),
      }),
      'presentation-request',
    );
    const presentationId = idOf(presentation.presentationId ?? presentation.id);
    // Inji Web lists the matching credentials before the person picks one; Mimoto keeps that list in the
    // session and accepts only credentials from it.
    const matching = await json(
      await call(`/wallets/${walletId}/presentations/${presentationId}/credentials`),
      'presentation-credentials',
    );
    const offered = matchingCredentialIds(matching);
    if (offered.length === 0) {
      // Mimoto 0.22 matches only ldp_vc credentials; an SD-JWT VC is never offered (gap G25).
      const format = this.#formats.get(ctx.runId);
      const sdJwt = format === 'vc+sd-jwt' || format === 'dc+sd-jwt';
      throw new RoleError(
        'wallet.no-matching-credential',
        sdJwt
          ? `Mimoto offers no credential for this request (the run's credential is ${format}): its credential matching supports only ldp_vc (gap G25)`
          : `Mimoto offers no credential for this request: ${JSON.stringify(matching).slice(0, 300)}`,
        { category: 'interop' },
      );
    }
    const selected = offered.includes(credentialId) ? [credentialId] : offered.slice(0, 1);
    ctx.enterStep('wallet.submit');
    const submitted = await call(`/wallets/${walletId}/presentations/${presentationId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedCredentials: selected,
        submissionRequest: true,
      }),
    });
    await json(submitted, 'presentation-submit');
    return { submittedAt: new Date().toISOString(), status: submitted.status };
  }

  async #issuerFor(ctx: RunContext, credentialIssuer: string): Promise<MimotoIssuer> {
    const response = await ctx.http.fetch(`${this.#mimoto}/issuers`, {
      signal: ctx.signal,
      step: 'issuer.metadata',
    });
    const body = (await response.json()) as { response?: { issuers?: MimotoIssuer[] } };
    const wanted = credentialIssuer.replace(/\/+$/, '');
    const issuer = body.response?.issuers?.find(
      (entry) => entry.credential_issuer_host?.replace(/\/+$/, '') === wanted,
    );
    if (!issuer) {
      throw new RoleError(
        'wallet.issuer-unknown',
        `Mimoto has no issuer for ${credentialIssuer} (deploy/inji-stack/config/mimoto-issuers-config.json)`,
        { category: 'environment' },
      );
    }
    return issuer;
  }

  /** The authorization Inji Web's browser would make, approved at once by the test authorization server. */
  async #authorize(
    ctx: RunContext,
    issuer: MimotoIssuer,
    start: Extract<IssuanceStart, { mode: 'wallet-initiated' }>,
  ): Promise<{ code: string; verifier: string; redirectUri: string }> {
    const metadata = (await (
      await ctx.http.fetch(
        `${this.#mimoto}/issuers/${encodeURIComponent(issuer.issuer_id)}/well-known-proxy`,
        {
          signal: ctx.signal,
          step: 'issuer.metadata',
        },
      )
    ).json()) as {
      authorization_servers?: string[];
      credential_configurations_supported?: Record<string, { scope?: string }>;
    };
    const scope =
      metadata.credential_configurations_supported?.[start.credentialConfigurationId]?.scope ?? 'openid';
    const authorizationServer = metadata.authorization_servers?.[0];
    if (!authorizationServer)
      throw new RoleError('wallet.as-unknown', 'the issuer names no authorization server');
    const asMetadata = (await (
      await ctx.http.fetch(
        `${authorizationServer.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`,
        {
          signal: ctx.signal,
          step: 'as.metadata',
        },
      )
    ).json()) as { authorization_endpoint?: string };
    if (!asMetadata.authorization_endpoint) {
      throw new RoleError(
        'wallet.as-no-authorization-endpoint',
        'the authorization server has no authorization endpoint (gap G6)',
      );
    }
    const verifier = randomBytes(32).toString('base64url');
    const redirectUri = issuer.redirect_uri ?? 'http://localhost:28004/redirect';
    const url = new URL(asMetadata.authorization_endpoint);
    for (const [name, value] of Object.entries({
      response_type: 'code',
      client_id: issuer.client_id ?? 'ps02-mimoto',
      redirect_uri: redirectUri,
      scope,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: randomBytes(8).toString('base64url'),
    })) {
      url.searchParams.set(name, value);
    }
    const approved = await ctx.http.fetch(url, { redirect: 'manual', signal: ctx.signal, step: 'token' });
    const location = approved.headers.get('location');
    const code = location ? new URL(location).searchParams.get('code') : null;
    if (!code)
      throw new RoleError('wallet.authorization-failed', `no authorization code (HTTP ${approved.status})`);
    return { code, verifier, redirectUri };
  }

  /** Mimoto's credential response to this run, as the recording proxy or the inbound recorder saw it. */
  async #recordedCredential(ctx: RunContext): Promise<RecordedExchange | undefined> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('no credential response recorded')), 5_000);
    try {
      return await this.#options.hub.waitFor(
        ctx.runId,
        (exchange) =>
          // Mimoto's own call to the issuer; the playground's calls to Mimoto share the step.
          exchange.step === 'credential' &&
          exchange.to !== 'mimoto' &&
          (exchange.response?.status ?? 0) >= 200 &&
          (exchange.response?.status ?? 0) < 300,
        timeout.signal,
      );
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

function credentialOf(exchange: RecordedExchange): string | undefined {
  try {
    const body = JSON.parse(exchange.response?.body ?? '') as {
      credential?: unknown;
      credentials?: Array<{ credential?: unknown }>;
    };
    const credential = body.credential ?? body.credentials?.[0]?.credential;
    if (typeof credential === 'string') return credential;
    return credential === undefined ? undefined : JSON.stringify(credential);
  } catch {
    return undefined;
  }
}

function formatOf(raw: string | undefined): CredentialFormat | undefined {
  if (!raw) return undefined;
  return raw.trimStart().startsWith('{') ? 'ldp_vc' : 'vc+sd-jwt';
}

/** An id Mimoto answered with, as a string; empty when it sent none. */
function idOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** Credential ids in Mimoto's list of credentials matching a presentation request. */
function matchingCredentialIds(body: unknown): string[] {
  const ids: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.credentialId === 'string') ids.push(record.credentialId);
      for (const child of Object.values(record)) if (typeof child === 'object') visit(child);
    }
  };
  visit(body);
  return [...new Set(ids)];
}
