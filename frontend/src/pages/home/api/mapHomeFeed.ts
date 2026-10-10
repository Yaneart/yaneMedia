import { mapMediaSummary } from '@/entities/media';

import type { HomeCollection, HomeFeed } from '../model/homeFeed';
import type { HomeCollectionDto, HomeFeedDto } from './homeFeedDto';

function mapHomeCollection(collection: HomeCollectionDto): HomeCollection {
  return {
    id: collection.id,
    title: collection.title,
    items: collection.items.map((item) => mapMediaSummary(item)),
    total: collection.total,
  };
}

export function mapHomeFeed(dto: HomeFeedDto): HomeFeed {
  return {
    featured: mapMediaSummary(dto.featured),
    featuredExpiresAt: dto.featuredExpiresAt,
    collections: dto.collections.map(mapHomeCollection),
    partial: dto.partial,
    degraded: dto.degraded,
    stale: dto.stale,
  };
}
