// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';
import { IsoDateTimeSchema, RunIdSchema } from './common.js';
import { StepIdSchema } from './enums.js';

/**
 * Where an exchange was captured:
 * - `outbound`: a call made by playground code through the recording HTTP client;
 * - `proxy`: a call from a browser, phone or container that passed through the playground's reverse proxy;
 * - `inbound`: a call received by a reference role hosted by the playground.
 */
export const CaptureSchema = z.enum(['outbound', 'proxy', 'inbound']);
export type Capture = z.infer<typeof CaptureSchema>;

/**
 * Bodies are stored as text. Binary bodies (for example CBOR of an mdoc) are stored as base64 and
 * marked as such, so the inspector can show them as a hex dump instead of garbled text.
 */
export const BodyEncodingSchema = z.enum(['utf8', 'base64']);
export type BodyEncoding = z.infer<typeof BodyEncodingSchema>;

/** Header names are stored lower-case; repeated headers are joined with ", " as the Fetch API does. */
export const HeadersSchema = z.record(z.string(), z.string());

export const RecordedRequestSchema = z.object({
  method: z.string().min(1),
  url: z.string().min(1),
  headers: HeadersSchema,
  body: z.string().optional(),
  bodyEncoding: BodyEncodingSchema.optional(),
});
export type RecordedRequest = z.infer<typeof RecordedRequestSchema>;

export const RecordedResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  headers: HeadersSchema,
  body: z.string().optional(),
  bodyEncoding: BodyEncodingSchema.optional(),
});
export type RecordedResponse = z.infer<typeof RecordedResponseSchema>;

/** One HTTP request and its response, exactly as they crossed the wire. */
export const RecordedExchangeSchema = z.object({
  id: z.string().min(1),
  runId: RunIdSchema,
  /** Order of the exchange within its run, starting at 1. */
  seq: z.number().int().positive(),
  capture: CaptureSchema,
  /** Protocol step the exchange belongs to, when the tagging rules recognised it. */
  step: StepIdSchema.optional(),
  /** Role ids (or service names) of the sender and receiver; the sequence diagram draws an arrow between them. */
  from: z.string().min(1),
  to: z.string().min(1),
  request: RecordedRequestSchema,
  /** Missing when the request failed before any response arrived (see `error`). */
  response: RecordedResponseSchema.optional(),
  startedAt: IsoDateTimeSchema,
  durationMs: z.number().nonnegative(),
  /** Network or timeout error, for example `ECONNREFUSED` or `aborted after 90000 ms`. */
  error: z.string().optional(),
  /** True when tokens, codes, cookies and private keys were replaced by placeholders (exports). */
  redacted: z.boolean().optional(),
});
export type RecordedExchange = z.infer<typeof RecordedExchangeSchema>;
