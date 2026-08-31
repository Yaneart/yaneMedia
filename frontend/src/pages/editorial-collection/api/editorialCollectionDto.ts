import type { MediaSummaryDto } from '@/entities/media';

export interface EditorialCollectionDto {
  items: MediaSummaryDto[];
  total: number;
  offset: number;
  limit: number;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
