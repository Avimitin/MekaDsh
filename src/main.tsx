import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { ConnectionRuntime } from './connections/runtime';
import { browserStorage } from './connections/storage';

import './styles/globals.css';

// Load feature pages when visited so the connection screen does not download
// chat rendering, syntax grammars, and every management form before connecting.
const SessionsPage = lazy(() =>
  import('./ui/pages/SessionsPage').then((page) => ({ default: page.SessionsPage })),
);
const SessionRoute = lazy(() =>
  import('./ui/pages/SessionsPage').then((page) => ({ default: page.SessionRoute })),
);
const ResourcesPage = lazy(() =>
  import('./ui/pages/ResourcesPage').then((page) => ({ default: page.ResourcesPage })),
);
const SchedulesPage = lazy(() =>
  import('./ui/pages/SchedulesPage').then((page) => ({ default: page.SchedulesPage })),
);
const McpPage = lazy(() =>
  import('./ui/pages/McpPage').then((page) => ({ default: page.McpPage })),
);
const SettingsPage = lazy(() =>
  import('./ui/pages/SettingsPage').then((page) => ({ default: page.SettingsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const runtime = new ConnectionRuntime(browserStorage(), queryClient);
const rootRoute = createRootRoute({
  component: () => <App runtime={runtime} />,
  notFoundComponent: () => (
    <div style={{ padding: 32 }}>
      <h1>Page not found</h1>
      <a href="#/">Back to sessions</a>
    </div>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <SessionsPage />,
});
const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  component: () => <SessionsPage />,
});
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  component: SessionRoute,
});
const routes = [
  indexRoute,
  sessionsRoute,
  sessionRoute,
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/memory',
    component: () => <ResourcesPage kind="memory" />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills',
    component: () => <ResourcesPage kind="skills" />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/schedules',
    component: () => <SchedulesPage />,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/mcp', component: McpPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
];
const router = createRouter({
  history: createHashHistory(),
  routeTree: rootRoute.addChildren(routes),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The application root element is missing.');
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
