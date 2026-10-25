// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router-dom';
import { App } from './App';
import { createQueryClient } from './api/queries';
import { defaultSocketUrl, RunSocket } from './api/socket';
import { routes } from './app/routes';
import './index.css';
import { applyTheme, readPreference } from './theme/theme';

// Apply the saved theme before the first paint, so a dark-theme user never sees a light flash.
applyTheme(readPreference());

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <App
      queryClient={createQueryClient()}
      socket={new RunSocket({ url: defaultSocketUrl() })}
      router={createBrowserRouter(routes)}
    />
  </StrictMode>,
);
