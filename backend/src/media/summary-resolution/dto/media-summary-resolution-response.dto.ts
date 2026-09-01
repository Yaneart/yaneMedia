import type { MediaSummaryDto } from '../../dto/media-summary.dto';

export class MediaSummaryResolutionResponseDto {
  items!: MediaSummaryDto[];
  partial!: boolean;
  degraded!: boolean;
  stale!: boolean;
}
