import { describe, expect, test } from 'bun:test';

import type { ReviewComment } from '../src/entities/review-comment';
import {
  appendReviewComment,
  mergeReviewComments,
  normalizeCommentBody,
  removeReviewComment,
  replaceReviewComment,
  validateCommentBody,
  wasCommentEdited,
} from '../src/features/review-discussion/model/reviewDiscussion';

function comment(commentId: string, createdAt: string, updatedAt = createdAt): ReviewComment {
  return {
    commentId,
    author: { state: 'deleted', label: 'Удалённый пользователь' },
    body: commentId,
    createdAt,
    updatedAt,
    viewerActions: { canEdit: false, canDelete: false, canReport: false, canModerate: false },
  };
}

describe('review discussion model', () => {
  test('normalizes like the server and validates plain-text limits', () => {
    expect(normalizeCommentBody('  Первая  строка \r\n\r\n\r\n Вторая  ')).toBe(
      'Первая строка\n\nВторая',
    );
    expect(validateCommentBody('   ')).toBe('Напишите комментарий.');
    expect(validateCommentBody('<b>нет</b>')).toContain('угловых скобок');
    expect(validateCommentBody('а'.repeat(2001))).toContain('2000');
    expect(validateCommentBody('Обычный текст')).toBeNull();
  });

  test('merges pages without duplicates and keeps chronological order', () => {
    const first = comment('comment_b', '2026-10-15T10:01:00.000Z');
    const second = comment('comment_a', '2026-10-15T10:00:00.000Z');
    expect(
      mergeReviewComments([
        { items: [first], nextCursor: 'next', newerCursor: 'tail-1' },
        { items: [second, first], nextCursor: null, newerCursor: 'tail-2' },
      ]).map((item) => item.commentId),
    ).toEqual(['comment_a', 'comment_b']);
  });

  test('marks only a later valid update as edited', () => {
    expect(
      wasCommentEdited(
        comment('comment_a', '2026-10-15T10:00:00.000Z', '2026-10-15T10:01:00.000Z'),
      ),
    ).toBe(true);
    expect(wasCommentEdited(comment('comment_b', '2026-10-15T10:00:00.000Z'))).toBe(false);
  });

  test('appends predictably and scrubs deleted bodies from every cached page', () => {
    const first = comment('comment_a', '2026-10-15T10:00:00.000Z');
    const second = comment('comment_b', '2026-10-15T10:01:00.000Z');
    const pages = [
      { items: [first], nextCursor: 'next', newerCursor: 'tail-1' },
      { items: [second], nextCursor: null, newerCursor: 'tail-2' },
    ];
    const created = comment('comment_c', '2026-10-15T10:02:00.000Z');
    const appended = appendReviewComment(pages, created);
    expect(appended[0]?.items).toEqual([first]);
    expect(appended[1]?.items).toEqual([second, created]);

    const updated = { ...first, body: 'Новая версия' };
    expect(replaceReviewComment(appended, updated)[0]?.items[0]?.body).toBe('Новая версия');

    const removed = removeReviewComment(appended, first.commentId);
    expect(removed.flatMap((page) => page.items).some((item) => item.body === first.body)).toBe(
      false,
    );
  });
});
