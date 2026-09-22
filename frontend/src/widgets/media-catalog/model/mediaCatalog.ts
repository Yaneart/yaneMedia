import type { MediaSummary } from '@/entities/media';

export interface MediaCatalogCollection {
  id: string;
  title: string;
  items: MediaSummary[];
}

export interface MediaCatalogResult {
  items: MediaSummary[];
  collections: MediaCatalogCollection[];
  total: number;
  nextOffset: number;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}

export interface MediaCatalogPage extends MediaCatalogResult {
  offset: number;
  limit: number;
}
