// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';

/**
 * Something a person must do for a run to continue, for example scan a credential offer with a phone
 * wallet. The UI shows it as a modal with a QR code and a deep link; the run waits until the server
 * observes the wallet's request or the person presses "done".
 */
export const PersonActionSchema = z.object({
  id: z.string().min(1),
  /** `dc-api`: present through the browser's Digital Credentials API (`navigator.credentials.get()`). */
  kind: z.enum(['scan-offer', 'scan-request', 'open-link', 'confirm', 'dc-api']),
  title: z.string().min(1),
  /** Step-by-step instructions in plain language, one entry per step. */
  instructions: z.array(z.string().min(1)).min(1),
  /** Text to encode as a QR code (a credential offer URI or an `openid4vp://` request). */
  qrText: z.string().optional(),
  /** Same-device link, when the target wallet supports one. */
  deepLink: z.string().optional(),
  /**
   * `dc-api` only, paths on this server: where the page reads the request (`{ protocol, data }`) to pass to
   * `navigator.credentials.get()`, where it posts what the browser returned (both on the verifier), and where
   * the playground's reference wallet answers the request instead, for a browser without a wallet for it.
   */
  dcApi: z
    .object({ requestUrl: z.string().min(1), responseUrl: z.string().min(1), providerUrl: z.string().min(1) })
    .optional(),
  /** How long the run waits before the step fails with `person.timeout`. */
  timeoutMs: z.number().int().positive(),
});
export type PersonAction = z.infer<typeof PersonActionSchema>;
