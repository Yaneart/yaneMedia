import { demoMedia } from '@/entities/media';
import type { HomeFeed } from './homeFeed';

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
