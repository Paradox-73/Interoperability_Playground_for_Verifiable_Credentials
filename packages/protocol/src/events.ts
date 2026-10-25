// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Events a run emits. They are stored in order, streamed over the WebSocket and replayed in playback,
 * so the UI is driven by the same data whether a run is live or recorded.
 */
import { z } from 'zod';
import { IsoDateTimeSchema, RunIdSchema } from './common.js';
import { ArtifactKindSchema, CredentialFormatSchema, StepIdSchema, StepStatusSchema } from './enums.js';
import { RecordedExchangeSchema } from './exchange.js';
import { PersonActionSchema } from './person.js';
import { InteropReportSchema } from './report.js';
import { RunConfigSchema, StepErrorSchema } from './run.js';

export const RunStartedEventSchema = z.object({
  type: z.literal('run.started'),
  runId: RunIdSchema,
  config: RunConfigSchema,
  at: IsoDateTimeSchema,
});

export const StepStartedEventSchema = z.object({
  type: z.literal('step.started'),
  runId: RunIdSchema,
  step: StepIdSchema,
  /** Plain-language label of what is happening, shown on the timeline. */
  label: z.string().min(1),
  at: IsoDateTimeSchema,
});

export const StepFinishedEventSchema = z.object({
  type: z.literal('step.finished'),
  runId: RunIdSchema,
  step: StepIdSchema,
  status: StepStatusSchema,
  error: StepErrorSchema.optional(),
  at: IsoDateTimeSchema,
});

export const ExchangeEventSchema = z.object({
  type: z.literal('exchange'),
  runId: RunIdSchema,
  exchange: RecordedExchangeSchema,
});

export const ArtifactEventSchema = z.object({
  type: z.literal('artifact'),
  runId: RunIdSchema,
  kind: ArtifactKindSchema,
  format: CredentialFormatSchema.optional(),
  /** The artefact exactly as exchanged (JSON text, compact JWT, base64url CBOR). */
  raw: z.string(),
});

export const PersonActionNeededEventSchema = z.object({
  type: z.literal('person.action-needed'),
  runId: RunIdSchema,
  action: PersonActionSchema,
});

export const RunFinishedEventSchema = z.object({
  type: z.literal('run.finished'),
  runId: RunIdSchema,
  report: InteropReportSchema,
});

export const RunEventSchema = z.discriminatedUnion('type', [
  RunStartedEventSchema,
  StepStartedEventSchema,
  StepFinishedEventSchema,
  ExchangeEventSchema,
  ArtifactEventSchema,
  PersonActionNeededEventSchema,
  RunFinishedEventSchema,
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunEventType = RunEvent['type'];
/** The member of the `RunEvent` union with the given `type`. */
export type RunEventOf<T extends RunEventType> = Extract<RunEvent, { type: T }>;

/**
 * Messages a WebSocket client sends to `GET /ws`. `runId: '*'` subscribes to every run (history page,
 * matrix page); a specific id subscribes to one run and receives its stored events first.
 */
export const WsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), runId: z.union([RunIdSchema, z.literal('*')]) }),
  z.object({ type: z.literal('unsubscribe'), runId: z.union([RunIdSchema, z.literal('*')]) }),
]);
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;
