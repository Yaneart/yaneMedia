import { mapMediaSummary } from '@/entities/media';

import type { HomeCollection, HomeCollectionsPage, HomeFeatured } from '../model/homeFeed';
import type { HomeCollectionDto, HomeCollectionsPageDto, HomeFeaturedDto } from './homeFeedDto';

function mapHomeCollection(collection: HomeCollectionDto): HomeCollection {
  return {
    id: collection.id,
    title: collection.title,
    items: collection.items.map((item) => mapMediaSummary(item)),
    total: collection.total,
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
