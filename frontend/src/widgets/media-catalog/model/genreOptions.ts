import type { MediaType } from '@/entities/media';
import type { SelectOption } from '@/shared';

const movieGenreOptions = [
  { value: 'Biography', label: 'Биография' },
  { value: 'Action', label: 'Боевик' },
  { value: 'War', label: 'Военный' },
  { value: 'Western', label: 'Вестерн' },
  { value: 'Mystery', label: 'Детектив' },
  { value: 'Documentary', label: 'Документальный' },
  { value: 'Drama', label: 'Драма' },
  { value: 'History', label: 'Исторический' },
  { value: 'Comedy', label: 'Комедия' },
  { value: 'Crime', label: 'Криминал' },
  { value: 'Romance', label: 'Мелодрама' },
  { value: 'Animation', label: 'Мультфильм' },
  { value: 'Adventure', label: 'Приключения' },
  { value: 'Family', label: 'Семейный' },
  { value: 'Sport', label: 'Спорт' },
  { value: 'Thriller', label: 'Триллер' },
  { value: 'Horror', label: 'Ужасы' },
  { value: 'Sci-Fi', label: 'Фантастика' },
  { value: 'Fantasy', label: 'Фэнтези' },
] as const satisfies readonly SelectOption[];

const seriesGenreOptions = [
  ...movieGenreOptions,
  { value: 'Game-Show', label: 'Игровое шоу' },
  { value: 'Reality-TV', label: 'Реалити-шоу' },
  { value: 'Talk-Show', label: 'Ток-шоу' },
].toSorted((first, second) => first.label.localeCompare(second.label, 'ru'));

const animeGenreOptions = [
  { value: 'Action', label: 'Боевик' },
  { value: 'Mystery', label: 'Детектив' },
  { value: 'Drama', label: 'Драма' },
  { value: 'Comedy', label: 'Комедия' },
  { value: 'Mecha', label: 'Меха' },
  { value: 'Music', label: 'Музыка' },
  { value: 'Slice of Life', label: 'Повседневность' },
  { value: 'Adventure', label: 'Приключения' },
  { value: 'Psychological', label: 'Психологическое' },
  { value: 'Romance', label: 'Романтика' },
  { value: 'Sports', label: 'Спорт' },
  { value: 'Supernatural', label: 'Сверхъестественное' },
  { value: 'Thriller', label: 'Триллер' },
  { value: 'Horror', label: 'Ужасы' },
  { value: 'Sci-Fi', label: 'Фантастика' },
  { value: 'Fantasy', label: 'Фэнтези' },
  { value: 'Ecchi', label: 'Этти' },
] as const satisfies readonly SelectOption[];

export function getGenreOptions(type: MediaType): readonly SelectOption[] {
  if (type === 'anime') {
    return animeGenreOptions;
  }

  return type === 'series' ? seriesGenreOptions : movieGenreOptions;
}
