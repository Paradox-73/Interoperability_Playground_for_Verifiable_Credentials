/**
 * Every page of the UI. Shared by the browser router (main.tsx) and the memory router in tests.
 */
import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { GapsPage } from '../features/gaps/GapsPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { MatrixPage } from '../features/matrix/MatrixPage';
import { ReportPage } from '../features/report/ReportPage';
import { AboutPage } from '../pages/AboutPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaygroundPage } from '../pages/PlaygroundPage';
import { RunPage } from '../pages/RunPage';
import { AppShell } from './AppShell';

// Playback brings the diagram and the inspector; it loads when first opened.
const PlaybackPage = lazy(() =>
  import('../playback/PlaybackPage').then((module) => ({ default: module.PlaybackPage })),
);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <PlaygroundPage /> },
      { path: 'runs', element: <HistoryPage /> },
      { path: 'runs/:id', element: <RunPage /> },
      { path: 'runs/:id/report', element: <ReportPage /> },
      {
        path: 'runs/:id/playback',
        element: (
          <Suspense fallback={null}>
            <PlaybackPage />
          </Suspense>
        ),
      },
      { path: 'matrix', element: <MatrixPage /> },
      { path: 'gaps', element: <GapsPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
