import type { MediaSummaryDto } from '../../dto/media-summary.dto';

export class MediaCatalogResponseDto {
  items!: MediaSummaryDto[];
  partial!: boolean;
  degraded!: boolean;
  stale!: boolean;
}
