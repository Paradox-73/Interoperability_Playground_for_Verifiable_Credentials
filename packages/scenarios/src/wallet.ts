/**
 * The reference wallet's side of a scenario: answer an OpenID4VP request with
 * `@inji-playground/oid4vp`'s presentation client, behaving as the scenario says (present a
 * credential the request did not ask for, tamper with the `vp_token` just before posting it).
 */
import type { KeyPair, DocumentLoader } from '@inji-playground/formats';
import {
  Oid4vpError,
  credentialView,
  type CredentialMatch,
  type PresentationClient,
  type PresentationClientOptions,
  type ResolvedRequest,
  type StoredCredential,
  type SubmissionResult,
  type AuthorizationResponse,
} from '@inji-playground/oid4vp';
import type { ScenarioDefinition } from './catalogue.js';
import { tamperPresentation } from './tamper.js';

/** Presentation client options a scenario changes (pass them when the client is created). */
export function walletClientOptions(
  scenario: Pick<ScenarioDefinition, 'wallet'>,
): Pick<PresentationClientOptions, 'holderDidForm'> {
  return scenario.wallet?.holderDidForm ? { holderDidForm: scenario.wallet.holderDidForm } : {};
}

/** What the wallet lends a scenario: its key, a document loader, and what it sent earlier. */
export interface WalletScenarioBinding {
  /** The holder key the client was created with (KB-JWTs are signed again with it). */
  holderKey: KeyPair;
  documentLoader?: DocumentLoader;
  /**
   * The `vp_token` form field this wallet posted to an earlier request of the same verifier, or a
   * function that looks it up once the request (and so the verifier) is known.
   */
  earlierVpToken?: string | ((request: ResolvedRequest) => string | undefined);
  signal?: AbortSignal;
  /** Called once the response is built, just before it is posted (a host moves its timeline here). */
  beforePost?(request: ResolvedRequest): void;
  /** Sees the `vp_token` last, after the scenario's tamper; what it returns is posted. */
  finalVpToken?(vpToken: string, format: string): string | Promise<string>;
}

export type ScenarioSubmission = SubmissionResult & {
  request: ResolvedRequest;
  response: AuthorizationResponse;
};

/**
 * Resolves the request, selects (or, for `presentUnmatched`, forces) the credential, builds the
 * response and posts it, applying the scenario's presentation tamper just before the post.
 */
export async function respondWithScenario(
  client: PresentationClient,
  uri: string,
  credentials: StoredCredential[],
  scenario: Pick<ScenarioDefinition, 'wallet' | 'presentationTamper'>,
  binding: WalletScenarioBinding,
): Promise<ScenarioSubmission> {
  const request = await client.resolveRequest(uri, binding.signal);
  let matches: CredentialMatch[];
  try {
    matches = client.selectCredentials(request, credentials);
  } catch (error) {
    const unmatched = error instanceof Oid4vpError && error.code === 'NO_MATCHING_CREDENTIAL';
    if (!unmatched || !scenario.wallet?.presentUnmatched) throw error;
    matches = forcedMatches(request, credentials);
  }
  const response = await client.buildResponse(request, matches);
  const tamper = scenario.presentationTamper;
  const earlierVpToken =
    typeof binding.earlierVpToken === 'function' ? binding.earlierVpToken(request) : binding.earlierVpToken;
  const finalVpToken = binding.finalVpToken?.bind(binding);
  const beforeSubmit = async (vpToken: string, { format }: { format: string }): Promise<string> => {
    const tampered = tamper
      ? await tamperPresentation(tamper, vpToken, {
          format,
          profile: request.profile,
          nonce: request.nonce,
          clientId: request.clientId,
          holderKey: binding.holderKey,
          ...(binding.documentLoader ? { documentLoader: binding.documentLoader } : {}),
          ...(earlierVpToken === undefined ? {} : { earlierVpToken }),
        })
      : vpToken;
    return finalVpToken ? finalVpToken(tampered, format) : tampered;
  };
  binding.beforePost?.(request);
  const submission = await client.submit(request, response, {
    ...(tamper || finalVpToken ? { beforeSubmit } : {}),
    ...(binding.signal ? { signal: binding.signal } : {}),
  });
  return { ...submission, request, response };
}

/** The first held credential, answering the first query of the request regardless of its constraints. */
function forcedMatches(request: ResolvedRequest, credentials: StoredCredential[]): CredentialMatch[] {
  const credential = credentials[0];
  if (!credential) throw new TypeError('the wallet holds no credential to present');
  const dcqlCredentials = request.dcqlQuery?.credentials;
  const queryId =
    request.presentationDefinition?.input_descriptors[0]?.id ??
    (Array.isArray(dcqlCredentials) && typeof (dcqlCredentials[0] as { id?: unknown })?.id === 'string'
      ? (dcqlCredentials[0] as { id: string }).id
      : undefined);
  if (queryId === undefined) throw new TypeError('the request names no query to answer');
  return [{ queryId, credential, view: credentialView(credential), requestedPaths: [] }];
}
