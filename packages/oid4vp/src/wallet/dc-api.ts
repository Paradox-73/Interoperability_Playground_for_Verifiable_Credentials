/**
 * The wallet side of OpenID4VP over the Digital Credentials API (OpenID4VP 1.0 Appendix A): a wallet that
 * the browser called reads the request `data`, takes the verifier's identity from the origin the browser
 * reports, and returns the authorization response as data instead of posting it.
 *
 * `resolveDcApiRequest` turns the request into the `ResolvedRequest` of the presentation client, so the same
 * credential selection and presentation code answers both transports; `dcApiResponse` wraps the result as
 * the `DigitalCredential` data the page receives.
 */
import { isRecord } from '@inji-playground/formats';
import { parseClientId } from '../common/client-id.js';
import {
  DC_API_PROTOCOL_SIGNED,
  DC_API_PROTOCOL_UNSIGNED,
  DC_API_RESPONSE_MODE,
  originClientId,
  type DcApiRequest,
  type DcApiResponse,
} from '../common/dc-api.js';
import { Oid4vpError } from '../common/errors.js';
import type { AuthorizationResponse, ResolvedRequest } from './presentation-client.js';

/**
 * Reads an unsigned Digital Credentials API request for a page at `origin`. Parameters the unsigned form
 * must not carry are refused: `client_id` (the origin is the client), `response_uri` and `redirect_uri`
 * (the answer goes back through the browser), and `presentation_definition` (1.0 uses DCQL).
 */
export function resolveDcApiRequest(request: DcApiRequest, origin: string): ResolvedRequest {
  if (request.protocol === DC_API_PROTOCOL_SIGNED) {
    throw new Oid4vpError('REQUEST_INVALID', 'signed Digital Credentials API requests are not supported', {
      spec: 'OpenID4VP 1.0 Appendix A.3.2',
    });
  }
  if (request.protocol !== DC_API_PROTOCOL_UNSIGNED) {
    throw new Oid4vpError('REQUEST_INVALID', `unknown Digital Credentials API protocol ${request.protocol}`, {
      spec: 'OpenID4VP 1.0 Appendix A.1',
    });
  }
  const data = request.data;
  if (!isRecord(data)) throw new Oid4vpError('REQUEST_INVALID', 'request data must be a JSON object');
  if (data.response_mode !== DC_API_RESPONSE_MODE) {
    throw new Oid4vpError('REQUEST_INVALID', `response_mode must be ${DC_API_RESPONSE_MODE}`, {
      spec: 'OpenID4VP 1.0 Appendix A.2',
    });
  }
  if (data.response_type !== 'vp_token') {
    throw new Oid4vpError('REQUEST_INVALID', 'response_type must be vp_token', {
      spec: 'OpenID4VP 1.0 section 5.1',
    });
  }
  for (const name of ['client_id', 'response_uri', 'redirect_uri', 'presentation_definition']) {
    if (data[name] !== undefined) {
      throw new Oid4vpError('REQUEST_INVALID', `an unsigned Digital Credentials API request has no ${name}`, {
        spec: 'OpenID4VP 1.0 Appendix A.2 and A.3.1',
      });
    }
  }
  if (typeof data.nonce !== 'string' || data.nonce.length === 0) {
    throw new Oid4vpError('REQUEST_INVALID', 'nonce is missing', { spec: 'OpenID4VP 1.0 section 5.2' });
  }
  if (!isRecord(data.dcql_query)) {
    throw new Oid4vpError('REQUEST_INVALID', 'dcql_query is missing', { spec: 'OpenID4VP 1.0 section 5.1' });
  }
  const clientId = originClientId(origin);
  return {
    profile: 'final-1.0',
    uri: '',
    clientId,
    client: parseClientId(clientId),
    signed: false,
    parameters: data,
    nonce: data.nonce,
    responseUri: '',
    dcqlQuery: data.dcql_query,
  };
}

/** The `DigitalCredential` (`protocol`, `data`) a wallet returns for `response`. */
export function dcApiResponse(response: AuthorizationResponse): DcApiResponse {
  return { protocol: DC_API_PROTOCOL_UNSIGNED, data: { vp_token: response.vpToken } };
}
