import type { MediaSummaryDto } from '../../dto/media-summary.dto';

export class MediaCollectionResponseDto {
  items!: MediaSummaryDto[];
  total!: number;
  offset!: number;
  limit!: number;
  partial!: boolean;
  degraded!: boolean;
  stale!: boolean;
}
