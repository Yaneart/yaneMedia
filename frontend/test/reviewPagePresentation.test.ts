import { describe, expect, test } from 'bun:test';

import {
  formatReviewCommentCount,
  formatReviewPageDate,
  wasReviewEdited,
} from '../src/pages/review/model/reviewPagePresentation';

describe('review page presentation', () => {
  test('formats valid dates and safely handles invalid values', () => {
    expect(formatReviewPageDate('2026-10-14T10:00:00.000Z')).toContain('2026');
    expect(formatReviewPageDate('invalid')).toBe('Дата не указана');
  });

  test('marks a review as edited only when the update is later than publication', () => {
    expect(wasReviewEdited('2026-10-14T10:00:00.000Z', '2026-10-14T10:01:00.000Z')).toBe(true);
    expect(wasReviewEdited('2026-10-14T10:00:00.000Z', '2026-10-14T10:00:00.000Z')).toBe(false);
    expect(wasReviewEdited('invalid', '2026-10-14T10:01:00.000Z')).toBe(false);
  });

  test('uses Russian comment plurals', () => {
    expect(formatReviewCommentCount(1)).toBe('1 комментарий');
    expect(formatReviewCommentCount(3)).toBe('3 комментария');
    expect(formatReviewCommentCount(12)).toBe('12 комментариев');
    expect(formatReviewCommentCount(21)).toBe('21 комментарий');
  });
});
