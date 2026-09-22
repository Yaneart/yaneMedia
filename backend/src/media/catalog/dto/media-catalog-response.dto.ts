import type { MediaSummaryDto } from '../../dto/media-summary.dto';

export class MediaCatalogCollectionDto {
  id!: string;
  title!: string;
  mediaRefs!: string[];
}

export class MediaCatalogResponseDto {
  items!: MediaSummaryDto[];
  collections!: MediaCatalogCollectionDto[];
  offset?: number;
  limit?: number;
  total?: number;
  partial!: boolean;
  degraded!: boolean;
  stale!: boolean;
}
