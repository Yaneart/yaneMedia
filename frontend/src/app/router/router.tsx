import { Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '../layout/AppShell';
import {
  AnimePage,
  EditorialCollectionPage,
  FavoritesPage,
  HistoryPage,
  LoginPage,
  MediaPage,
  MoviesPage,
  NotFoundPage,
  RegisterPage,
  SearchPage,
  SeriesPage,
  VerifyEmailPage,
} from './lazyPages';
import { routePaths } from './routes';
import { RouteAccessibility } from './RouteAccessibility';
import { LoadingState } from '@/shared';
import { HomePage } from '@/pages/home';

function lazyRoute(page: ReactNode) {
  return (
    <Suspense fallback={<LoadingState label="Загружаем страницу" variant="page" />}>
      {page}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <RouteAccessibility />,
    children: [
      {
        path: routePaths.login,
        element: lazyRoute(
          <LoginPage homePath={routePaths.home} registerPath={routePaths.register} />,
        ),
      },
      {
        path: routePaths.register,
        element: lazyRoute(
          <RegisterPage homePath={routePaths.home} loginPath={routePaths.login} />,
        ),
      },
      {
        path: routePaths.verifyEmail,
        element: lazyRoute(
          <VerifyEmailPage homePath={routePaths.home} loginPath={routePaths.login} />,
        ),
      },
      {
        element: <AppShell />,
        children: [
          {
            path: routePaths.home,
            element: <HomePage />,
          },
          {
            path: routePaths.search,
            element: lazyRoute(<SearchPage />),
          },
          {
            path: routePaths.movies,
            element: lazyRoute(<MoviesPage />),
          },
          {
            path: routePaths.series,
            element: lazyRoute(<SeriesPage />),
          },
          {
            path: routePaths.anime,
            element: lazyRoute(<AnimePage />),
          },
          {
            path: routePaths.editorialPicks,
            element: lazyRoute(<EditorialCollectionPage />),
          },
          {
            path: routePaths.media,
            element: lazyRoute(<MediaPage />),
          },
          {
            path: routePaths.favorites,
            element: lazyRoute(<FavoritesPage />),
          },
          {
            path: routePaths.history,
            element: lazyRoute(<HistoryPage />),
          },
          {
            path: routePaths.notFound,
            element: lazyRoute(<NotFoundPage />),
          },
        ],
      },
    ],
  },
]);
