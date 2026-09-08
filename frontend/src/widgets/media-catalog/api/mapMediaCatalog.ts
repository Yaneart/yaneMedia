import { mapMediaSummary } from '@/entities/media';

import type { MediaCatalogResult } from '../model/mediaCatalog';
import type { MediaCatalogResponseDto } from './mediaCatalogDto';

export function mapMediaCatalog(dto: MediaCatalogResponseDto): MediaCatalogResult {
  const items = dto.items.map(mapMediaSummary);
  const itemsByMediaRef = new Map(items.map((item) => [item.mediaRef, item]));

  return {
    items,
    collections: dto.collections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      items: collection.mediaRefs.flatMap((mediaRef) => {
        const item = itemsByMediaRef.get(mediaRef);

        return item ? [item] : [];
      }),
    })),
    partial: dto.partial,
    degraded: dto.degraded,
    stale: dto.stale,
  };
}
