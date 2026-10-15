import type { MediaSummary } from '@/entities/media';

export type RatingValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Rating = {
  media: MediaSummary;
  value: RatingValue;
  createdAt: string;
  updatedAt: string;
};

export type RatingSummary = {
  average: number | null;
  count: number;
  distribution: Record<`${RatingValue}`, number>;
};
