// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { setupServer } from 'msw/node';
import { defaultHandlers } from './handlers';

export const server = setupServer(...defaultHandlers);
