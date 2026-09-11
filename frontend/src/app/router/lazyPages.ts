import { lazy } from 'react';

export const AnimePage = lazy(() =>
  import('@/pages/anime').then(({ AnimePage }) => ({ default: AnimePage })),
);
export const EditorialCollectionPage = lazy(() =>
  import('@/pages/editorial-collection').then(({ EditorialCollectionPage }) => ({
    default: EditorialCollectionPage,
  })),
);
export const FavoritesPage = lazy(() =>
  import('@/pages/favorites').then(({ FavoritesPage }) => ({ default: FavoritesPage })),
);
export const HistoryPage = lazy(() =>
  import('@/pages/history').then(({ HistoryPage }) => ({ default: HistoryPage })),
);
export const LoginPage = lazy(() =>
  import('@/pages/login').then(({ LoginPage }) => ({ default: LoginPage })),
);
export const MediaPage = lazy(() =>
  import('@/pages/media').then(({ MediaPage }) => ({ default: MediaPage })),
);
export const MoviesPage = lazy(() =>
  import('@/pages/movies').then(({ MoviesPage }) => ({ default: MoviesPage })),
);
export const NotFoundPage = lazy(() =>
  import('@/pages/not-found').then(({ NotFoundPage }) => ({ default: NotFoundPage })),
);
export const RegisterPage = lazy(() =>
  import('@/pages/register').then(({ RegisterPage }) => ({ default: RegisterPage })),
);
export const SearchPage = lazy(() =>
  import('@/pages/search').then(({ SearchPage }) => ({ default: SearchPage })),
);
export const SeriesPage = lazy(() =>
  import('@/pages/series').then(({ SeriesPage }) => ({ default: SeriesPage })),
);
export const VerifyEmailPage = lazy(() =>
  import('@/pages/verify-email').then(({ VerifyEmailPage }) => ({ default: VerifyEmailPage })),
);
