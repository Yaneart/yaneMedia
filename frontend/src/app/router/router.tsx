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
  RequestPasswordResetPage,
  ResetPasswordPage,
  SearchPage,
  SeriesPage,
  VerifyEmailPage,
} from './lazyPages';
import { routePaths } from './routes';
import { RouteAccessibility } from './RouteAccessibility';
import { LoadingState, MediaPageSkeleton } from '@/shared';
import { HomePage } from '@/pages/home';
import { MediaCatalogSkeleton } from '@/widgets/media-catalog';

function lazyRoute(page: ReactNode, fallback?: ReactNode) {
  return (
    <Suspense fallback={fallback ?? <LoadingState label="Загружаем страницу" variant="page" />}>
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
          <LoginPage
            homePath={routePaths.home}
            registerPath={routePaths.register}
            forgotPasswordPath={routePaths.forgotPassword}
          />,
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
        path: routePaths.forgotPassword,
        element: lazyRoute(
          <RequestPasswordResetPage homePath={routePaths.home} loginPath={routePaths.login} />,
        ),
      },
      {
        path: routePaths.resetPassword,
        element: lazyRoute(
          <ResetPasswordPage
            homePath={routePaths.home}
            loginPath={routePaths.login}
            requestPasswordResetPath={routePaths.forgotPassword}
          />,
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
            element: lazyRoute(<MoviesPage />, <MediaCatalogSkeleton title="Фильмы" />),
          },
          {
            path: routePaths.series,
            element: lazyRoute(<SeriesPage />, <MediaCatalogSkeleton title="Сериалы" />),
          },
          {
            path: routePaths.anime,
            element: lazyRoute(<AnimePage />, <MediaCatalogSkeleton title="Аниме" />),
          },
          {
            path: routePaths.editorialPicks,
            element: lazyRoute(<EditorialCollectionPage />),
          },
          {
            path: routePaths.media,
            element: lazyRoute(<MediaPage />, <MediaPageSkeleton />),
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
