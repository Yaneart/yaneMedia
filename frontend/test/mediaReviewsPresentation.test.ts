import { describe, expect, test } from 'bun:test';

import {
  createSpoilerExcerpt,
  formatMediaReviewDate,
  isReviewSort,
  mediaReviewSortOptions,
} from '../src/features/media-reviews/model/mediaReviewsPresentation';

describe('media review presentation', () => {
  test('accepts only the sorts supported by the media review endpoint', () => {
    expect(mediaReviewSortOptions.map(({ value }) => value)).toEqual([
      'new',
      'updated',
      'rating-high',
      'rating-low',
    ]);
    expect(isReviewSort('rating-high')).toBe(true);
    expect(isReviewSort('popular')).toBe(false);
    expect(isReviewSort(null)).toBe(false);
  });

  test('builds a unicode-safe spoiler excerpt only after reveal', () => {
    expect(createSpoilerExcerpt('  Текст со спойлером  ', 50)).toBe('Текст со спойлером');
    expect(createSpoilerExcerpt('😀😀😀', 2)).toBe('😀😀…');
  });

  test('formats valid dates and safely handles invalid input', () => {
    expect(formatMediaReviewDate('invalid')).toBe('Дата не указана');
    expect(formatMediaReviewDate('2026-10-14T10:00:00.000Z')).toContain('2026');
  });
});
