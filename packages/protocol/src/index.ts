// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * @inji-playground/protocol: the contracts every package codes against.
 *
 * Data shapes are zod schemas (`...Schema`) with the TypeScript type inferred from each; behaviour
 * (role adapters, run context) is described by TypeScript interfaces in `roles-api.ts`.
 */
export * from './api.js';
export * from './common.js';
export * from './enums.js';
export * from './errors.js';
export * from './events.js';
export * from './exchange.js';
export * from './flow.js';
export * from './health.js';
export * from './insights.js';
export * from './person.js';
export * from './report.js';
export * from './roles.js';
export type * from './roles-api.js';
export * from './run.js';
export * from './scenario.js';
export * from './steps.js';
export * from './verdict.js';
