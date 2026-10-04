/**
 * Every page of the UI. Shared by the browser router (main.tsx) and the memory router in tests.
 * Later features replace the placeholder elements (matrix, gaps) and add the run report under /runs/:id.
 */
import type { RouteObject } from 'react-router-dom';
import { AboutPage } from '../pages/AboutPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { PlaygroundPage } from '../pages/PlaygroundPage';
import { RunPage } from '../pages/RunPage';
import { RunsPage } from '../pages/RunsPage';
import { AppShell } from './AppShell';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <PlaygroundPage /> },
      { path: 'runs', element: <RunsPage /> },
      { path: 'runs/:id', element: <RunPage /> },
      { path: 'matrix', element: <PlaceholderPage page="matrix" /> },
      { path: 'gaps', element: <PlaceholderPage page="gaps" /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
