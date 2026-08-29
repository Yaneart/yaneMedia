import { mapMediaSummary } from '@/entities/media';

import type { HomeFeed } from '../model/homeFeed';
import type { HomeFeedDto } from './homeFeedDto';

export function mapHomeFeed(dto: HomeFeedDto): HomeFeed {
  return {
    featured: mapMediaSummary(dto.featured),
    featuredExpiresAt: dto.featuredExpiresAt,
    continueWatching: dto.continueWatching.map((item) => ({
      media: mapMediaSummary(item.media),
      progress: {
        positionSeconds: item.progress.positionSeconds,
        durationSeconds: item.progress.durationSeconds,
        updatedAt: item.progress.updatedAt,
      },
    })),
    collections: dto.collections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      items: collection.items.map((item) => mapMediaSummary(item)),
    })),
  };
}
