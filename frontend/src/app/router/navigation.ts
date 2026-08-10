import { routePaths } from './routes';

export type NavigationItem = {
  label: string;
  path: string;
};

export const primaryNavigationItems = [
  {
    label: 'Главная',
    path: routePaths.home,
  },
  {
    label: 'Поиск',
    path: routePaths.search,
  },
  {
    label: 'Фильмы',
    path: routePaths.movies,
  },
  {
    label: 'Сериалы',
    path: routePaths.series,
  },
  {
    label: 'Аниме',
    path: routePaths.anime,
  },
] satisfies NavigationItem[];

export const secondaryNavigationItems = [
  {
    label: 'Избранное',
    path: routePaths.favorites,
  },
  {
    label: 'История',
    path: routePaths.history,
  },
] satisfies NavigationItem[];
