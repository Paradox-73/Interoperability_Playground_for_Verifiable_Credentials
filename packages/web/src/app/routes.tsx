// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Every page of the UI. Shared by the browser router (main.tsx) and the memory router in tests.
 */
import { lazy, Suspense, type ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AboutPage } from '../pages/AboutPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaygroundPage } from '../pages/PlaygroundPage';
import { RunPage } from '../pages/RunPage';
import { AppShell } from './AppShell';

// Playback brings the diagram and the inspector; it loads when first opened. The evidence pages load
// on first visit too, so the playground page a judge opens first stays small.
const PlaybackPage = lazy(() =>
  import('../playback/PlaybackPage').then((module) => ({ default: module.PlaybackPage })),
);
const HistoryPage = lazy(() =>
  import('../features/history/HistoryPage').then((module) => ({ default: module.HistoryPage })),
);
const ReportPage = lazy(() =>
  import('../features/report/ReportPage').then((module) => ({ default: module.ReportPage })),
);
const MatrixPage = lazy(() =>
  import('../features/matrix/MatrixPage').then((module) => ({ default: module.MatrixPage })),
);
const GapsPage = lazy(() =>
  import('../features/gaps/GapsPage').then((module) => ({ default: module.GapsPage })),
);

const later = (page: ReactNode) => <Suspense fallback={null}>{page}</Suspense>;

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <PlaygroundPage /> },
      { path: 'runs', element: later(<HistoryPage />) },
      { path: 'runs/:id', element: <RunPage /> },
      { path: 'runs/:id/report', element: later(<ReportPage />) },
      {
        path: 'runs/:id/playback',
        element: later(<PlaybackPage />),
      },
      { path: 'matrix', element: later(<MatrixPage />) },
      { path: 'gaps', element: later(<GapsPage />) },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
