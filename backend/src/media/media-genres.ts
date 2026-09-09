import type { MediaType } from '@media-engine/core';

const translatedGenreByKey: Readonly<Record<string, string>> = {
  action: 'боевик',
  adventure: 'приключения',
  animation: 'мультфильм',
  biography: 'биография',
  cars: 'машины',
  comedy: 'комедия',
  crime: 'криминал',
  dementia: 'безумие',
  demons: 'демоны',
  documentary: 'документальный',
  drama: 'драма',
  ecchi: 'этти',
  erotica: 'эротика',
  family: 'семейный',
  fantasy: 'фэнтези',
  'film-noir': 'фильм-нуар',
  game: 'игры',
  'game-show': 'игровое шоу',
  gourmet: 'гурман',
  harem: 'гарем',
  hentai: 'хентай',
  historical: 'исторический',
  history: 'история',
  horror: 'ужасы',
  josei: 'дзёсей',
  kids: 'детское',
  magic: 'магия',
  'mahou shoujo': 'махо-сёдзё',
  'martial arts': 'боевые искусства',
  mecha: 'меха',
  military: 'военное',
  music: 'музыка',
  musical: 'мюзикл',
  mystery: 'детектив',
  news: 'новости',
  parody: 'пародия',
  police: 'полиция',
  psychological: 'психологическое',
  'reality-tv': 'реалити-шоу',
  romance: 'мелодрама',
  samurai: 'самураи',
  school: 'школа',
  seinen: 'сэйнэн',
  shoujo: 'сёдзё',
  'shoujo ai': 'сёдзё-ай',
  shounen: 'сёнен',
  'shounen ai': 'сёнен-ай',
  short: 'короткометражный',
  'sci-fi': 'фантастика',
  'science fiction': 'фантастика',
  'slice of life': 'повседневность',
  space: 'космос',
  sport: 'спорт',
  sports: 'спорт',
  'super power': 'суперсила',
  supernatural: 'сверхъестественное',
  'talk-show': 'ток-шоу',
  thriller: 'триллер',
  vampire: 'вампиры',
  war: 'военный',
  western: 'вестерн',
  'work life': 'работа',
  yaoi: 'яой',
  yuri: 'юри',
};

const russianGenreAliases: Readonly<Record<string, string>> = {
  анимация: 'мультфильм',
  экшен: 'боевик',
  'научная фантастика': 'фантастика',
  'супер сила': 'суперсила',
};

const cyrillicLetterPattern = /\p{Script=Cyrillic}/u;
const latinLetterPattern = /\p{Script=Latin}/u;

function normalizeGenreKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/[‐‑–—]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

function localizeGenre(value: string, type: MediaType): string | undefined {
  const key = normalizeGenreKey(value);

  if (!key) {
    return undefined;
  }

  if (key === 'romance' || key === 'мелодрама' || key === 'романтика') {
    return type === 'anime' ? 'романтика' : 'мелодрама';
  }

  const translated = translatedGenreByKey[key] ?? russianGenreAliases[key];

  if (translated) {
    return translated;
  }

  return cyrillicLetterPattern.test(key) && !latinLetterPattern.test(key) ? key : undefined;
}

export function normalizeMediaGenres(
  values: readonly string[] | undefined,
  type: MediaType,
): string[] {
  const genres = new Set<string>();

  for (const value of values ?? []) {
    const genre = localizeGenre(value, type);

    if (genre) {
      genres.add(genre);
    }
  }

  return [...genres];
}
