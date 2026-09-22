import type { MediaSummaryDto } from '@/entities/media';

export interface MediaCatalogCollectionDto {
  id: string;
  title: string;
  mediaRefs: string[];
}

export interface MediaCatalogResponseDto {
  items: MediaSummaryDto[];
  collections: MediaCatalogCollectionDto[];
  offset: number;
  limit: number;
  total: number;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
