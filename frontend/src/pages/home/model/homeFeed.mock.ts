import { demoMedia } from '@/entities/media';
import type { HomeFeed } from './homeFeed';

export const demoFeaturedCandidates = [
  demoMedia.featured,
  demoMedia.severance,
  demoMedia.frieren,
  demoMedia.shogun,
] as const;

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
    {
      media: demoMedia.vinlandSaga,
      progress: {
        positionSeconds: 1080,
        durationSeconds: 1440,
        updatedAt: '2026-08-08T17:10:00.000Z',
      },
    },
    {
      media: demoMedia.featured,
      progress: {
        positionSeconds: 4680,
        durationSeconds: 9960,
        updatedAt: '2026-08-07T21:25:00.000Z',
      },
    },
    {
      media: demoMedia.shogun,
      progress: {
        positionSeconds: 2140,
        durationSeconds: 3600,
        updatedAt: '2026-08-06T18:45:00.000Z',
      },
    },
  ],
  collections: [
    {
      id: 'popular',
      title: 'Сейчас смотрят',
      items: [
        demoMedia.silentSphere,
        demoMedia.horizonAshes,
        demoMedia.quietLands,
        demoMedia.lastSignal,
        demoMedia.cityOnWater,
      ],
    },
    {
      id: 'recommended',
      title: 'Вам может понравиться',
      items: [
        demoMedia.northernArchive,
        demoMedia.secondShore,
        demoMedia.zeroHour,
        demoMedia.glassGarden,
        demoMedia.beyondIce,
        demoMedia.redGate,
      ],
    },
  ],
} satisfies HomeFeed;
