import type { MediaSummaryDto } from '../../dto/media-summary.dto';

export class MediaSummaryResolutionMatchDto {
  requestIndex!: number;
  item!: MediaSummaryDto;
}

export class MediaSummaryResolutionResponseDto {
  items!: MediaSummaryDto[];
  matches!: MediaSummaryResolutionMatchDto[];
  partial!: boolean;
  degraded!: boolean;
  stale!: boolean;
}
