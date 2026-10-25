// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';

/** Body of `GET /api/health`: the playground server process is up and answering. */
export const ServerHealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('inji-interop-playground'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  time: IsoDateTimeSchema,
});
export type ServerHealth = z.infer<typeof ServerHealthSchema>;
