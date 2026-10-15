import type { MediaSummaryDto } from '@/entities/media';

export type RatingDto = {
  media: MediaSummaryDto;
  value: number;
  createdAt: string;
  updatedAt: string;
};

export type OwnRatingResponseDto = { rating: RatingDto | null };

export type RatingValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type RatingSummaryDto = {
  average: number | null;
  count: number;
  distribution: Record<`${RatingValue}`, number>;
};
