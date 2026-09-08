import type { MediaSummaryDto } from '@/entities/media';

export interface MediaCatalogCollectionDto {
  id: string;
  title: string;
  mediaRefs: string[];
}

export interface MediaCatalogResponseDto {
  items: MediaSummaryDto[];
  collections: MediaCatalogCollectionDto[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
