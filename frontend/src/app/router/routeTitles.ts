import { routePaths } from './routes';

const documentTitles: Record<string, string> = {
  [routePaths.home]: 'Главная',
  [routePaths.search]: 'Поиск',
  [routePaths.movies]: 'Фильмы',
  [routePaths.series]: 'Сериалы',
  [routePaths.anime]: 'Аниме',
  [routePaths.editorialPicks]: 'Выбор редакции',
  [routePaths.favorites]: 'Избранное',
  [routePaths.history]: 'История',
  [routePaths.login]: 'Вход',
  [routePaths.register]: 'Регистрация',
  [routePaths.verifyEmail]: 'Подтверждение почты',
};

export function getDocumentTitle(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, '') || routePaths.home;
  const pageTitle = normalizedPathname.startsWith('/media/')
    ? 'Произведение'
    : (documentTitles[normalizedPathname] ?? 'Страница не найдена');

  return `${pageTitle} — yaneMedia`;
}
