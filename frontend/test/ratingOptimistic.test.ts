import { describe, expect, test } from 'bun:test';

import type { MediaSummary } from '../src/entities/media';
import type { RatingSummary } from '../src/entities/rating';
import {
  applyRatingPageChange,
  applyRatingSummaryChange,
  createOptimisticRating,
} from '../src/features/user-rating/model/ratingOptimistic';

const media = {
  mediaRef: 'work_00000000-0000-4000-8000-000000000001',
  slug: 'film',
  type: 'movie',
  title: 'Film',
  genres: [],
} as MediaSummary;

const emptyDistribution = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [String(index + 1), 0]),
) as RatingSummary['distribution'];

describe('optimistic user ratings', () => {
  test('updates aggregate values for create, replace and delete', () => {
    const initial = { average: null, count: 0, distribution: emptyDistribution };
    const created = applyRatingSummaryChange(initial, null, 8)!;
    expect(created).toMatchObject({ average: 8, count: 1 });
    expect(created.distribution['8']).toBe(1);

    const replaced = applyRatingSummaryChange(created, 8, 10)!;
    expect(replaced).toMatchObject({ average: 10, count: 1 });
    expect(replaced.distribution['8']).toBe(0);
    expect(replaced.distribution['10']).toBe(1);

    expect(applyRatingSummaryChange(replaced, 10, null)).toMatchObject({ average: null, count: 0 });
  });

  test('inserts, replaces and removes a rating without discarding loaded pages', () => {
    const first = createOptimisticRating({
      media,
      previous: null,
      nextValue: 7,
      changedAt: '2026-10-14T10:00:00.000Z',
    })!;
    const data = { pages: [{ items: [], nextCursor: 'next' }], pageParams: [null] };
    const inserted = applyRatingPageChange(data, first, media)!;
    expect(inserted.pages[0].items).toEqual([first]);
    expect(inserted.pages[0].nextCursor).toBe('next');
    expect(applyRatingPageChange(inserted, null, media)?.pages[0].items).toEqual([]);
  });
});
