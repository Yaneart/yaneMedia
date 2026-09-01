import { mapMediaSummary } from '@/entities/media';

import type { MediaCatalogResult } from '../model/mediaCatalog';
import type { MediaCatalogResponseDto } from './mediaCatalogDto';

export function mapMediaCatalog(dto: MediaCatalogResponseDto): MediaCatalogResult {
  return {
    items: dto.items.map(mapMediaSummary),
    partial: dto.partial,
    degraded: dto.degraded,
    stale: dto.stale,
  };
}
