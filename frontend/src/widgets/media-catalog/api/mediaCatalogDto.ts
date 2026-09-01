import type { MediaSummaryDto } from '@/entities/media';

export interface MediaCatalogResponseDto {
  items: MediaSummaryDto[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
