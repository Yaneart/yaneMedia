import { mapMediaSummary } from '@/entities/media';

import type { HomeFeed } from '../model/homeFeed';
import type { HomeFeedDto } from './homeFeedDto';

export function mapHomeFeed(dto: HomeFeedDto): HomeFeed {
  return {
    featured: mapMediaSummary(dto.featured),
    featuredExpiresAt: dto.featuredExpiresAt,
    collections: dto.collections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      items: collection.items.map((item) => mapMediaSummary(item)),
      total: collection.total,
    })),
    partial: dto.partial,
    degraded: dto.degraded,
    stale: dto.stale,
  };
}
