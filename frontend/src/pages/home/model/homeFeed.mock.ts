import type { MediaSummary } from '@/entities/media';
import type { HomeFeed } from './homeFeed';

const demoMedia = {
  featured: {
    mediaRef: 'demo:movie:dune-part-two',
    type: 'movie',
    title: 'Дюна: Часть вторая',
    originalTitle: 'Dune: Part Two',
    year: 2024,
    shortDescription:
      'Пол Атрейдес объединяется с фрименами и готовится отомстить заговорщикам, уничтожившим его семью.',
    poster: {
      url: 'https://placehold.co/600x900/29251f/f1f0ec?text=Dune',
      width: 600,
      height: 900,
    },
    backdrop: {
      url: '/images/demo/featured-desert-v1.png',
      width: 1664,
      height: 935,
    },
    genres: ['Фантастика', 'Драма', 'Приключения'],
    rating: {
      value: 8.2,
      scale: 10,
    },
  },
  severance: {
    mediaRef: 'demo:series:severance',
    type: 'series',
    title: 'Разделение',
    originalTitle: 'Severance',
    year: 2022,
    poster: {
      url: 'https://placehold.co/600x900/26282b/f1f0ec?text=Severance',
      width: 600,
      height: 900,
    },
    backdrop: {
      url: 'https://placehold.co/1600x900/26282b/f1f0ec?text=Severance',
      width: 1600,
      height: 900,
    },
    genres: ['Триллер', 'Драма'],
    rating: {
      value: 8.7,
      scale: 10,
    },
  },
  frieren: {
    mediaRef: 'demo:anime:frieren',
    type: 'anime',
    title: 'Провожающая в последний путь Фрирен',
    originalTitle: 'Sousou no Frieren',
    year: 2023,
    poster: {
      url: 'https://placehold.co/600x900/26302d/f1f0ec?text=Frieren',
      width: 600,
      height: 900,
    },
    backdrop: {
      url: 'https://placehold.co/1600x900/26302d/f1f0ec?text=Frieren',
      width: 1600,
      height: 900,
    },
    genres: ['Фэнтези', 'Драма', 'Приключения'],
    rating: {
      value: 9.0,
      scale: 10,
    },
  },
  oppenheimer: {
    mediaRef: 'demo:movie:oppenheimer',
    type: 'movie',
    title: 'Оппенгеймер',
    originalTitle: 'Oppenheimer',
    year: 2023,
    shortDescription: 'История физика Роберта Оппенгеймера и создания первой атомной бомбы.',
    poster: {
      url: 'https://placehold.co/600x900/302822/f1f0ec?text=Oppenheimer',
      width: 600,
      height: 900,
    },
    backdrop: {
      url: 'https://placehold.co/1600x900/302822/f1f0ec?text=Oppenheimer',
      width: 1600,
      height: 900,
    },
    genres: ['Биография', 'Драма', 'История'],
    rating: {
      value: 8.5,
      scale: 10,
    },
  },
  shogun: {
    mediaRef: 'demo:series:shogun',
    type: 'series',
    title: 'Сёгун',
    originalTitle: 'Shōgun',
    year: 2024,
    shortDescription:
      'Английский моряк оказывается в Японии на пороге масштабной борьбы за власть.',
    poster: {
      url: 'https://placehold.co/600x900/2c2925/f1f0ec?text=Shogun',
      width: 600,
      height: 900,
    },
    backdrop: {
      url: 'https://placehold.co/1600x900/2c2925/f1f0ec?text=Shogun',
      width: 1600,
      height: 900,
    },
    genres: ['Драма', 'История', 'Приключения'],
    rating: {
      value: 8.7,
      scale: 10,
    },
  },
  vinlandSaga: {
    mediaRef: 'demo:anime:vinland-saga',
    type: 'anime',
    title: 'Сага о Винланде',
    originalTitle: 'Vinland Saga',
    year: 2019,
    shortDescription:
      'Юный воин ищет мести, взрослея среди викингов и мечтая о мирной земле Винланд.',
    poster: {
      url: 'https://placehold.co/600x900/27302e/f1f0ec?text=Vinland+Saga',
      width: 600,
      height: 900,
    },
    backdrop: {
      url: 'https://placehold.co/1600x900/27302e/f1f0ec?text=Vinland+Saga',
      width: 1600,
      height: 900,
    },
    genres: ['Драма', 'История', 'Приключения'],
    rating: {
      value: 8.8,
      scale: 10,
    },
  },
} satisfies Record<string, MediaSummary>;

export const demoHomeFeed = {
  featured: demoMedia.featured,
  continueWatching: [
    {
      media: demoMedia.severance,
      progress: {
        positionSeconds: 1460,
        durationSeconds: 3120,
        updatedAt: '2026-08-11T18:30:00.000Z',
      },
    },
    {
      media: demoMedia.frieren,
      progress: {
        positionSeconds: 780,
        durationSeconds: 1440,
        updatedAt: '2026-08-10T20:15:00.000Z',
      },
    },
    {
      media: demoMedia.oppenheimer,
      progress: {
        positionSeconds: 3913,
        durationSeconds: 8880,
        updatedAt: '2026-08-09T19:40:00.000Z',
      },
    },
  ],
  collections: [
    {
      id: 'popular',
      title: 'Сейчас смотрят',
      items: [demoMedia.frieren, demoMedia.featured, demoMedia.severance],
    },
    {
      id: 'recommended',
      title: 'Вам может понравиться',
      items: [demoMedia.oppenheimer, demoMedia.shogun, demoMedia.vinlandSaga],
    },
  ],
} satisfies HomeFeed;
