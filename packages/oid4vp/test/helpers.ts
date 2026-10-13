/**
 * Test fixtures: an issuer, a holder and credentials in both formats, issued with the formats library;
 * a reference verifier; and a wallet whose `fetch` is answered by the verifier in-process, so no test
 * opens a socket or reaches the network.
 */
import {
  CREDENTIALS_V1_URL,
  PLAYGROUND_CONTEXT_V1_URL,
  createDidKey,
  createDidResolver,
  createDocumentLoader,
  didKeyVerificationMethodId,
  generateKeyPair,
  issueLdpVc,
  issueSdJwtVc,
  type KeyPair,
} from '@inji-playground/formats';
import {
  PresentationClient,
  ReferenceVerifier,
  verifierFetchHandler,
  type FetchFn,
  type PresentationClientOptions,
  type ReferenceVerifierOptions,
  type StoredCredential,
} from '../src/index.js';

export const VERIFIER_BASE_URL = 'https://verifier.ps02.test/ref/verifier';
export const FARMER_VCT = 'https://playground.ps02.test/vct/farmer/v1';

export const resolver = createDidResolver();
export const documentLoader = createDocumentLoader({ didResolver: resolver });

export interface Party {
  keyPair: KeyPair;
  did: string;
  verificationMethod: string;
}

export function didKeyParty(): Party {
  const keyPair = generateKeyPair('EdDSA');
  const did = createDidKey(keyPair.publicJwk);
  return { keyPair, did, verificationMethod: didKeyVerificationMethodId(did) };
}

export const issuer = didKeyParty();
export const holder = didKeyParty();

export interface CredentialOptions {
  /** Holder DID written into `credentialSubject.id`. Default: the holder's did:key. */
  subjectId?: string;
  expired?: boolean;
  /** `credentialStatus` of the credential. */
  credentialStatus?: Record<string, unknown> | Record<string, unknown>[];
}

const hour = 3_600_000;

export async function farmerLdpVc(options: CredentialOptions = {}): Promise<StoredCredential> {
  const now = Date.now();
  const credential = {
    '@context': [CREDENTIALS_V1_URL, PLAYGROUND_CONTEXT_V1_URL],
    type: ['VerifiableCredential', 'FarmerCredential'],
    issuer: issuer.did,
    issuanceDate: new Date(now - 2 * hour).toISOString(),
    expirationDate: new Date(options.expired ? now - hour : now + hour).toISOString(),
    credentialSubject: {
      id: options.subjectId ?? holder.did,
      givenName: 'Asha',
      familyName: 'Rao',
      landAreaAcres: 3,
    },
    ...(options.credentialStatus ? { credentialStatus: options.credentialStatus } : {}),
  };
  const signed = await issueLdpVc({
    credential,
    suite: 'Ed25519Signature2020',
    key: { keyPair: issuer.keyPair, verificationMethod: issuer.verificationMethod },
    documentLoader,
  });
  return { id: 'farmer-ldp', format: 'ldp_vc', raw: JSON.stringify(signed) };
}

export async function farmerSdJwtVc(
  options: { expired?: boolean; status?: Record<string, unknown> } = {},
): Promise<StoredCredential> {
  const now = Date.now();
  const raw = await issueSdJwtVc({
    issuer: { keyPair: issuer.keyPair, kid: issuer.verificationMethod },
    iss: issuer.did,
    typ: 'vc+sd-jwt',
    vct: FARMER_VCT,
    claims: { given_name: 'Asha', family_name: 'Rao', land_area_acres: 3 },
    holder: { jwk: holder.keyPair.publicJwk },
    ...(options.status ? { status: options.status } : {}),
    issuedAt: new Date(now - 2 * hour),
    expiresAt: new Date(options.expired ? now - hour : now + hour),
  });
  return { id: 'farmer-sd-jwt', format: 'vc+sd-jwt', raw };
}

/** Changes one character in the middle of a base64url or multibase signature. */
export function flipCharacter(text: string, index = Math.floor(text.length / 2)): string {
  const current = text[index];
  const replacement = current === 'A' ? 'B' : 'A';
  return `${text.slice(0, index)}${replacement}${text.slice(index + 1)}`;
}

/** An ldp_vc whose issuer proof value has one character changed. */
export function flipLdpSignature(credential: StoredCredential): StoredCredential {
  const json = JSON.parse(credential.raw) as { proof: { proofValue: string } };
  json.proof.proofValue = flipCharacter(json.proof.proofValue);
  return { ...credential, raw: JSON.stringify(json) };
}

/** An SD-JWT VC whose issuer signature has one character changed. */
export function flipSdJwtSignature(credential: StoredCredential): StoredCredential {
  const [jwt, ...rest] = credential.raw.split('~');
  const [header, payload, signature] = (jwt ?? '').split('.') as [string, string, string];
  return { ...credential, raw: [`${header}.${payload}.${flipCharacter(signature, 10)}`, ...rest].join('~') };
}

export interface Harness {
  verifier: ReferenceVerifier;
  wallet: PresentationClient;
  /** The wallet's fetch; tests wrap it to change what the verifier sends. */
  fetch: FetchFn;
  requests: { method: string; url: string; body?: string }[];
}

export function harness(
  options: Partial<PresentationClientOptions> = {},
  verifierOptions: Partial<ReferenceVerifierOptions> = {},
): Harness {
  const verifier = new ReferenceVerifier({
    baseUrl: VERIFIER_BASE_URL,
    didResolver: resolver,
    documentLoader,
    ...verifierOptions,
  });
  const handler = verifierFetchHandler(verifier);
  const requests: Harness['requests'] = [];
  const fetch: FetchFn = (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : undefined;
    requests.push({ method: init?.method ?? 'GET', url: input, ...(body === undefined ? {} : { body }) });
    return handler(new Request(input, init));
  };
  const wallet = new PresentationClient({
    fetch: options.fetch ?? fetch,
    holder: { keyPair: holder.keyPair, did: holder.did, verificationMethod: holder.verificationMethod },
    documentLoader,
    didResolver: resolver,
    ...options,
  });
  return { verifier, wallet, fetch, requests };
}

/** Posts a form to the verifier's response endpoint, as a second wallet (or an attacker) would. */
export async function postForm(fetch: FetchFn, url: string, form: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}
