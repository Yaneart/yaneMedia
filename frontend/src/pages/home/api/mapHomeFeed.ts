import { mapMediaSummary } from '@/entities/media';

import type {
  HomeCollection,
  HomeCollectionsPage,
  HomeFeatured,
  HomeFeed,
} from '../model/homeFeed';
import type { HomeCollectionsPageDto, HomeFeaturedDto, HomeFeedDto } from './homeFeedDto';

function mapHomeCollection(collection: HomeFeedDto['collections'][number]): HomeCollection {
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

export function mapHomeFeatured(dto: HomeFeaturedDto): HomeFeatured {
  return {
    ...dto,
    featured: mapMediaSummary(dto.featured),
  };
}

export function mapHomeCollectionsPage(dto: HomeCollectionsPageDto): HomeCollectionsPage {
  return {
    ...dto,
    collections: dto.collections.map(mapHomeCollection),
  };
}
