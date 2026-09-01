import type { MediaSummary } from '@/entities/media';

export interface MediaCatalogResult {
  items: MediaSummary[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
