import type { MediaSummaryDto } from './mediaSummaryDto';

export interface MediaSummaryResolutionResponseDto {
  items: MediaSummaryDto[];
  matches: Array<{ requestIndex: number; item: MediaSummaryDto }>;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
