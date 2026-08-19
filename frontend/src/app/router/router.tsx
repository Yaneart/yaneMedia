import { createBrowserRouter } from 'react-router';
import { AppShell } from '../layout/AppShell';
import { routePaths } from './routes';
import { HomePage } from '@/pages/home';
import { SearchPage } from '@/pages/search';
import { MoviesPage } from '@/pages/movies';
import { SeriesPage } from '@/pages/series';
import { AnimePage } from '@/pages/anime';
import { MediaPage } from '@/pages/media';
import { FavoritesPage } from '@/pages/favorites';
import { HistoryPage } from '@/pages/history';
import { RegisterPage } from '@/pages/register';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';

export const router = createBrowserRouter([
  {
    path: routePaths.login,
    element: <LoginPage homePath={routePaths.home} registerPath={routePaths.register} />,
  },
  {
    path: routePaths.register,
    element: <RegisterPage />,
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
        element: <SearchPage />,
      },
      {
        path: routePaths.movies,
        element: <MoviesPage />,
      },
      {
        path: routePaths.series,
        element: <SeriesPage />,
      },
      {
        path: routePaths.anime,
        element: <AnimePage />,
      },
      {
        path: routePaths.media,
        element: <MediaPage />,
      },
      {
        path: routePaths.favorites,
        element: <FavoritesPage />,
      },
      {
        path: routePaths.history,
        element: <HistoryPage />,
      },
      {
        path: routePaths.notFound,
        element: <NotFoundPage />,
      },
    ],
  },
]);
