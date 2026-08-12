import {
  AnimeIcon,
  AnimeFilledIcon,
  FavoriteIcon,
  FavoriteFilledIcon,
  HistoryIcon,
  HistoryFilledIcon,
  HomeIcon,
  HomeFilledIcon,
  MoviesIcon,
  MoviesFilledIcon,
  SearchIcon,
  SearchFilledIcon,
  SeriesIcon,
  SeriesFilledIcon,
  type IconProps,
} from '@/shared';
import type { ComponentType } from 'react';
import { routePaths } from './routes';

export type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  activeIcon: ComponentType<IconProps>;
};

export const primaryNavigationItems = [
  {
    label: 'Главная',
    path: routePaths.home,
    icon: HomeIcon,
    activeIcon: HomeFilledIcon,
  },
  {
    label: 'Поиск',
    path: routePaths.search,
    icon: SearchIcon,
    activeIcon: SearchFilledIcon,
  },
  {
    label: 'Фильмы',
    path: routePaths.movies,
    icon: MoviesIcon,
    activeIcon: MoviesFilledIcon,
  },
  {
    label: 'Сериалы',
    path: routePaths.series,
    icon: SeriesIcon,
    activeIcon: SeriesFilledIcon,
  },
  {
    label: 'Аниме',
    path: routePaths.anime,
    icon: AnimeIcon,
    activeIcon: AnimeFilledIcon,
  },
] satisfies NavigationItem[];

export const secondaryNavigationItems = [
  {
    label: 'Избранное',
    path: routePaths.favorites,
    icon: FavoriteIcon,
    activeIcon: FavoriteFilledIcon,
  },
  {
    label: 'История',
    path: routePaths.history,
    icon: HistoryIcon,
    activeIcon: HistoryFilledIcon,
  },
] satisfies NavigationItem[];
