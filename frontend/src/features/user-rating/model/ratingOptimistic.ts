import type { InfiniteData } from '@tanstack/react-query';

import type { MediaSummary } from '@/entities/media';
import type { ProfileRatingPage } from '@/entities/profile';
import type { Rating, RatingSummary, RatingValue } from '@/entities/rating';

export type RatingChange = {
  media: MediaSummary;
  previous: Rating | null;
  nextValue: RatingValue | null;
  changedAt: string;
};

export function createOptimisticRating(change: RatingChange): Rating | null {
  if (change.nextValue === null) return null;

  return {
    media: change.media,
    value: change.nextValue,
    createdAt: change.previous?.createdAt ?? change.changedAt,
    updatedAt: change.changedAt,
  };
}

export function applyRatingSummaryChange(
  summary: RatingSummary | undefined,
  previousValue: RatingValue | null,
  nextValue: RatingValue | null,
): RatingSummary | undefined {
  if (!summary || previousValue === nextValue) return summary;

  const distribution = { ...summary.distribution };
  if (previousValue !== null) distribution[previousValue] -= 1;
  if (nextValue !== null) distribution[nextValue] += 1;

  const count = summary.count + (previousValue === null ? 1 : 0) - (nextValue === null ? 1 : 0);
  const previousTotal = (summary.average ?? 0) * summary.count;
  const total = previousTotal - (previousValue ?? 0) + (nextValue ?? 0);

  return { average: count === 0 ? null : total / count, count, distribution };
}

export function applyRatingPageChange(
  data: InfiniteData<ProfileRatingPage> | undefined,
  rating: Rating | null,
  media: MediaSummary,
): InfiniteData<ProfileRatingPage> | undefined {
  if (!data || data.pages.length === 0) return data;

  let found = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.flatMap((item) => {
      if (item.media.mediaRef !== media.mediaRef) return [item];
      found = true;
      return rating ? [{ ...rating, media }] : [];
    }),
  }));

  if (rating && !found) {
    pages[0] = { ...pages[0], items: [{ ...rating, media }, ...pages[0].items] };
  }

  return { ...data, pages };
}
