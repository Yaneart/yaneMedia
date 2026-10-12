import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import type { MediaSummaryDto } from '../../media/dto/media-summary.dto';
import { MEDIA_REF_PATTERN } from '../../media/media-ref';

export class RatingMediaRefDto {
  @IsString()
  @Matches(MEDIA_REF_PATTERN)
  mediaRef!: string;
}

export class UpsertRatingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  value!: number;
}

export class RatingDto {
  media!: MediaSummaryDto;
  value!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class OwnRatingResponseDto {
  rating!: RatingDto | null;
}

export type RatingValue = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export class RatingSummaryDto {
  average!: number | null;
  count!: number;
  distribution!: Record<RatingValue, number>;
}
