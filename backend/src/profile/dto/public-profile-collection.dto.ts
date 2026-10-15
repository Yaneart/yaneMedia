import type { MediaSummaryDto } from '../../media/dto/media-summary.dto';

export class CursorPageDto<T> {
  items!: T[];
  nextCursor!: string | null;
}

export class PublicRatingDto {
  media!: MediaSummaryDto;
  value!: number;
  createdAt!: string;
  updatedAt!: string;
}
