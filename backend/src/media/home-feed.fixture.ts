import { HomeCollectionDto, HomeContinueWatchingItemDto } from './dto/home-feed.dto';
import type { MediaSummaryDto } from './dto/media-summary.dto';

export const dune = {
  mediaRef: 'imdb:tt15239678',
  type: 'movie',
  title: 'Дюна: Часть вторая',
  originalTitle: 'Dune: Part Two',
  year: 2024,
  shortDescription:
    'Пол Атрейдес объединяется с фрименами и готовится отомстить заговорщикам, уничтожившим его семью.',
  genres: ['Фантастика', 'Драма', 'Приключения'],
  rating: {
    value: 8.2,
    scale: 10,
  },
} satisfies MediaSummaryDto;

const severance = {
  mediaRef: 'imdb:tt11280740',
  type: 'series',
  title: 'Разделение',
  originalTitle: 'Severance',
  year: 2022,
  genres: ['Триллер', 'Драма'],
  rating: {
    value: 8.7,
    scale: 10,
  },
} satisfies MediaSummaryDto;

const frieren = {
  mediaRef: 'anilist:154587',
  type: 'anime',
  title: 'Провожающая в последний путь Фрирен',
  originalTitle: 'Sousou no Frieren',
  year: 2023,
  genres: ['Фэнтези', 'Драма', 'Приключения'],
  rating: {
    value: 9,
    scale: 10,
  },
} satisfies MediaSummaryDto;

const shogun = {
  mediaRef: 'imdb:tt2788316',
  type: 'series',
  title: 'Сёгун',
  originalTitle: 'Shōgun',
  year: 2024,
  shortDescription: 'Английский моряк оказывается в Японии на пороге масштабной борьбы за власть.',
  genres: ['Драма', 'История', 'Приключения'],
  rating: {
    value: 8.7,
    scale: 10,
  },
} satisfies MediaSummaryDto;

const oppenheimer = {
  mediaRef: 'imdb:tt15398776',
  type: 'movie',
  title: 'Оппенгеймер',
  originalTitle: 'Oppenheimer',
  year: 2023,
  shortDescription: 'История физика Роберта Оппенгеймера и создания первой атомной бомбы.',
  genres: ['Биография', 'Драма', 'История'],
  rating: {
    value: 8.5,
    scale: 10,
  },
} satisfies MediaSummaryDto;

const vinlandSaga = {
  mediaRef: 'anilist:101348',
  type: 'anime',
  title: 'Сага о Винланде',
  originalTitle: 'Vinland Saga',
  year: 2019,
  shortDescription:
    'Юный воин ищет мести, взрослея среди викингов и мечтая о мирной земле Винланд.',
  genres: ['Драма', 'История', 'Приключения'],
  rating: {
    value: 8.8,
    scale: 10,
  },
} satisfies MediaSummaryDto;

export const homeContinueWatching = [
  {
    media: severance,
    progress: {
      positionSeconds: 1460,
      durationSeconds: 3120,
      updatedAt: '2026-08-11T18:30:00.000Z',
    },
  },
  {
    media: frieren,
    progress: {
      positionSeconds: 780,
      durationSeconds: 1440,
      updatedAt: '2026-08-10T20:15:00.000Z',
    },
  },
  {
    media: oppenheimer,
    progress: {
      positionSeconds: 3913,
      durationSeconds: 8880,
      updatedAt: '2026-08-09T19:40:00.000Z',
    },
  },
] satisfies HomeContinueWatchingItemDto[];

export const homeCollections = [
  {
    id: 'popular',
    title: 'Сейчас смотрят',
    items: [frieren, dune, severance],
  },
  {
    id: 'recommended',
    title: 'Вам может понравиться',
    items: [oppenheimer, shogun, vinlandSaga],
  },
] satisfies HomeCollectionDto[];

export const homeFeaturedCandidates = [
  dune,
  severance,
  frieren,
  shogun,
] satisfies MediaSummaryDto[];
