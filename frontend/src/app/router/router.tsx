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
  ProfilePage,
  PublicProfilePage,
  RegisterPage,
  ReviewPage,
  RequestPasswordResetPage,
  ResetPasswordPage,
  SearchPage,
  SeriesPage,
  VerifyEmailPage,
} from './lazyPages';
import { routePaths } from './routes';
import { RouteAccessibility } from './RouteAccessibility';
import {
  EditorialCollectionPageSkeleton,
  LoadingState,
  MediaPageSkeleton,
  SearchPageSkeleton,
  SocialPageSkeleton,
} from '@/shared';
import { HomePage } from '@/pages/home';
import { MediaCatalogSkeleton } from '@/widgets/media-catalog';
import { LibraryPageSkeleton } from '@/widgets/library-page';
import { AuthFormLayoutSkeleton } from '@/widgets/auth-form-layout';
import { SocialRouteErrorBoundary } from './SocialRouteErrorBoundary';

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
          <AuthFormLayoutSkeleton variant="login" />,
        ),
      },
      {
        path: routePaths.register,
        element: lazyRoute(
          <RegisterPage homePath={routePaths.home} loginPath={routePaths.login} />,
          <AuthFormLayoutSkeleton variant="register" />,
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
            element: lazyRoute(<SearchPage />, <SearchPageSkeleton />),
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
            element: lazyRoute(<EditorialCollectionPage />, <EditorialCollectionPageSkeleton />),
          },
          {
            path: routePaths.media,
            element: lazyRoute(<MediaPage />, <MediaPageSkeleton />),
          },
          {
            path: routePaths.favorites,
            element: lazyRoute(<FavoritesPage />, <LibraryPageSkeleton variant="favorites" />),
          },
          {
            path: routePaths.history,
            element: lazyRoute(<HistoryPage />, <LibraryPageSkeleton variant="history" />),
          },
          {
            path: routePaths.profile,
            element: lazyRoute(<ProfilePage />, <SocialPageSkeleton variant="private-profile" />),
            errorElement: <SocialRouteErrorBoundary />,
          },
          {
            path: routePaths.publicProfile,
            element: lazyRoute(
              <PublicProfilePage />,
              <SocialPageSkeleton variant="public-profile" />,
            ),
            errorElement: <SocialRouteErrorBoundary />,
          },
          {
            path: routePaths.review,
            element: lazyRoute(<ReviewPage />, <SocialPageSkeleton variant="review" />),
            errorElement: <SocialRouteErrorBoundary />,
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
