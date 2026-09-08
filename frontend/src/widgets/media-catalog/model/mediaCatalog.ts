import type { MediaSummary } from '@/entities/media';

export interface MediaCatalogCollection {
  id: string;
  title: string;
  items: MediaSummary[];
}

export interface MediaCatalogResult {
  items: MediaSummary[];
  collections: MediaCatalogCollection[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
