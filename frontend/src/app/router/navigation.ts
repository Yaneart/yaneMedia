import {
  AnimeIcon,
  FavoriteIcon,
  HistoryIcon,
  HomeIcon,
  MoviesIcon,
  SearchIcon,
  SeriesIcon,
  type IconProps,
} from '@/shared';
import type { ComponentType } from 'react';
import { routePaths } from './routes';

export type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
};

export const primaryNavigationItems = [
  {
    label: 'Главная',
    path: routePaths.home,
    icon: HomeIcon,
  },
  {
    label: 'Поиск',
    path: routePaths.search,
    icon: SearchIcon,
  },
  {
    label: 'Фильмы',
    path: routePaths.movies,
    icon: MoviesIcon,
  },
  {
    label: 'Сериалы',
    path: routePaths.series,
    icon: SeriesIcon,
  },
  {
    label: 'Аниме',
    path: routePaths.anime,
    icon: AnimeIcon,
  },
] satisfies NavigationItem[];

export const secondaryNavigationItems = [
  {
    label: 'Избранное',
    path: routePaths.favorites,
    icon: FavoriteIcon,
  },
  {
    label: 'История',
    path: routePaths.history,
    icon: HistoryIcon,
  },
] satisfies NavigationItem[];
