import type { MediaSummaryDto } from './mediaSummaryDto';

export interface MediaSummaryResolutionResponseDto {
  items: MediaSummaryDto[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
